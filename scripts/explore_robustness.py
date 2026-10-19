#!/usr/bin/env python
"""Exploración previa de la robustez de las métricas propias (semana 12).

Dos preguntas complementarias:

  A. Entre redes. ¿Cambian las conclusiones al pasar de una red a otra?
     A1. Anidamiento: ¿qué fracción de los pares TF-operón de una red está en otra?
     A2. Estabilidad del orden de los genomas: Spearman de cada métrica entre pares de redes.
     A3. Experimento controlado: validated frente a no-footprint (mismo umbral y tier;
         solo cambia el footprinting). ¿Cuánto cambia cada métrica?
     A4. ¿El taxón explica lo mismo en todas las redes? (épsilon² de comparison-atlas)

  B. Submuestreo de aristas (el prototipo de Robustness.jsx). Se eliminan aristas de
     cada genoma y se recalculan las métricas, simulando una red incompleta:
       - tasas 10, 25, 50 y 75 %;
       - estrategias: random (uniforme), degree_biased (más probable eliminar aristas de
         los TF con más dianas) y low_confidence (se eliminan las de menor confidence,
         equivalente a subir el umbral).
     Para cada métrica: retención (valor submuestreado / original, mediana por genoma) y
     Spearman entre el valor original y el submuestreado entre genomas (¿se conserva el orden?).
     En la exploración se usa una muestra de genomas para fijar tasas, réplicas y umbrales.

Uso (desde ~/proyecto, después de make metrics-atlas y make comparison-atlas):
    PYTHONPATH=. python scripts/explore_robustness.py [--sample 300] [--replicates 5]
Salidas:
    data/audit/robustness_nesting.tsv
    data/audit/robustness_rank_between_networks.tsv
    data/audit/robustness_footprint.tsv
    data/audit/robustness_subsampling.tsv
"""
import argparse
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats

from src.networks.atlas_metrics import NETWORKS, genome_metrics, load_genes, load_pairs

METRICS = Path("data/results/metrics/atlas_metrics.parquet")
TESTS = Path("data/results/comparison/taxon_tests.tsv")
OUT = Path("data/audit")
# Métricas que se comparan (no las de cota inferior por nombre)
KEYS = ["n_tf", "n_targets", "n_edges", "density", "edges_per_tf", "frac_multi_reg", "frac_genome_targeted",
        "frac_largest", "mean_out_degree", "max_out_degree", "mean_in_degree", "out_degree_entropy",
        "out_degree_gini", "hub_share", "n_components"]
RATES = [0.10, 0.25, 0.50, 0.75]
STRATEGIES = ["random", "degree_biased", "low_confidence"]


def pairs_with_conf(net_id):
    """Pares (genome_id, tf, operon_id) con su confidence máxima (misma regla que atlas_metrics)."""
    from src.networks.atlas_metrics import KEY, load, norm
    e = load(f"edges_net{net_id}", ["genome_id", "tf_name", "target_operon", "confidence"])
    e = e.rename(columns={"target_operon": "operon_id"})
    e["genome_id"] = e["genome_id"].astype("int64")
    e["operon_id"] = e["operon_id"].astype("int64")
    e["tf"] = norm(e["tf_name"])
    e = e.dropna(subset=["tf"]).sort_values("confidence", ascending=False, kind="mergesort")
    return e.drop_duplicates(KEY)[KEY + ["confidence"]].reset_index(drop=True)


def part_a(m):
    atlas = m[m["in_atlas"]]
    # A1. Anidamiento
    print("== A1. Fracción de los pares de la red de la fila contenidos en la red de la columna ==")
    keys = {}
    for net_id in NETWORKS:
        p, _ = load_pairs(net_id)
        keys[net_id] = pd.MultiIndex.from_frame(p)
    rows = []
    for a in NETWORKS:
        for b in NETWORKS:
            rows.append({"from": NETWORKS[a], "to": NETWORKS[b], "pairs_from": len(keys[a]),
                         "share_in_to": float(keys[a].isin(keys[b]).mean())})
    nest = pd.DataFrame(rows)
    nest.to_csv(OUT / "robustness_nesting.tsv", sep="\t", index=False)
    print(nest.pivot(index="from", columns="to", values="share_in_to")
          .reindex(index=NETWORKS.values(), columns=NETWORKS.values()).to_string(float_format=lambda x: f"{x:.3f}"))

    # A2. Orden de los genomas entre redes
    rows = []
    wide = atlas[atlas["has_edges"]].pivot(index="genome_id", columns="network_id", values=KEYS)
    for metric in KEYS:
        for a in NETWORKS:
            for b in NETWORKS:
                if a >= b:
                    continue
                x, y = wide[(metric, a)], wide[(metric, b)]
                ok = x.notna() & y.notna()
                rows.append({"metric": metric, "a": NETWORKS[a], "b": NETWORKS[b], "genomes": int(ok.sum()),
                             "spearman": stats.spearmanr(x[ok], y[ok]).statistic if ok.sum() > 10 else np.nan})
    rank = pd.DataFrame(rows)
    rank.to_csv(OUT / "robustness_rank_between_networks.tsv", sep="\t", index=False)
    print("\n== A2. Spearman del valor por genoma entre redes (mediana de los 10 pares; mínimo) ==")
    print(rank.groupby("metric")["spearman"].agg(["median", "min"]).reindex(KEYS)
          .to_string(float_format=lambda x: f"{x:.3f}"))
    print("\nbalanced frente a cada red (n_edges, frac_multi_reg, out_degree_gini):")
    sel = rank[(rank["a"].eq("balanced") | rank["b"].eq("balanced"))
               & rank["metric"].isin(["n_edges", "frac_multi_reg", "out_degree_gini"])]
    print(sel.to_string(index=False, float_format=lambda x: f"{x:.3f}"))

    # A3. Footprinting: validated (1) vs no-footprint (5), mismos genomas
    w = atlas[atlas["has_edges"] & atlas["network_id"].isin([1, 5])].pivot(
        index="genome_id", columns="network_id", values=KEYS).dropna()
    rows = []
    for metric in KEYS:
        v, n = w[(metric, 1)].astype(float), w[(metric, 5)].astype(float)
        ratio = (v / n.replace(0, np.nan)).median()
        rows.append({"metric": metric, "genomes": len(w), "median_validated": v.median(),
                     "median_no_footprint": n.median(), "median_ratio": ratio,
                     "wilcoxon_p": stats.wilcoxon(v, n).pvalue if (v != n).any() else np.nan,
                     "spearman": stats.spearmanr(v, n).statistic})
    fp = pd.DataFrame(rows)
    fp.to_csv(OUT / "robustness_footprint.tsv", sep="\t", index=False)
    print(f"\n== A3. validated / no-footprint ({len(w)} genomas con aristas en ambas) ==")
    print(fp.to_string(index=False, float_format=lambda x: f"{x:.3g}"))

    # A4. épsilon² por red
    if TESTS.exists():
        t = pd.read_csv(TESTS, sep="\t")
        t = t[t["metric"].isin(["n_tf", "n_edges", "max_out_degree"])]
        print("\n== A4. épsilon² del taxón por red (n_tf / n_edges / max_out_degree, mediana) ==")
        print(t.pivot_table(index="level", columns="network", values="eps2", aggfunc="median")
              .to_string(float_format=lambda x: f"{x:.3f}"))


def subsample(p, rate, strategy, rng):
    """p: pares de un genoma con columnas tf, operon_id, confidence. Devuelve los que quedan."""
    n = len(p)
    k = int(round(n * (1 - rate)))
    if k < 1:
        return p.iloc[:0]
    if strategy == "random":
        idx = rng.choice(n, size=k, replace=False)
    elif strategy == "degree_biased":
        deg = p.groupby("tf")["tf"].transform("size").to_numpy(dtype=float)
        # prob. de eliminar proporcional al grado del TF -> prob. de quedar ∝ 1/grado
        w = 1 / deg
        idx = rng.choice(n, size=k, replace=False, p=w / w.sum())
    else:  # low_confidence: determinista
        idx = np.argsort(-p["confidence"].to_numpy(), kind="mergesort")[:k]
    return p.iloc[np.sort(idx)]


def part_b(net_id, sample, replicates, seed):
    print(f"\n== B. Submuestreo de aristas, red {NETWORKS[net_id]}, {sample} genomas, {replicates} réplicas ==")
    m = pd.read_parquet(METRICS)
    ids = m[(m["network_id"] == net_id) & m["in_atlas"] & (m["n_edges"] >= 10)]["genome_id"]
    rng = np.random.default_rng(seed)
    ids = set(rng.choice(ids.to_numpy(), size=min(sample, len(ids)), replace=False))
    pairs = pairs_with_conf(net_id)
    pairs = pairs[pairs["genome_id"].isin(ids)]
    genes_per_genome, operon_size, _ = load_genes()

    t0 = time.time()
    rows = []
    for gid, p in pairs.groupby("genome_id"):
        n_genes = int(genes_per_genome.get(gid, 0))
        base = genome_metrics(p, n_genes, operon_size, {})
        rows.append({"genome_id": gid, "rate": 0.0, "strategy": "none", "rep": 0, **base})
        for strategy in STRATEGIES:
            reps = 1 if strategy == "low_confidence" else replicates
            for rate in RATES:
                for rep in range(reps):
                    q = subsample(p, rate, strategy, rng)
                    if len(q) == 0:
                        continue
                    rows.append({"genome_id": gid, "rate": rate, "strategy": strategy, "rep": rep,
                                 **genome_metrics(q, n_genes, operon_size, {})})
    df = pd.DataFrame(rows)
    print(f"  {df['genome_id'].nunique()} genomas, {len(df):,} grafos ({time.time() - t0:.0f} s)")

    base = df[df["strategy"] == "none"].set_index("genome_id")[KEYS]
    sub = df[df["strategy"] != "none"]
    # promedio de réplicas por (genoma, estrategia, tasa)
    mean = sub.groupby(["strategy", "rate", "genome_id"])[KEYS].mean()
    out = []
    for (strategy, rate), g in mean.groupby(level=["strategy", "rate"]):
        g = g.droplevel(["strategy", "rate"])
        b = base.reindex(g.index)
        for metric in KEYS:
            x, y = b[metric].astype(float), g[metric].astype(float)
            ok = x.notna() & y.notna()
            out.append({"network": NETWORKS[net_id], "strategy": strategy, "rate": rate, "metric": metric,
                        "genomes": int(ok.sum()),
                        "retention": float((y[ok] / x[ok].replace(0, np.nan)).median()),
                        "spearman": stats.spearmanr(x[ok], y[ok]).statistic})
    # variabilidad entre réplicas (random, 25 %): coeficiente de variación mediano
    r = sub[(sub["strategy"] == "random") & (sub["rate"] == 0.25)]
    cv = (r.groupby("genome_id")[KEYS].std() / r.groupby("genome_id")[KEYS].mean().replace(0, np.nan)).median()
    res = pd.DataFrame(out)
    res.to_csv(OUT / "robustness_subsampling.tsv", sep="\t", index=False)
    print("\nSpearman original vs submuestreada (orden de los genomas), random:")
    print(res[res.strategy == "random"].pivot(index="metric", columns="rate", values="spearman")
          .reindex(KEYS).to_string(float_format=lambda x: f"{x:.3f}"))
    print("\nRetención (mediana valor submuestreado / original), random:")
    print(res[res.strategy == "random"].pivot(index="metric", columns="rate", values="retention")
          .reindex(KEYS).to_string(float_format=lambda x: f"{x:.3f}"))
    print("\nSpearman a 25 % y 50 % por estrategia:")
    print(res[res.rate.isin([0.25, 0.5])].pivot_table(index="metric", columns=["strategy", "rate"], values="spearman")
          .reindex(KEYS).to_string(float_format=lambda x: f"{x:.3f}"))
    print("\nCV mediano entre réplicas (random, 25 %):")
    print(cv.reindex(KEYS).to_string(float_format=lambda x: f"{x:.3f}"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", type=int, default=300)
    ap.add_argument("--replicates", type=int, default=5)
    ap.add_argument("--seed", type=int, default=12)
    ap.add_argument("--network", type=int, default=3)
    args = ap.parse_args()
    if not METRICS.exists():
        sys.exit(f"Falta {METRICS}. Ejecuta make metrics-atlas primero.")
    OUT.mkdir(parents=True, exist_ok=True)
    part_a(pd.read_parquet(METRICS))
    part_b(args.network, args.sample, args.replicates, args.seed)


if __name__ == "__main__":
    main()

#!/usr/bin/env python
"""Robustez de las métricas propias (semana 12).

Dos análisis complementarios (decisiones en scripts/explore_robustness.py):

A. Entre redes: ¿cambian las métricas y el orden de los genomas al pasar de una red a otra?
   - nesting.tsv: fracción de los pares TF-operón de cada red contenidos en otra.
   - rank_between_networks.tsv: Spearman del valor por genoma entre pares de redes
     (genomas del atlas con aristas en ambas).
   - footprint_effect.tsv: experimento controlado validated (1) vs no-footprint (5):
     mismo umbral y tier, solo cambia el footprinting.

B. Submuestreo de aristas (red incompleta): por genoma del atlas con >= MIN_EDGES pares,
   se eliminan RATES de los pares con tres estrategias y se recalculan las métricas:
     random          eliminación uniforme (REPLICATES réplicas)
     degree_biased   más probable eliminar pares de TF con más dianas (REPLICATES réplicas)
     low_confidence  se eliminan los de menor confidence (determinista, = subir el umbral)
   - subsampling_genomes.parquet: valor original, media y desviación de las réplicas y
     retención (media / original) por (red, genoma, estrategia, tasa, métrica).
   - subsampling_summary.tsv: por (red, estrategia, tasa, métrica) la retención mediana y el
     Spearman entre el valor original y el submuestreado (¿se conserva el orden de los genomas?),
     con la clase: robust >= 0,90, moderate >= 0,70, not_robust < 0,70. n_edges es trivial con
     las tres estrategias: todas eliminan una fracción fija de pares (retención = 1 - tasa, rho = 1).

La semilla depende de (SEED, red, genoma): los resultados no dependen del orden ni del
número de procesos.

Uso (desde ~/proyecto, después de make metrics-atlas):
    PYTHONPATH=. python src/networks/atlas_robustness.py [--networks 1 2 3 4 5] [--workers 24]
Salidas en data/results/robustness/.
"""
import argparse
import json
import multiprocessing as mp
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats

from src.networks.atlas_metrics import (KEY, NETWORKS, genome_metrics, git_commit, git_dirty, load,
                                        load_genes, norm)

METRICS = Path("data/results/metrics/atlas_metrics.parquet")
OUT_DEFAULT = Path("data/results/robustness")
KEYS = ["n_tf", "n_targets", "n_edges", "density", "edges_per_tf", "frac_multi_reg", "frac_genome_targeted",
        "frac_largest", "mean_out_degree", "max_out_degree", "mean_in_degree", "out_degree_entropy",
        "out_degree_gini", "hub_share", "n_components"]
RATES = [0.10, 0.25, 0.50, 0.75]
STRATEGIES = ["random", "degree_biased", "low_confidence"]
REPLICATES = 10
MIN_EDGES = 10
SEED = 12
ROBUST, MODERATE = 0.90, 0.70

# Compartidos con los procesos hijos (fork): se asignan antes de crear el Pool
_GENES = None
_OPERON_SIZE = None


def robustness_class(rho):
    if rho != rho:
        return "undefined"
    return "robust" if rho >= ROBUST else "moderate" if rho >= MODERATE else "not_robust"


def load_pairs_conf(net_id):
    """Pares (genome_id, tf, operon_id) con su confidence máxima (misma regla que atlas_metrics)."""
    e = load(f"edges_net{net_id}", ["genome_id", "tf_name", "target_operon", "confidence"])
    e = e.rename(columns={"target_operon": "operon_id"})
    e["genome_id"] = e["genome_id"].astype("int64")
    e["operon_id"] = e["operon_id"].astype("int64")
    e["tf"] = norm(e["tf_name"])
    e = e.dropna(subset=["tf"]).sort_values("confidence", ascending=False, kind="mergesort")
    return e.drop_duplicates(KEY)[KEY + ["confidence"]].reset_index(drop=True)


# ---------------------------------------------------------------- A. entre redes
def nesting(pairs_by_net):
    keys = {n: pd.MultiIndex.from_frame(p[KEY]) for n, p in pairs_by_net.items()}
    rows = [{"from_network_id": a, "from_network": NETWORKS[a], "to_network_id": b, "to_network": NETWORKS[b],
             "pairs_from": len(keys[a]), "share_in_to": float(keys[a].isin(keys[b]).mean())}
            for a in keys for b in keys]
    return pd.DataFrame(rows)


def rank_between(atlas):
    wide = atlas[atlas["has_edges"]].pivot(index="genome_id", columns="network_id", values=KEYS)
    nets = sorted(atlas["network_id"].unique())
    rows = []
    for metric in KEYS:
        for a in nets:
            for b in nets:
                if a >= b:
                    continue
                x, y = wide[(metric, a)], wide[(metric, b)]
                ok = x.notna() & y.notna()
                rho = stats.spearmanr(x[ok], y[ok]).statistic if ok.sum() > 10 else np.nan
                rows.append({"metric": metric, "a_id": a, "a": NETWORKS[a], "b_id": b, "b": NETWORKS[b],
                             "genomes": int(ok.sum()), "spearman": float(rho)})
    return pd.DataFrame(rows)


def footprint_effect(atlas):
    w = atlas[atlas["has_edges"] & atlas["network_id"].isin([1, 5])].pivot(
        index="genome_id", columns="network_id", values=KEYS).dropna()
    rows = []
    for metric in KEYS:
        v, n = w[(metric, 1)].astype(float), w[(metric, 5)].astype(float)
        diff = (v != n).any()
        rows.append({"metric": metric, "genomes": len(w), "median_validated": float(v.median()),
                     "median_no_footprint": float(n.median()),
                     "median_ratio": float((v / n.replace(0, np.nan)).median()),
                     "wilcoxon_p": float(stats.wilcoxon(v, n).pvalue) if diff else float("nan"),
                     "spearman": float(stats.spearmanr(v, n).statistic)})
    return pd.DataFrame(rows)


# ---------------------------------------------------------------- B. submuestreo
def subsample(p, rate, strategy, rng):
    n = len(p)
    k = int(round(n * (1 - rate)))
    if k < 1:
        return p.iloc[:0]
    if strategy == "random":
        idx = rng.choice(n, size=k, replace=False)
    elif strategy == "degree_biased":
        deg = p.groupby("tf")["tf"].transform("size").to_numpy(dtype=float)
        w = 1 / deg  # prob. de eliminar ∝ grado del TF -> prob. de quedar ∝ 1 / grado
        idx = rng.choice(n, size=k, replace=False, p=w / w.sum())
    else:  # low_confidence (determinista)
        idx = np.argsort(-p["confidence"].to_numpy(), kind="mergesort")[:k]
    return p.iloc[np.sort(idx)]


def genome_task(args):
    net_id, gid, p = args
    rng = np.random.default_rng([SEED, net_id, gid])
    n_genes = int(_GENES.get(gid, 0))
    base = genome_metrics(p, n_genes, _OPERON_SIZE, {})
    rows = []
    for strategy in STRATEGIES:
        reps = 1 if strategy == "low_confidence" else REPLICATES
        for rate in RATES:
            vals = []
            for _ in range(reps):
                q = subsample(p, rate, strategy, rng)
                if len(q):
                    vals.append({k: genome_metrics(q, n_genes, _OPERON_SIZE, {})[k] for k in KEYS})
            if not vals:
                continue
            v = pd.DataFrame(vals)
            mean, sd = v.mean(), v.std(ddof=1) if len(v) > 1 else v.mean() * np.nan
            for metric in KEYS:
                orig = base[metric]
                rows.append((net_id, gid, strategy, rate, metric, orig, mean[metric], sd[metric],
                             mean[metric] / orig if orig not in (0, None) and orig == orig else np.nan))
    return rows


def subsampling(net_id, pairs, atlas_ids, workers):
    p = pairs[pairs["genome_id"].isin(atlas_ids)]
    size = p.groupby("genome_id").size()
    p = p[p["genome_id"].isin(size[size >= MIN_EDGES].index)]
    tasks = [(net_id, int(gid), g[["tf", "operon_id", "confidence"]].reset_index(drop=True))
             for gid, g in p.groupby("genome_id")]
    t0 = time.time()
    with mp.get_context("fork").Pool(workers) as pool:
        chunks = pool.map(genome_task, tasks, chunksize=8)
    rows = [r for c in chunks for r in c]
    df = pd.DataFrame(rows, columns=["network_id", "genome_id", "strategy", "rate", "metric",
                                     "original", "mean", "sd", "retention"])
    print(f"  {NETWORKS[net_id]}: {len(tasks):,} genomas con >= {MIN_EDGES} pares, "
          f"{len(df):,} filas ({time.time() - t0:.0f} s)", flush=True)
    return df


def summarize(sub):
    rows = []
    for (net_id, strategy, rate, metric), g in sub.groupby(["network_id", "strategy", "rate", "metric"]):
        ok = g["original"].notna() & g["mean"].notna()
        rho = stats.spearmanr(g.loc[ok, "original"], g.loc[ok, "mean"]).statistic if ok.sum() > 10 else np.nan
        trivial = metric == "n_edges"  # las tres estrategias eliminan una fracción fija de pares
        rows.append({"network_id": net_id, "network": NETWORKS[net_id], "strategy": strategy, "rate": rate,
                     "metric": metric, "genomes": int(ok.sum()),
                     "retention_median": float(g["retention"].median()),
                     "retention_p10": float(g["retention"].quantile(0.1)),
                     "retention_p90": float(g["retention"].quantile(0.9)),
                     "spearman": float(rho), "trivial": trivial,
                     "robustness": "trivial" if trivial else robustness_class(rho)})
    return pd.DataFrame(rows)


def main():
    global _GENES, _OPERON_SIZE
    ap = argparse.ArgumentParser(description="Robustez de las métricas propias del atlas")
    ap.add_argument("--networks", type=int, nargs="+", default=list(NETWORKS))
    ap.add_argument("--workers", type=int, default=24)
    ap.add_argument("--out", type=Path, default=OUT_DEFAULT)
    args = ap.parse_args()
    dirty = git_dirty()
    if dirty:
        print("AVISO: hay cambios sin commit; el manifest registrará git_dirty=true. "
              "Haz commit y vuelve a ejecutar para que los resultados sean trazables.")
    if not METRICS.exists():
        sys.exit(f"Falta {METRICS}. Ejecuta make metrics-atlas primero.")
    args.out.mkdir(parents=True, exist_ok=True)

    m = pd.read_parquet(METRICS)
    atlas = m[m["in_atlas"] & m["network_id"].isin(args.networks)]
    atlas_ids = set(atlas["genome_id"].unique())

    print("Cargando aristas…")
    pairs = {n: load_pairs_conf(n) for n in args.networks}

    # A
    print("A. Entre redes")
    nest = nesting(pairs)
    rank = rank_between(atlas)
    fp = footprint_effect(atlas) if {1, 5} <= set(args.networks) else pd.DataFrame()
    nest.to_csv(args.out / "nesting.tsv", sep="\t", index=False)
    rank.to_csv(args.out / "rank_between_networks.tsv", sep="\t", index=False)
    fp.to_csv(args.out / "footprint_effect.tsv", sep="\t", index=False)

    # B
    print("B. Submuestreo de aristas")
    _GENES, _OPERON_SIZE, _ = load_genes()
    sub = pd.concat([subsampling(n, pairs[n], atlas_ids, args.workers) for n in args.networks],
                    ignore_index=True)
    sub = sub.merge(atlas[["network_id", "genome_id", "accession"]].drop_duplicates(),
                    on=["network_id", "genome_id"], how="left")
    sub.to_parquet(args.out / "subsampling_genomes.parquet", index=False)
    summ = summarize(sub)
    summ.to_csv(args.out / "subsampling_summary.tsv", sep="\t", index=False)

    # Resumen en consola
    b = summ[(summ["network_id"] == 3) & (summ["strategy"] == "random")]
    if len(b):
        print("\n== balanced, random: Spearman original vs submuestreada ==")
        print(b.pivot(index="metric", columns="rate", values="spearman").reindex(KEYS)
              .to_string(float_format=lambda x: f"{x:.3f}"))
    print("\n== Clases a 50 % (todas las redes y estrategias, sin triviales) ==")
    print(summ[(summ["rate"] == 0.5) & ~summ["trivial"]]["robustness"].value_counts().to_string())

    manifest = {
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "git_commit": git_commit(),
        "git_dirty": dirty,
        "metrics_manifest": json.loads((METRICS.parent / "manifest.json").read_text()).get("git_commit"),
        "networks": args.networks,
        "definition": {
            "between_networks": "atlas genomes with edges; nesting over (genome, TF, operon) pairs; "
                                "Spearman of per-genome values between network pairs",
            "footprint_effect": "validated vs no-footprint on genomes with edges in both (same p and tier)",
            "subsampling": {
                "genomes": f"atlas genomes with >= {MIN_EDGES} TF-operon pairs",
                "rates": RATES, "strategies": STRATEGIES, "replicates": REPLICATES,
                "low_confidence_replicates": 1, "seed": f"[{SEED}, network_id, genome_id]",
                "retention": "mean over replicates / original value",
                "spearman": "original vs mean subsampled value across genomes",
                "classes": f"robust >= {ROBUST}, moderate >= {MODERATE}, not_robust < {MODERATE}; "
                           "n_edges is trivial (every strategy removes a fixed share of pairs)",
            },
        },
        "metrics": KEYS,
        "files": ["nesting.tsv", "rank_between_networks.tsv", "footprint_effect.tsv",
                  "subsampling_genomes.parquet", "subsampling_summary.tsv"],
    }
    (args.out / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
    print(f"\nResultados en {args.out}/")


if __name__ == "__main__":
    main()

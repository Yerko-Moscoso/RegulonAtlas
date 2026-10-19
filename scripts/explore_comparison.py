#!/usr/bin/env python
"""Exploración previa de la comparación entre genomas por taxón (semana 11).

Criterio elegido: la comparación debe dar resultados lo más cercanos posible a los
del pipeline externo (network_metrics). Por eso se compara por taxón (opción A),
que es lo único que se puede calcular igual con las métricas propias y con las
externas; una proyección PCA o clusters no tendrían referencia externa.

Responde:
  1. ¿Qué métricas propias tienen equivalente en network_metrics y cuánto se
     parecen genoma a genoma (Spearman)?
  2. Agregadas por taxón (filo, clase, orden, familia GTDB), ¿las medianas propias
     ordenan los taxones igual que las externas?
  3. ¿El taxón explica la variación de cada métrica (Kruskal-Wallis, épsilon²) y
     se llega a la misma conclusión con ambas fuentes?
  4. ¿Qué tamaño mínimo de grupo deja suficientes taxones?

Uso (desde ~/proyecto, después de make metrics-atlas):
    PYTHONPATH=. python scripts/explore_comparison.py
Salidas:
    data/audit/comparison_genome_agreement.tsv
    data/audit/comparison_taxon_agreement.tsv
    data/audit/comparison_group_sizes.tsv
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats

CACHE = Path("data/cache/atlas")
METRICS = Path("data/results/metrics/atlas_metrics.parquet")
OUT = Path("data/audit")
NETWORKS = {1: "validated", 2: "high-precision", 3: "balanced", 4: "permissive", 5: "no-footprint"}
LEVELS = ["gtdb_phylum", "gtdb_class", "gtdb_order", "gtdb_family"]
MIN_SIZES = [3, 5, 10]

# métrica propia -> columna de network_metrics
PAIRS = {
    "n_tf": "n_tf",
    "n_targets": "n_targets",
    "n_edges": "n_edges",
    "density": "density",
    "mean_out_degree": "mean_out_deg",
    "max_out_degree": "max_out_deg",
    "mean_in_degree": "mean_in_deg",
    "max_in_degree": "max_in_deg",
    "frac_multi_reg": "frac_multi_reg",
    "n_components": "n_components",
    "frac_largest": "frac_largest",
}


def epsilon_sq(h, n, k):
    """Tamaño de efecto de Kruskal-Wallis: (H - k + 1) / (n - k)."""
    return (h - k + 1) / (n - k) if n > k else float("nan")


def kruskal(df, level, col, min_size):
    groups = [g[col].dropna().values for _, g in df.groupby(level) if g[col].notna().sum() >= min_size]
    if len(groups) < 2:
        return float("nan"), float("nan"), len(groups), 0
    h, p = stats.kruskal(*groups)
    n = sum(len(g) for g in groups)
    return epsilon_sq(h, n, len(groups)), p, len(groups), n


def main():
    if not METRICS.exists():
        sys.exit(f"Falta {METRICS}. Ejecuta make metrics-atlas primero.")
    own = pd.read_parquet(METRICS)
    own = own[own["in_atlas"] & own["has_edges"]]
    ext = pd.read_parquet(CACHE / "network_metrics.parquet")
    ext = ext[["network_id", "genome_id"] + sorted(set(PAIRS.values()))]
    m = own.merge(ext, on=["network_id", "genome_id"], suffixes=("", "_ext"))
    # columnas externas con nombre explícito
    for o, e in PAIRS.items():
        src = f"{e}_ext" if f"{e}_ext" in m.columns else e
        m[f"ext__{o}"] = m[src].astype(float)
    OUT.mkdir(parents=True, exist_ok=True)

    # 1. Concordancia genoma a genoma
    rows = []
    for net_id, g in m.groupby("network_id"):
        for o in PAIRS:
            a, b = g[o].astype(float), g[f"ext__{o}"]
            ok = a.notna() & b.notna()
            rows.append({"network_id": net_id, "network": NETWORKS[net_id], "metric": o, "genomes": int(ok.sum()),
                         "spearman": stats.spearmanr(a[ok], b[ok]).statistic if ok.sum() > 2 else np.nan,
                         "median_ratio": float((a[ok] / b[ok].replace(0, np.nan)).median())})
    gen = pd.DataFrame(rows)
    gen.to_csv(OUT / "comparison_genome_agreement.tsv", sep="\t", index=False)
    print("== 1. Spearman genoma a genoma (propia vs externa), genomas del atlas con métricas en ambas ==")
    print(gen.pivot(index="metric", columns="network", values="spearman")
          .reindex(list(PAIRS)).to_string(float_format=lambda x: f"{x:.3f}"))

    # 4. Tamaños de grupo
    rows = []
    for net_id, g in m.groupby("network_id"):
        for lv in LEVELS:
            size = g.groupby(lv).size()
            for ms in MIN_SIZES:
                keep = size[size >= ms]
                rows.append({"network": NETWORKS[net_id], "level": lv, "min_size": ms,
                             "taxa": len(keep), "genomes_covered": int(keep.sum()), "genomes": len(g)})
    sizes = pd.DataFrame(rows)
    sizes.to_csv(OUT / "comparison_group_sizes.tsv", sep="\t", index=False)
    print("\n== 4. Taxones con >= min_size genomas (balanced) ==")
    print(sizes[sizes.network == "balanced"].pivot(index="level", columns="min_size",
                                                   values="taxa").reindex(LEVELS).to_string())

    # 2 y 3. Concordancia por taxón
    rows = []
    for net_id, g in m.groupby("network_id"):
        for lv in LEVELS:
            for ms in MIN_SIZES:
                size = g.groupby(lv).size()
                gg = g[g[lv].isin(size[size >= ms].index)]
                if gg[lv].nunique() < 3:
                    continue
                for o in PAIRS:
                    med = gg.groupby(lv).agg(own=(o, "median"), ext=(f"ext__{o}", "median"))
                    rho = stats.spearmanr(med["own"], med["ext"]).statistic
                    e_own, p_own, k, n = kruskal(gg, lv, o, ms)
                    e_ext, p_ext, _, _ = kruskal(gg, lv, f"ext__{o}", ms)
                    rows.append({"network_id": net_id, "network": NETWORKS[net_id], "level": lv, "min_size": ms,
                                 "metric": o, "taxa": k, "genomes": n, "spearman_taxon_medians": rho,
                                 "top_taxon_same": med["own"].idxmax() == med["ext"].idxmax(),
                                 "eps2_own": e_own, "eps2_ext": e_ext, "p_own": p_own, "p_ext": p_ext,
                                 "same_conclusion": (p_own < 0.05) == (p_ext < 0.05)})
    tax = pd.DataFrame(rows)
    tax.to_csv(OUT / "comparison_taxon_agreement.tsv", sep="\t", index=False)

    sel = tax[(tax.min_size == 5)]
    print("\n== 2. Spearman entre medianas por taxón (propia vs externa), min_size = 5, mediana de las 5 redes ==")
    print(sel.pivot_table(index="metric", columns="level", values="spearman_taxon_medians", aggfunc="median")
          .reindex(index=list(PAIRS), columns=LEVELS).to_string(float_format=lambda x: f"{x:.3f}"))
    print("\n== 3. épsilon² (taxón explica la métrica), balanced, min_size = 5: propia / externa ==")
    b = sel[sel.network == "balanced"].set_index(["metric", "level"])
    out = (b["eps2_own"].map("{:.3f}".format) + " / " + b["eps2_ext"].map("{:.3f}".format)).unstack("level")
    print(out.reindex(index=list(PAIRS), columns=LEVELS).to_string())
    print("\nMisma conclusión de Kruskal-Wallis (p < 0,05) con ambas fuentes:",
          f"{sel['same_conclusion'].mean():.1%} de {len(sel)} combinaciones (red x nivel x métrica)")
    print("Mismo taxón con la mediana más alta:", f"{sel['top_taxon_same'].mean():.1%}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python
"""Comparación de las métricas propias entre taxones (semana 11, OE4).

Agrupa los genomas del atlas por filo, clase, orden y familia de GTDB y, para cada
red y métrica, resume la distribución por taxón y prueba si el taxón explica la
variación (Kruskal-Wallis). Lo mismo se calcula con network_metrics (externo) sobre
los MISMOS genomas, para medir cuánto se parece la comparación propia a la externa.

Decisiones (scripts/explore_comparison.py):
  - Comparación por taxón (opción A): es la única que tiene equivalente externo.
  - Solo métricas con columna equivalente en network_metrics (PAIRS).
  - Genomas: del atlas, con aristas en la red y con fila en network_metrics.
  - Taxones con >= MIN_SIZE genomas (5).
  - Concordancia = Spearman entre las medianas por taxón propias y externas:
    high >= 0,85, moderate >= 0,60, low < 0,60. density: definición distinta
    (correcciones_semana11.md, C5), se marca aparte.

Uso (desde ~/proyecto, después de make metrics-atlas):
    PYTHONPATH=. python src/networks/atlas_comparison.py
Salidas en data/results/comparison/:
    by_taxon.tsv     distribución por (red, nivel, taxón, métrica): propia y externa
    taxon_tests.tsv  Kruskal-Wallis, épsilon² y concordancia por (red, nivel, métrica)
    manifest.json    definición, parámetros, commit
"""
import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats

from src.networks.atlas_metrics import NETWORKS, git_commit, git_dirty

CACHE = Path("data/cache/atlas")
METRICS = Path("data/results/metrics/atlas_metrics.parquet")
OUT_DEFAULT = Path("data/results/comparison")
LEVELS = ["gtdb_phylum", "gtdb_class", "gtdb_order", "gtdb_family"]
MIN_SIZE = 5
HIGH, MODERATE = 0.85, 0.60
DIFFERENT_DEFINITION = {"density"}

# métrica propia -> columna de network_metrics
PAIRS = {
    "n_tf": "n_tf",
    "n_targets": "n_targets",
    "n_edges": "n_edges",
    "max_out_degree": "max_out_deg",
    "n_components": "n_components",
    "frac_largest": "frac_largest",
    "mean_out_degree": "mean_out_deg",
    "max_in_degree": "max_in_deg",
    "mean_in_degree": "mean_in_deg",
    "frac_multi_reg": "frac_multi_reg",
    "density": "density",
}


def epsilon_sq(h, n, k):
    """Tamaño de efecto de Kruskal-Wallis: (H - k + 1) / (n - k)."""
    return float((h - k + 1) / (n - k)) if n > k else float("nan")


def kruskal(values, groups):
    samples = [v.dropna().values for _, v in values.groupby(groups)]
    samples = [s for s in samples if len(s)]
    if len(samples) < 2 or values.nunique() < 2:
        return float("nan"), float("nan"), float("nan")
    h, p = stats.kruskal(*samples)
    n = sum(len(s) for s in samples)
    return float(h), float(p), epsilon_sq(h, n, len(samples))


def spearman(a, b):
    if len(a) < 3 or a.nunique() < 2 or b.nunique() < 2:
        return float("nan")
    return float(stats.spearmanr(a, b).statistic)


def agreement(metric, rho):
    if metric in DIFFERENT_DEFINITION:
        return "different_definition"
    if rho != rho:
        return "undefined"
    return "high" if rho >= HIGH else "moderate" if rho >= MODERATE else "low"


def load_inputs():
    if not METRICS.exists():
        sys.exit(f"Falta {METRICS}. Ejecuta make metrics-atlas primero.")
    own = pd.read_parquet(METRICS)
    own = own[own["in_atlas"] & own["has_edges"]]
    ext = pd.read_parquet(CACHE / "network_metrics.parquet")
    ext = ext[["network_id", "genome_id"] + list(PAIRS.values())]
    ext = ext.rename(columns={e: f"ext__{o}" for o, e in PAIRS.items()})
    m = own.merge(ext, on=["network_id", "genome_id"], how="inner")
    return own, m


def summarize(net_id, level, g, own_counts):
    """g: genomas comunes de una red; devuelve (filas por taxón, filas de pruebas)."""
    size = g.groupby(level).size()
    keep = size[size >= MIN_SIZE].index
    gg = g[g[level].isin(keep)]
    taxa_rows, test_rows = [], []
    for metric in PAIRS:
        o, e = gg[metric].astype(float), gg[f"ext__{metric}"].astype(float)
        q = o.groupby(gg[level]).quantile([0.1, 0.25, 0.5, 0.75, 0.9]).unstack()
        med_ext = e.groupby(gg[level]).median()
        q1_ext = e.groupby(gg[level]).quantile(0.25)
        q3_ext = e.groupby(gg[level]).quantile(0.75)
        for taxon in keep:
            taxa_rows.append({
                "network_id": net_id, "network": NETWORKS[net_id], "level": level, "taxon": taxon,
                "metric": metric, "genomes": int(size[taxon]),
                "genomes_with_edges": int(own_counts.get(taxon, 0)),
                "p10": q.at[taxon, 0.1], "q1": q.at[taxon, 0.25], "median": q.at[taxon, 0.5],
                "q3": q.at[taxon, 0.75], "p90": q.at[taxon, 0.9],
                "median_ext": float(med_ext[taxon]), "q1_ext": float(q1_ext[taxon]),
                "q3_ext": float(q3_ext[taxon]),
            })
        h, p, eps = kruskal(o, gg[level])
        h_e, p_e, eps_e = kruskal(e, gg[level])
        med_own = o.groupby(gg[level]).median()
        rho = spearman(med_own, med_ext)
        test_rows.append({
            "network_id": net_id, "network": NETWORKS[net_id], "level": level, "metric": metric,
            "taxa": len(keep), "genomes": int(len(gg)),
            "kw_h": h, "kw_p": p, "eps2": eps, "kw_h_ext": h_e, "kw_p_ext": p_e, "eps2_ext": eps_e,
            "same_conclusion": bool((p < 0.05) == (p_e < 0.05)) if p == p and p_e == p_e else None,
            "spearman_taxon_medians": rho,
            "spearman_genomes": spearman(o, e),
            "agreement": agreement(metric, rho),
        })
    return taxa_rows, test_rows


def main():
    ap = argparse.ArgumentParser(description="Comparación de métricas propias entre taxones")
    ap.add_argument("--out", type=Path, default=OUT_DEFAULT)
    args = ap.parse_args()
    dirty = git_dirty()
    if dirty:
        print("AVISO: hay cambios sin commit; el manifest registrará git_dirty=true. "
              "Haz commit y vuelve a ejecutar para que los resultados sean trazables.")
    args.out.mkdir(parents=True, exist_ok=True)

    own, m = load_inputs()
    taxa, tests = [], []
    for net_id, g in m.groupby("network_id"):
        own_net = own[own["network_id"] == net_id]
        print(f"Red {net_id} ({NETWORKS[net_id]}): {len(g):,} genomas comunes "
              f"de {len(own_net):,} del atlas con aristas")
        for level in LEVELS:
            t, s = summarize(int(net_id), level, g, own_net.groupby(level).size())
            taxa += t
            tests += s
    by_taxon = pd.DataFrame(taxa)
    taxon_tests = pd.DataFrame(tests)
    by_taxon.to_csv(args.out / "by_taxon.tsv", sep="\t", index=False)
    taxon_tests.to_csv(args.out / "taxon_tests.tsv", sep="\t", index=False)

    # Resumen en consola
    print("\n== Concordancia con network_metrics (Spearman de medianas por taxón), balanced ==")
    b = taxon_tests[taxon_tests["network_id"] == 3]
    print(b.pivot(index="metric", columns="level", values="spearman_taxon_medians")
          .reindex(index=list(PAIRS), columns=LEVELS).to_string(float_format=lambda x: f"{x:.3f}"))
    comparable = taxon_tests[~taxon_tests["metric"].isin(DIFFERENT_DEFINITION)]
    print("\nCategorías de concordancia (5 redes x 4 niveles x métricas comparables):")
    print(comparable["agreement"].value_counts().to_string())
    print(f"Misma conclusión de Kruskal-Wallis: {comparable['same_conclusion'].mean():.1%}")

    manifest = {
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "git_commit": git_commit(),
        "git_dirty": dirty,
        "metrics_manifest": json.loads((METRICS.parent / "manifest.json").read_text()).get("git_commit"),
        "definition": {
            "genomes": "atlas genomes with edges in the network and a row in network_metrics "
                       "(same genomes for own and external values)",
            "levels": LEVELS,
            "min_taxon_size": MIN_SIZE,
            "test": "Kruskal-Wallis across taxa; effect size epsilon^2 = (H - k + 1) / (n - k)",
            "agreement": f"Spearman between own and external taxon medians: high >= {HIGH}, "
                         f"moderate >= {MODERATE}, low < {MODERATE}",
            "different_definition": {
                "density": "external = n_edges / (n_tf * all operons of the genome); "
                           "own = n_edges / (n_tf * n_targets)",
            },
        },
        "metric_pairs": PAIRS,
        "files": ["by_taxon.tsv", "taxon_tests.tsv"],
    }
    (args.out / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
    print(f"\nResultados en {args.out}/")


if __name__ == "__main__":
    main()

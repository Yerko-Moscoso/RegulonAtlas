#!/usr/bin/env python
"""Comparación entre taxones ajustada por el efecto metodológico (excepción E3 del congelamiento).

Lleva al sistema la prueba de metricas_semana11.md (8.5). Por red y métrica ajusta, en los genomas de la comparación,
    log(1 + métrica) ~ log(n_genes) + log(1 + oferta de familia) + log(1 + oferta de orden) + log(1 + oferta de clase)
y compara los taxones con el residuo: lo que queda después de descontar el tamaño del genoma y los motivos disponibles.
exp(residuo) se lee como "veces respecto de lo esperado". No prueba biología: el tamaño del genoma es en parte
biológico, así que el ajuste es conservador, y puede quedar sesgo de muestreo que estas variables no capturen.

Uso (después de make comparison-atlas): PYTHONPATH=. python src/networks/atlas_adjusted.py
Salidas en data/results/comparison_adjusted/: by_taxon.tsv, tests.tsv, manifest.json
"""
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

from src.atlas_common import NETWORKS, check_dirty, git_commit
from src.networks.atlas_comparison import LEVELS, MIN_SIZE, kruskal, load_inputs
from src.networks.motif_supply import CACHE, source_genomes, supply

OUT_DEFAULT = Path("data/results/comparison_adjusted")
METRICS_ADJ = ["n_tf", "n_targets", "n_edges"]
SUPPLY = ["supply_family", "supply_order", "supply_class"]


def r2_fit(x, y):
    beta, *_ = np.linalg.lstsq(x, y, rcond=None)
    res = y - x @ beta
    ss_tot = float(((y - y.mean()) ** 2).sum())
    return (1 - float((res ** 2).sum()) / ss_tot if ss_tot > 0 else float("nan")), res


def design(d):
    return np.column_stack([np.ones(len(d)), np.log(d["n_genes"].to_numpy(float)),
                            *[np.log1p(d[c].to_numpy(float)) for c in SUPPLY]])


def taxon_effect(g, level, y, x_cov):
    """R² del taxón solo, de las covariables y lo que el taxón agrega sobre ellas (misma medida que la sección 8.5)."""
    dummies = pd.get_dummies(g[level], drop_first=True).to_numpy(float)
    r2_taxon, _ = r2_fit(np.column_stack([np.ones(len(g)), dummies]), y)
    r2_cov, _ = r2_fit(x_cov, y)
    r2_full, _ = r2_fit(np.column_stack([x_cov, dummies]), y)
    added = r2_full - r2_cov
    # Si el taxón agrega más de lo que explica solo, el modelo está sobreajustado y la proporción no se interpreta
    share = 1 - added / r2_taxon if r2_taxon > 0 and added <= r2_taxon else float("nan")
    return {"r2_taxon": r2_taxon, "r2_covariates": r2_cov, "r2_added_by_taxon": added, "taxon_effect_explained": share}


def analyze(net_id, d):
    taxa, tests = [], []
    x_all = design(d)
    for metric in METRICS_ADJ:
        y = np.log1p(d[metric].to_numpy(float))
        _, res = r2_fit(x_all, y)
        dd = d.assign(_y=y, _res=res)
        for level in LEVELS:
            size = dd.groupby(level).size()
            keep = size[size >= MIN_SIZE].index
            g = dd[dd[level].isin(keep)]
            _, p_raw, _ = kruskal(g["_y"], g[level])
            _, p_adj, _ = kruskal(g["_res"], g[level])
            tests.append({"network_id": net_id, "network": NETWORKS[net_id], "level": level, "metric": metric,
                          "taxa": len(keep), "genomes": len(g), "kw_p_raw": p_raw, "kw_p_adjusted": p_adj,
                          **taxon_effect(g, level, g["_y"].to_numpy(), design(g))})
            q = g.groupby(level)["_res"].quantile([0.25, 0.5, 0.75]).unstack()
            raw = g.groupby(level)[metric].median()
            for taxon in keep:
                taxa.append({"network_id": net_id, "network": NETWORKS[net_id], "level": level, "taxon": taxon,
                             "metric": metric, "genomes": int(size[taxon]), "median_raw": float(raw[taxon]),
                             "residual_q1": q.at[taxon, 0.25], "residual_median": q.at[taxon, 0.5],
                             "residual_q3": q.at[taxon, 0.75], "fold_vs_expected": float(np.exp(q.at[taxon, 0.5]))})
    return taxa, tests


def main():
    ap = argparse.ArgumentParser(description="Comparación entre taxones ajustada")
    ap.add_argument("--out", type=Path, default=OUT_DEFAULT)
    args = ap.parse_args()
    dirty = check_dirty()
    args.out.mkdir(parents=True, exist_ok=True)
    _, m = load_inputs()
    motifs = pd.read_parquet(CACHE / "motifs.parquet", columns=["motif_id", "motif_key", "source", "source_taxon"])
    genomes = pd.read_parquet(CACHE / "genomes.parquet")
    genomes["genome_id"] = genomes["genome_id"].astype("int64")
    sup = supply(source_genomes(motifs, genomes), genomes, genomes[genomes["genome_id"].isin(m["genome_id"].unique())])
    d = m.merge(sup[["genome_id"] + SUPPLY], on="genome_id", how="inner")
    if len(d) != len(m):
        raise SystemExit(f"Faltan genomas en la oferta de motivos: {len(d)} de {len(m)}")
    taxa, tests = [], []
    for net_id, g in d.groupby("network_id"):
        t, s = analyze(int(net_id), g)
        taxa += t
        tests += s
    by_taxon, tbl = pd.DataFrame(taxa), pd.DataFrame(tests)
    by_taxon.to_csv(args.out / "by_taxon.tsv", sep="\t", index=False)
    tbl.to_csv(args.out / "tests.tsv", sep="\t", index=False)
    manifest = {
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "git_commit": git_commit(),
        "git_dirty": dirty,
        "definition": {"model": "log1p(metric) ~ log(n_genes) + log1p(supply_family) + log1p(supply_order) + "
                                "log1p(supply_class)", "fit": "OLS per network and metric",
                       "genomes": "same genomes as make comparison-atlas", "min_taxon_size": MIN_SIZE,
                       "fold_vs_expected": "exp(median residual)",
                       "taxon_effect_explained": "1 - (R2 added by the taxon over the covariates / R2 of the taxon alone); "
                                                 "null when the model overfits (added > alone)"},
        "files": ["by_taxon.tsv", "tests.tsv"],
    }
    (args.out / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
    print(tbl[(tbl["network_id"] == 3) & (tbl["metric"] == "n_tf")].round(3).to_string())


if __name__ == "__main__":
    main()

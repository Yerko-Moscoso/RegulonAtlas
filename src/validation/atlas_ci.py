#!/usr/bin/env python
"""Intervalos de confianza de P, R y F1 por bootstrap (excepción E1 del congelamiento).

Lee data/results/validation/regprecise/by_genome.tsv (TP, predicciones evaluables y pares curados por genoma,
universo genome_tf) y no vuelve a calcular la validación. Dos esquemas:
  genome  remuestrea los genomas validables.
  family  remuestrea familias GTDB completas. Es el más conservador: los genomas de una familia no son
          independientes, porque comparten motivos y evolución.
Las réplicas son las mismas para todas las redes (bootstrap pareado), así que la diferencia de F1 entre dos redes
se evalúa directamente. Intervalo percentil del 95 %.

Uso: PYTHONPATH=. python src/validation/atlas_ci.py
Salidas en data/results/validation_ci/: ci.tsv, f1_differences.tsv, manifest.json
"""
import argparse
import json
import sys
from datetime import datetime, timezone
from itertools import combinations
from pathlib import Path

import numpy as np
import pandas as pd

from src.atlas_common import NETWORKS, check_dirty, git_commit

SOURCE = Path("data/results/validation/regprecise")
OUT_DEFAULT = Path("data/results/validation_ci")
MODES = ("all", "independent")
N_BOOT = 10_000
SEED = 20261123


def prf(tp, n_pred, n_gold):
    """P, R y F1 agregados; acepta matrices (una réplica por fila)."""
    with np.errstate(divide="ignore", invalid="ignore"):
        p = tp / n_pred
        r = tp / n_gold
        f = 2 * p * r / (p + r)
    return p, r, f


def replicate_weights(n_units, n_boot, rng):
    """Veces que entra cada unidad en cada réplica."""
    return rng.multinomial(n_units, np.full(n_units, 1 / n_units), size=n_boot)


def bootstrap(tbl, weights):
    """tbl: columnas TP, pairs_evaluable y n_gold por unidad, en el orden de weights."""
    tp = weights @ tbl["TP"].to_numpy()
    pred = weights @ tbl["pairs_evaluable"].to_numpy()
    gold = weights @ tbl["n_gold"].to_numpy()
    return prf(tp.astype(float), pred.astype(float), gold.astype(float))


def main():
    ap = argparse.ArgumentParser(description="Intervalos de confianza de la validación")
    ap.add_argument("--out", type=Path, default=OUT_DEFAULT)
    ap.add_argument("--n-boot", type=int, default=N_BOOT)
    args = ap.parse_args()
    dirty = check_dirty()
    path = SOURCE / "by_genome.tsv"
    if not path.exists():
        sys.exit(f"Falta {path}. Ejecuta make validate-atlas primero.")
    g = pd.read_csv(path, sep="\t")
    g["unit_family"] = g["gtdb_family"].fillna(g["accession"])
    summary = pd.read_csv(SOURCE / "summary.tsv", sep="\t").query("universe == 'genome_tf'")
    args.out.mkdir(parents=True, exist_ok=True)

    genome_ids = np.sort(g["genome_id"].unique())
    families = np.sort(g["unit_family"].unique())
    schemes = {"genome": ("genome_id", genome_ids), "family": ("unit_family", families)}
    ci_rows, diff_rows = [], []
    for scheme, (col, units) in schemes.items():
        weights = replicate_weights(len(units), args.n_boot, np.random.default_rng(SEED))
        for mode in MODES:
            f1s = {}
            for net_id in NETWORKS:
                d = g[(g["network_id"] == net_id) & (g["mode"] == mode)]
                tbl = d.groupby(col)[["TP", "pairs_evaluable", "n_gold"]].sum().reindex(units, fill_value=0)
                est = prf(float(tbl["TP"].sum()), float(tbl["pairs_evaluable"].sum()), float(tbl["n_gold"].sum()))
                ref = summary[(summary["network_id"] == net_id) & (summary["mode"] == mode)].iloc[0]
                for value, name in zip(est, ("precision", "recall", "f1")):
                    if abs(value - ref[name]) > 1e-9:  # control: by_genome debe reproducir summary
                        sys.exit(f"{NETWORKS[net_id]} {mode}: {name} {value} no coincide con summary {ref[name]}")
                reps = bootstrap(tbl, weights)
                f1s[net_id] = (est[2], reps[2])
                for value, rep, name in zip(est, reps, ("precision", "recall", "f1")):
                    low, high = np.nanpercentile(rep, [2.5, 97.5])
                    ci_rows.append({"network_id": net_id, "network": NETWORKS[net_id], "mode": mode, "scheme": scheme,
                                    "units": len(units), "metric": name, "estimate": value,
                                    "ci_low": low, "ci_high": high})
            for a, b in combinations(NETWORKS, 2):
                delta = f1s[a][1] - f1s[b][1]
                low, high = np.nanpercentile(delta, [2.5, 97.5])
                diff_rows.append({"mode": mode, "scheme": scheme, "network_a": NETWORKS[a], "network_b": NETWORKS[b],
                                  "network_id_a": a, "network_id_b": b, "f1_diff": f1s[a][0] - f1s[b][0],
                                  "ci_low": low, "ci_high": high, "ci_excludes_zero": bool(low > 0 or high < 0)})
    ci, diffs = pd.DataFrame(ci_rows), pd.DataFrame(diff_rows)
    ci.to_csv(args.out / "ci.tsv", sep="\t", index=False)
    diffs.to_csv(args.out / "f1_differences.tsv", sep="\t", index=False)
    source = json.loads((SOURCE / "manifest.json").read_text())
    manifest = {
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "git_commit": git_commit(),
        "git_dirty": dirty, "validation_commit": source.get("git_commit"),
        "definition": {"universe": "genome_tf", "n_boot": args.n_boot, "seed": SEED, "interval": "95% percentile",
                       "schemes": {"genome": "resample validable genomes",
                                   "family": "resample whole GTDB families (conservative)"},
                       "pairing": "same replicates for every network"},
        "units": {"genome": len(genome_ids), "family": len(families)}, "files": ["ci.tsv", "f1_differences.tsv"],
    }
    (args.out / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
    print(ci[(ci["metric"] == "f1")].pivot_table(index=["network", "mode"], columns="scheme",
                                                  values=["ci_low", "ci_high"]).round(3).to_string())
    print(diffs[diffs["network_a"].eq("balanced") | diffs["network_b"].eq("balanced")].round(3).to_string())


if __name__ == "__main__":
    main()

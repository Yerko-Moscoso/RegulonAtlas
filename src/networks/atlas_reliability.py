#!/usr/bin/env python
"""Confiabilidad esperada de la red de cada genoma (excepción E4 del congelamiento).

El 90 % de cada red no se puede evaluar, pero la precisión depende de la distancia del motivo transferido (tier).
Con los pares evaluables en modo independent (sin autoevaluación, universo genome_tf) se estima la precisión de cada
tier y, para cada genoma, el promedio según la composición de tiers de su red. Con pocos pares, el valor del tier se
acerca a la precisión global de la red (suavizado con PRIOR pares).

Es una ESTIMACIÓN: supone que los TF sin regulón curado se comportan como los curados. Se comprueba con validación
cruzada por familia GTDB (se estima en unas familias y se predice la precisión observada en otras).

Uso: PYTHONPATH=. python src/networks/atlas_reliability.py
Salidas en data/results/reliability/: genomes.tsv, tier_precision.tsv, calibration.tsv, manifest.json
"""
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats

from src.atlas_common import NETWORKS, TIERS, check_dirty, git_commit, is_atlas_selection, load
from src.validation.atlas import build_gold_regprecise, collapse, evaluable, load_edges, load_motifs

OUT_DEFAULT = Path("data/results/reliability")
PRIOR = 20
FOLDS = 5
MIN_EVALUABLE = 20  # pares evaluables mínimos para comparar un genoma en la calibración
MIN_CALIBRATION_GENOMES = 30
CLOSE_TIERS = TIERS[:4]  # hasta la misma familia
SEED = 20261123


def tier_precision(ev):
    """Precisión suavizada por tier: (TP + PRIOR * p0) / (n + PRIOR)."""
    p0 = float(ev["is_gold"].mean()) if len(ev) else float("nan")
    t = ev.groupby("tier")["is_gold"].agg(n="size", tp="sum")
    t["precision_raw"] = t["tp"] / t["n"]
    t["precision"] = (t["tp"] + PRIOR * p0) / (t["n"] + PRIOR)
    return t, p0


def expected(pairs, tiers, p0):
    return pairs["tier"].map(tiers["precision"]).astype(float).fillna(p0)


def calibration_status(n_genomes, rho):
    """Qué tanto sirve la estimación para distinguir genomas dentro de una red."""
    if n_genomes < MIN_CALIBRATION_GENOMES or rho != rho:
        return "insufficient"
    return "not_informative" if rho < 0.3 else "weak" if rho < 0.6 else "useful"


def calibrate(ev, families):
    """Validación cruzada por familia: precisión predicha frente a observada en genomas no usados."""
    fam = ev[["genome_id"]].drop_duplicates().merge(families, on="genome_id", how="left")
    fam["unit"] = fam["gtdb_family"].fillna(fam["genome_id"].astype(str))
    units = np.sort(fam["unit"].unique())
    fold = dict(zip(np.random.default_rng(SEED).permutation(units), np.arange(len(units)) % FOLDS))
    ev = ev.merge(fam.assign(fold=fam["unit"].map(fold))[["genome_id", "fold"]], on="genome_id")
    rows = []
    for k in range(FOLDS):
        train, test = ev[ev["fold"] != k], ev[ev["fold"] == k]
        if train.empty or test.empty:
            continue
        tiers, p0 = tier_precision(train)
        test = test.assign(pred=expected(test, tiers, p0))
        rows.append(test.groupby("genome_id").agg(n=("is_gold", "size"), observed=("is_gold", "mean"),
                                                  predicted=("pred", "mean")).reset_index())
    out = pd.concat(rows)
    return out[out["n"] >= MIN_EVALUABLE]


def main():
    ap = argparse.ArgumentParser(description="Confiabilidad esperada por genoma")
    ap.add_argument("--out", type=Path, default=OUT_DEFAULT)
    args = ap.parse_args()
    dirty = check_dirty()
    args.out.mkdir(parents=True, exist_ok=True)
    genomes = load("genomes", ["genome_id", "accession", "ncbi_organism", "gtdb_family", "selection"])
    genomes["genome_id"] = genomes["genome_id"].astype("int64")
    genomes["in_atlas"] = is_atlas_selection(genomes["selection"])
    gold, membership, _, _ = build_gold_regprecise(genomes)
    motifs = load_motifs()
    out, tier_rows, calib = [], [], []
    for net_id, name in NETWORKS.items():
        e = load_edges(net_id, motifs, membership)
        pairs = collapse(e[~e["self_regulog"]])
        ev = evaluable(pairs, gold, "genome_tf")
        tiers, p0 = tier_precision(ev)
        tier_rows.append(tiers.reset_index().assign(network_id=net_id, network=name, global_precision=p0))
        d = pairs.assign(expected=expected(pairs, tiers, p0), close=pairs["tier"].isin(CLOSE_TIERS))
        g = d.groupby("genome_id").agg(n_pairs=("expected", "size"), expected_precision=("expected", "mean"),
                                       frac_close_tiers=("close", "mean")).reset_index()
        g.insert(0, "network", name)
        g.insert(0, "network_id", net_id)
        n_eval = ev.groupby("genome_id").size().rename("n_evaluable")
        g = g.join(n_eval, on="genome_id")
        g["n_evaluable"] = g["n_evaluable"].fillna(0).astype("int64")
        out.append(g.merge(genomes[["genome_id", "accession", "ncbi_organism", "in_atlas"]], on="genome_id"))
        c = calibrate(ev, genomes[["genome_id", "gtdb_family"]])
        rho = stats.spearmanr(c["predicted"], c["observed"]).statistic if len(c) >= 3 else float("nan")
        calib.append({"network_id": net_id, "network": name, "genomes": len(c), "spearman": float(rho),
                      "status": calibration_status(len(c), float(rho)),
                      "mae": float((c["predicted"] - c["observed"]).abs().mean()),
                      "bias": float((c["predicted"] - c["observed"]).mean()),
                      "observed_median": float(c["observed"].median()),
                      "predicted_median": float(c["predicted"].median())})
    pd.concat(out).to_csv(args.out / "genomes.tsv", sep="\t", index=False)
    pd.concat(tier_rows).to_csv(args.out / "tier_precision.tsv", sep="\t", index=False)
    cal = pd.DataFrame(calib)
    cal.to_csv(args.out / "calibration.tsv", sep="\t", index=False)
    manifest = {
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "git_commit": git_commit(),
        "git_dirty": dirty,
        "definition": {"estimate": "mean smoothed precision of the transfer tiers of the genome's TF-operon pairs",
                       "training": "independent mode, genome_tf universe", "prior_pairs": PRIOR,
                       "calibration_status": f"insufficient: < {MIN_CALIBRATION_GENOMES} genomes; Spearman < 0.3: "
                                             "not_informative; < 0.6: weak; otherwise useful",
                       "close_tiers": CLOSE_TIERS,
                       "calibration": f"{FOLDS}-fold cross-validation by GTDB family, genomes with >= {MIN_EVALUABLE} "
                                      "evaluable pairs",
                       "assumption": "TFs without a curated regulon behave like curated TFs"},
        "files": ["genomes.tsv", "tier_precision.tsv", "calibration.tsv"],
    }
    (args.out / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
    print(cal.round(3).to_string())
    print(pd.concat(out).query("in_atlas").groupby("network")["expected_precision"].describe().round(3).to_string())


if __name__ == "__main__":
    main()

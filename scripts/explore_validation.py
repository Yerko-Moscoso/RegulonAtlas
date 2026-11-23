#!/usr/bin/env python
"""Exploración previa de la validación del atlas contra RegPrecise (semana 10).

Lee solo la caché data/cache/atlas/ (no toca MariaDB) y responde, por red:
  - qué genomas son validables (tienen regulones curados mapeados),
  - qué fracción de los locus curados se empareja con genes del atlas,
  - qué TF curados no aparecen entre los TF de los motivos (posibles diferencias de nombre),
  - cuántas predicciones caen dentro del universo evaluable,
  - P/R/F1 preliminares a nivel TF -> operón, globales y por tier.

Uso (desde ~/proyecto):
    PYTHONPATH=. python scripts/explore_validation.py
Salidas:
    data/audit/validation_locus_mapping.tsv     (tasa de mapeo de locus por genoma)
    data/audit/validation_by_genome.tsv         (TP/FP/FN por red y genoma)
    data/audit/validation_by_tier.tsv           (TP/FP por red y tier)
    data/audit/validation_unmatched_tfs.tsv     (TF curados sin motivo con el mismo nombre)
    data/audit/validation_exploration.json      (resumen por red)
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pyarrow.parquet as pq

CACHE = Path("data/cache/atlas")
OUT = Path("data/audit")

NETWORK_NAMES = {1: "validated", 2: "high-precision", 3: "balanced", 4: "permissive", 5: "no-footprint"}


def load(name, cols=None):
    path = CACHE / f"{name}.parquet"
    if not path.exists():
        sys.exit(f"Falta {path}. Ejecuta 'make cache-atlas' primero.")
    if cols:
        have = set(pq.read_schema(path).names)
        missing = [c for c in cols if c not in have]
        if missing:
            sys.exit(f"{path.name}: faltan columnas {missing}. Disponibles: {sorted(have)}")
    return pd.read_parquet(path, columns=cols)


def norm_locus(s):
    s = (s.astype("string").str.strip()
         .str.replace(r"(?i)^gene[-_]", "", regex=True)
         .str.upper())
    return s.replace("", pd.NA)


def norm_tf(s):
    s = s.astype("string").str.strip().str.lower()
    return s.replace("", pd.NA)


def prf(tp, fp, fn):
    p = tp / (tp + fp) if tp + fp else np.nan
    r = tp / (tp + fn) if tp + fn else np.nan
    f = 2 * p * r / (p + r) if p and r and not np.isnan(p) and not np.isnan(r) else np.nan
    return p, r, f


def build_gold():
    cur = load("curated_regulons", ["regulog_id", "tf_name", "genome_name", "locus_tag", "gene_name"])
    gmap = load("regprecise_genome_map", ["genome_name", "accession"])
    genomes = load("genomes", ["genome_id", "accession", "ncbi_organism", "selection"])
    genes = load("genes_validation", ["gene_id", "genome_id", "locus_tag", "operon_id", "old_locus_tag"])

    n_cur = len(cur)
    cur = cur.merge(gmap.drop_duplicates("genome_name"), on="genome_name", how="left")
    cur = cur.merge(genomes[["genome_id", "accession"]], on="accession", how="left")
    no_genome = cur["genome_id"].isna().sum()
    cur = cur.dropna(subset=["genome_id"]).copy()
    cur["genome_id"] = cur["genome_id"].astype("int64")
    genes["genome_id"] = genes["genome_id"].astype("int64")

    cur["lt"] = norm_locus(cur["locus_tag"])
    genes["lt"] = norm_locus(genes["locus_tag"])
    genes["olt"] = norm_locus(genes["old_locus_tag"])

    by_lt = (genes.dropna(subset=["lt"]).drop_duplicates(["genome_id", "lt"])
             [["genome_id", "lt", "operon_id"]])
    by_olt = (genes.dropna(subset=["olt"]).drop_duplicates(["genome_id", "olt"])
              [["genome_id", "olt", "operon_id"]]
              .rename(columns={"olt": "lt", "operon_id": "operon_id_old"}))

    cur = cur.merge(by_lt, on=["genome_id", "lt"], how="left")
    cur = cur.merge(by_olt, on=["genome_id", "lt"], how="left")
    cur["match"] = np.where(cur["operon_id"].notna(), "locus_tag",
                            np.where(cur["operon_id_old"].notna(), "old_locus_tag", "none"))
    cur["operon_id"] = cur["operon_id"].fillna(cur["operon_id_old"])
    cur["tf"] = norm_tf(cur["tf_name"])

    # Tasa de mapeo por genoma
    mapping = (cur.groupby("genome_id")["match"].value_counts().unstack(fill_value=0)
               .reindex(columns=["locus_tag", "old_locus_tag", "none"], fill_value=0))
    mapping["n_curated"] = mapping.sum(axis=1)
    mapping["map_rate"] = 1 - mapping["none"] / mapping["n_curated"]
    mapping = mapping.reset_index().merge(
        genomes[["genome_id", "accession", "ncbi_organism", "selection"]], on="genome_id", how="left")

    gold = (cur.dropna(subset=["operon_id", "tf"])
            [["genome_id", "tf", "operon_id"]].drop_duplicates())
    gold["operon_id"] = gold["operon_id"].astype("int64")

    stats = {
        "curated_rows": int(n_cur),
        "curated_rows_without_genome": int(no_genome),
        "curated_rows_locus_tag": int((cur["match"] == "locus_tag").sum()),
        "curated_rows_old_locus_tag": int((cur["match"] == "old_locus_tag").sum()),
        "curated_rows_unmatched": int((cur["match"] == "none").sum()),
        "validable_genomes": int(gold["genome_id"].nunique()),
        "gold_pairs_tf_operon": int(len(gold)),
        "gold_genome_tf_pairs": int(len(gold[["genome_id", "tf"]].drop_duplicates())),
    }
    return gold, mapping, stats, genomes


def unmatched_tfs(gold):
    motifs = load("motifs", ["tf_name", "source"])
    motif_tfs = set(norm_tf(motifs["tf_name"]).dropna())
    g = gold.groupby("tf").agg(n_genomes=("genome_id", "nunique"), n_pairs=("operon_id", "size"))
    g = g[~g.index.isin(motif_tfs)].sort_values("n_pairs", ascending=False).reset_index()
    return g


def evaluate(net_id, gold, genomes):
    e = load(f"edges_net{net_id}", ["genome_id", "tf_name", "target_operon", "tier", "confidence"])
    e["tf"] = norm_tf(e["tf_name"])
    e = e.rename(columns={"target_operon": "operon_id"})
    e["genome_id"] = e["genome_id"].astype("int64")
    e["operon_id"] = e["operon_id"].astype("int64")
    # Un par TF -> operón por genoma; se queda la arista de mayor confidence (igual que la API)
    pairs = (e.sort_values("confidence", ascending=False)
             .drop_duplicates(["genome_id", "tf", "operon_id"])
             [["genome_id", "tf", "operon_id", "tier", "confidence"]])

    universe = gold[["genome_id", "tf"]].drop_duplicates()
    ev = pairs.merge(universe, on=["genome_id", "tf"], how="inner")
    ev = ev.merge(gold.assign(is_gold=True), on=["genome_id", "tf", "operon_id"], how="left")
    ev["is_gold"] = ev["is_gold"].fillna(False).astype(bool)

    tp = int(ev["is_gold"].sum())
    fp = int(len(ev) - tp)
    fn_all = int(len(gold) - tp)
    covered = set(pairs["genome_id"].unique())
    gold_cov = gold[gold["genome_id"].isin(covered)]
    fn_cov = int(len(gold_cov) - tp)

    p, r_all, f_all = prf(tp, fp, fn_all)
    _, r_cov, f_cov = prf(tp, fp, fn_cov)

    # Por genoma (para macro y para la tabla)
    g_pred = ev.groupby("genome_id").agg(n_pred_eval=("is_gold", "size"), tp=("is_gold", "sum"))
    g_gold = gold.groupby("genome_id").size().rename("n_gold")
    by_genome = pd.concat([g_gold, g_pred], axis=1).fillna(0).astype("int64")
    by_genome["fp"] = by_genome["n_pred_eval"] - by_genome["tp"]
    by_genome["fn"] = by_genome["n_gold"] - by_genome["tp"]
    by_genome["precision"] = by_genome["tp"] / by_genome["n_pred_eval"].replace(0, np.nan)
    by_genome["recall"] = by_genome["tp"] / by_genome["n_gold"].replace(0, np.nan)
    by_genome["has_edges"] = by_genome.index.isin(covered)
    by_genome = by_genome.reset_index().rename(columns={"index": "genome_id"})
    by_genome.insert(0, "network_id", net_id)
    by_genome = by_genome.merge(genomes[["genome_id", "accession", "ncbi_organism"]],
                                on="genome_id", how="left")

    by_tier = ev.groupby("tier").agg(n_pred_eval=("is_gold", "size"), tp=("is_gold", "sum")).reset_index()
    by_tier["fp"] = by_tier["n_pred_eval"] - by_tier["tp"]
    by_tier["precision"] = by_tier["tp"] / by_tier["n_pred_eval"]
    by_tier.insert(0, "network_id", net_id)

    cov = by_genome[by_genome["has_edges"]]
    summary = {
        "network_id": net_id,
        "name": NETWORK_NAMES[net_id],
        "tf_operon_pairs": int(len(pairs)),
        "pairs_in_evaluable_universe": int(len(ev)),
        "pairs_not_evaluable": int(len(pairs) - len(ev)),
        "validable_genomes_with_edges": int(cov["genome_id"].nunique()),
        "TP": tp, "FP": fp, "FN_all_gold": fn_all, "FN_covered_genomes": fn_cov,
        "precision_micro": p,
        "recall_micro_all_gold": r_all, "f1_all_gold": f_all,
        "recall_micro_covered": r_cov, "f1_covered": f_cov,
        "precision_macro_median": float(cov["precision"].median()) if len(cov) else None,
        "recall_macro_median": float(cov["recall"].median()) if len(cov) else None,
    }
    return summary, by_genome, by_tier


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    gold, mapping, stats, genomes = build_gold()

    print("== Gold standard RegPrecise proyectado a operones ==")
    for k, v in stats.items():
        print(f"  {k:32s} {v:,}")
    low = mapping[mapping["map_rate"] < 0.9]
    print(f"  genomas con mapeo de locus < 90 %: {len(low)} de {len(mapping)}")
    mapping.to_csv(OUT / "validation_locus_mapping.tsv", sep="\t", index=False)

    utf = unmatched_tfs(gold)
    utf.to_csv(OUT / "validation_unmatched_tfs.tsv", sep="\t", index=False)
    print(f"  TF curados sin motivo del mismo nombre: {len(utf)} "
          f"({utf['n_pairs'].sum():,} pares gold que ninguna red puede recuperar)")
    print("  top 10:", ", ".join(utf["tf"].head(10)))

    summaries, genomes_tbl, tiers_tbl = [], [], []
    print("\n== Por red (nivel TF -> operón) ==")
    print(f"{'red':16s} {'P':>6s} {'R_all':>6s} {'F1_all':>6s} {'R_cov':>6s} {'F1_cov':>6s}")
    for net_id in NETWORK_NAMES:
        s, bg, bt = evaluate(net_id, gold, genomes)
        summaries.append(s); genomes_tbl.append(bg); tiers_tbl.append(bt)
        print(f"{s['name']:16s} {s['precision_micro']:6.3f} {s['recall_micro_all_gold']:6.3f} "
              f"{s['f1_all_gold']:6.3f} {s['recall_micro_covered']:6.3f} {s['f1_covered']:6.3f}")
        print(f"{'':16s} pares={s['tf_operon_pairs']:,}  evaluables={s['pairs_in_evaluable_universe']:,}  "
              f"genomas validables con aristas={s['validable_genomes_with_edges']}")

    pd.concat(genomes_tbl).to_csv(OUT / "validation_by_genome.tsv", sep="\t", index=False)
    tiers = pd.concat(tiers_tbl)
    tiers.to_csv(OUT / "validation_by_tier.tsv", sep="\t", index=False)
    print("\n== Precisión por tier ==")
    print(tiers.to_string(index=False))

    with open(OUT / "validation_exploration.json", "w") as fh:
        json.dump({"gold": stats, "networks": summaries}, fh, indent=2, default=float)
    print(f"\nArchivos en {OUT}/validation_*")


if __name__ == "__main__":
    main()
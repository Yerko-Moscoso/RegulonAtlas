#!/usr/bin/env python
"""Validación de las redes del atlas contra un gold standard curado (semana 10, OE5).

Evaluación propia e independiente del pipeline externo. Lee solo la caché
data/cache/atlas/ y escribe los resultados en data/results/validation/.

Definición (documentada en docs/ y en manifest.json):
  - Nivel: TF -> operón. Los genes curados se proyectan a su operón (genes.operon_id).
    El emparejamiento de locus prueba locus_tag y luego old_locus_tag.
  - TF: nombre normalizado (minúsculas). Varios motivos del mismo TF se agrupan;
    por par (genoma, TF, operón) se conserva la arista de mayor confidence.
  - Universo (--universe):
      genome_tf  (por defecto) solo predicciones de pares (genoma, TF) con regulón curado.
      genome     todas las predicciones de genomas validables (variante estricta).
    Lo que queda fuera del universo se reporta como "no evaluable", no como FP.
  - Recall: sobre TODO el gold standard proyectado (igual que D33).
  - Modos:
      all          todas las aristas.
      independent  excluye aristas cuyo motivo de RegPrecise proviene de un regulog
                   que contiene al genoma evaluado (evita autoevaluación).
  - Curva P/R: barrido de confidence de 0 a 1 (paso 0,01) dentro de cada red y modo.

Uso (desde ~/proyecto):
    PYTHONPATH=. python src/validation/atlas.py --gold regprecise
"""
import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import pyarrow.parquet as pq

CACHE = Path("data/cache/atlas")
OUT_DEFAULT = Path("data/results/validation")
NETWORKS = {1: "validated", 2: "high-precision", 3: "balanced", 4: "permissive", 5: "no-footprint"}
D33 = {  # P, R, F1 reportados por el pipeline externo (referencia, no objetivo)
    1: (0.682, 0.231, 0.345), 2: (0.742, 0.041, 0.078), 3: (0.545, 0.343, 0.421),
    4: (0.307, 0.446, 0.364), 5: (0.548, 0.317, 0.402),
}
GRID = np.round(np.linspace(0, 1, 101), 2)
MODES = ("all", "independent")
UNIVERSES = ("genome_tf", "genome")
KEY = ["genome_id", "tf", "operon_id"]


# ---------------------------------------------------------------- utilidades
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
    return s.astype("string").str.strip().str.lower().replace("", pd.NA)


def safe_div(a, b):
    return float(a) / float(b) if b else float("nan")


def f1(p, r):
    return 2 * p * r / (p + r) if p == p and r == r and (p + r) > 0 else float("nan")


def git_commit():
    try:
        out = subprocess.run(["git", "rev-parse", "--short", "HEAD"],
                             capture_output=True, text=True, check=True)
        return out.stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return None


def git_dirty():
    """True si hay archivos versionados con cambios sin commit: en ese caso git_commit
    no describe el código que generó los resultados."""
    try:
        out = subprocess.run(["git", "status", "--porcelain", "--untracked-files=no"],
                             capture_output=True, text=True, check=True)
        return bool(out.stdout.strip())
    except (OSError, subprocess.CalledProcessError):
        return None


# ---------------------------------------------------------------- gold standard
def build_gold_regprecise(genomes):
    cur = load("curated_regulons", ["regulog_id", "tf_name", "genome_name", "locus_tag"])
    gmap = load("regprecise_genome_map", ["genome_name", "accession"])
    genes = load("genes_validation", ["genome_id", "locus_tag", "operon_id", "old_locus_tag"])

    n_cur = len(cur)
    cur = cur.merge(gmap.drop_duplicates("genome_name"), on="genome_name", how="left")
    cur = cur.merge(genomes[["genome_id", "accession"]], on="accession", how="left")
    no_genome = int(cur["genome_id"].isna().sum())
    cur = cur.dropna(subset=["genome_id"]).copy()
    cur["genome_id"] = cur["genome_id"].astype("int64")
    cur["regulog_id"] = cur["regulog_id"].astype("int64")

    # Pertenencia regulog -> genoma (para detectar autoevaluación)
    membership = cur[["regulog_id", "genome_id"]].drop_duplicates()

    genes["genome_id"] = genes["genome_id"].astype("int64")
    genes["lt"] = norm_locus(genes["locus_tag"])
    genes["olt"] = norm_locus(genes["old_locus_tag"])
    by_lt = (genes.dropna(subset=["lt"]).drop_duplicates(["genome_id", "lt"])
             [["genome_id", "lt", "operon_id"]])
    by_olt = (genes.dropna(subset=["olt"]).drop_duplicates(["genome_id", "olt"])
              [["genome_id", "olt", "operon_id"]]
              .rename(columns={"olt": "lt", "operon_id": "operon_id_old"}))

    cur["lt"] = norm_locus(cur["locus_tag"])
    cur = cur.merge(by_lt, on=["genome_id", "lt"], how="left")
    cur = cur.merge(by_olt, on=["genome_id", "lt"], how="left")
    cur["match"] = np.where(cur["operon_id"].notna(), "locus_tag",
                            np.where(cur["operon_id_old"].notna(), "old_locus_tag", "none"))
    cur["operon_id"] = cur["operon_id"].fillna(cur["operon_id_old"])
    cur["tf"] = norm_tf(cur["tf_name"])

    mapping = (cur.groupby("genome_id")["match"].value_counts().unstack(fill_value=0)
               .reindex(columns=["locus_tag", "old_locus_tag", "none"], fill_value=0))
    mapping["n_curated"] = mapping.sum(axis=1)
    mapping["map_rate"] = 1 - mapping["none"] / mapping["n_curated"]
    mapping = mapping.reset_index().merge(
        genomes[["genome_id", "accession", "ncbi_organism", "selection"]], on="genome_id", how="left")

    gold = cur.dropna(subset=["operon_id", "tf"])[KEY].drop_duplicates()
    gold["operon_id"] = gold["operon_id"].astype("int64")

    stats = {
        "source": "RegPrecise 3.0 (provenance prov_id=5)",
        "curated_rows": int(n_cur),
        "rows_without_genome": no_genome,
        "rows_matched_locus_tag": int((cur["match"] == "locus_tag").sum()),
        "rows_matched_old_locus_tag": int((cur["match"] == "old_locus_tag").sum()),
        "rows_unmatched_locus": int((cur["match"] == "none").sum()),
        "validable_genomes": int(gold["genome_id"].nunique()),
        "gold_genome_tf_pairs": int(len(gold[["genome_id", "tf"]].drop_duplicates())),
        "gold_tf_operon_pairs": int(len(gold)),
    }
    return gold, membership, mapping, stats


def build_gold(name, genomes):
    if name == "regprecise":
        return build_gold_regprecise(genomes)
    if name == "regulondb":
        sys.exit("Gold standard 'regulondb' aún no implementado (pendiente de aprobación y descarga).")
    sys.exit(f"Gold standard desconocido: {name}")


# ---------------------------------------------------------------- predicciones
def load_motifs():
    m = load("motifs", ["motif_id", "motif_key", "source"])
    m["regulog_id"] = pd.to_numeric(
        m["motif_key"].str.extract(r"^RG(\d+)$", expand=False), errors="coerce").astype("Int64")
    return m[["motif_id", "source", "regulog_id"]]


def load_edges(net_id, motifs, membership):
    e = load(f"edges_net{net_id}",
             ["genome_id", "motif_id", "tf_name", "target_operon", "tier", "confidence"])
    e = e.rename(columns={"target_operon": "operon_id"})
    e["genome_id"] = e["genome_id"].astype("int64")
    e["operon_id"] = e["operon_id"].astype("int64")
    e["tf"] = norm_tf(e["tf_name"])
    e = e.merge(motifs, on="motif_id", how="left")
    mem = membership.assign(self_regulog=True)
    mem["regulog_id"] = mem["regulog_id"].astype("Int64")
    e = e.merge(mem, on=["regulog_id", "genome_id"], how="left")
    e["self_regulog"] = e["self_regulog"].fillna(False).astype(bool)
    e["origin"] = np.select(
        [e["self_regulog"], e["source"].eq("regprecise"), e["source"].eq("prodoric")],
        ["self_regulog", "regprecise_transfer", "prodoric"], default="unknown")
    return e


def collapse(e):
    """Un par por (genoma, TF, operón): la arista de mayor confidence."""
    e = e.sort_values("confidence", ascending=False, kind="mergesort")
    return (e.drop_duplicates(KEY)[KEY + ["tier", "origin", "confidence"]]
            .reset_index(drop=True))


# ---------------------------------------------------------------- evaluación
def evaluable(pairs, gold, universe):
    if universe == "genome_tf":
        ev = pairs.merge(gold[["genome_id", "tf"]].drop_duplicates(), on=["genome_id", "tf"])
    else:
        ev = pairs[pairs["genome_id"].isin(gold["genome_id"].unique())]
    ev = ev.merge(gold.assign(is_gold=True), on=KEY, how="left")
    ev["is_gold"] = ev["is_gold"].fillna(False).astype(bool)
    return ev


def summarize(net_id, mode, universe, pairs, ev, gold):
    tp = int(ev["is_gold"].sum())
    fp = int(len(ev) - tp)
    fn = int(len(gold) - tp)
    p, r = safe_div(tp, tp + fp), safe_div(tp, len(gold))
    per_g = ev.groupby("genome_id").agg(n=("is_gold", "size"), tp=("is_gold", "sum"))
    g_gold = gold.groupby("genome_id").size()
    per_g = per_g.join(g_gold.rename("n_gold"), how="left")
    return {
        "network_id": net_id, "network": NETWORKS[net_id], "mode": mode, "universe": universe,
        "pairs_total": int(len(pairs)), "pairs_evaluable": int(len(ev)),
        "pairs_not_evaluable": int(len(pairs) - len(ev)),
        "genomes_evaluated": int(per_g.shape[0]),
        "TP": tp, "FP": fp, "FN": fn,
        "precision": p, "recall": r, "f1": f1(p, r),
        "precision_macro_median": float((per_g["tp"] / per_g["n"]).median()) if len(per_g) else None,
        "recall_macro_median": float((per_g["tp"] / per_g["n_gold"]).median()) if len(per_g) else None,
        "d33_precision": D33[net_id][0], "d33_recall": D33[net_id][1], "d33_f1": D33[net_id][2],
    }


def pr_curve(net_id, mode, pairs, ev, n_gold):
    conf = ev["confidence"].to_numpy()
    hit = ev["is_gold"].to_numpy()
    order = np.argsort(-conf, kind="mergesort")
    neg = -conf[order]
    tp_cum = np.cumsum(hit[order])
    neg_all = np.sort(-pairs["confidence"].to_numpy())
    rows = []
    for t in GRID:
        k = int(np.searchsorted(neg, -t, side="right"))      # pares evaluables con conf >= t
        k_all = int(np.searchsorted(neg_all, -t, side="right"))
        tp = int(tp_cum[k - 1]) if k else 0
        p, r = safe_div(tp, k), safe_div(tp, n_gold)
        rows.append({"network_id": net_id, "network": NETWORKS[net_id], "mode": mode,
                     "min_confidence": float(t), "pairs_total": k_all, "pairs_evaluable": k,
                     "TP": tp, "FP": k - tp, "precision": p, "recall": r, "f1": f1(p, r)})
    return rows


def breakdown(net_id, mode, ev, col):
    t = ev.groupby(col).agg(pairs_evaluable=("is_gold", "size"), TP=("is_gold", "sum")).reset_index()
    t["FP"] = t["pairs_evaluable"] - t["TP"]
    t["precision"] = t["TP"] / t["pairs_evaluable"]
    t.insert(0, "mode", mode)
    t.insert(0, "network", NETWORKS[net_id])
    t.insert(0, "network_id", net_id)
    return t


def by_genome(net_id, mode, ev, gold, genomes):
    g = ev.groupby("genome_id").agg(pairs_evaluable=("is_gold", "size"), TP=("is_gold", "sum"))
    g = gold.groupby("genome_id").size().rename("n_gold").to_frame().join(g, how="left").fillna(0)
    g = g.astype("int64")
    g["FP"] = g["pairs_evaluable"] - g["TP"]
    g["FN"] = g["n_gold"] - g["TP"]
    g["precision"] = g["TP"] / g["pairs_evaluable"].replace(0, np.nan)
    g["recall"] = g["TP"] / g["n_gold"]
    g = g.reset_index()
    g.insert(0, "mode", mode)
    g.insert(0, "network_id", net_id)
    return g.merge(genomes[["genome_id", "accession", "ncbi_organism", "gtdb_family"]],
                   on="genome_id", how="left")


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description="Validación de las redes del atlas")
    ap.add_argument("--gold", choices=["regprecise", "regulondb"], default="regprecise")
    ap.add_argument("--networks", type=int, nargs="+", default=list(NETWORKS))
    ap.add_argument("--out", type=Path, default=OUT_DEFAULT)
    args = ap.parse_args()
    dirty = git_dirty()
    if dirty:
        print("AVISO: hay cambios sin commit; el manifest registrará git_dirty=true. "
              "Haz commit y vuelve a ejecutar para que los resultados sean trazables.")

    out = args.out / args.gold
    out.mkdir(parents=True, exist_ok=True)
    genomes = load("genomes", ["genome_id", "accession", "ncbi_organism", "gtdb_family", "selection"])
    gold, membership, mapping, gstats = build_gold(args.gold, genomes)
    motifs = load_motifs()
    mapping.to_csv(out / "locus_mapping.tsv", sep="\t", index=False)
    print(f"Gold {args.gold}: {gstats['gold_tf_operon_pairs']:,} pares TF-operón en "
          f"{gstats['validable_genomes']} genomas")

    summary, curve, tiers, origins, genomes_tbl = [], [], [], [], []
    for net_id in args.networks:
        e = load_edges(net_id, motifs, membership)
        for mode in MODES:
            sub = e if mode == "all" else e[~e["self_regulog"]]
            pairs = collapse(sub)
            for universe in UNIVERSES:
                ev = evaluable(pairs, gold, universe)
                s = summarize(net_id, mode, universe, pairs, ev, gold)
                summary.append(s)
                print(f"  {NETWORKS[net_id]:15s} {mode:11s} {universe:9s} "
                      f"P={s['precision']:.3f} R={s['recall']:.3f} F1={s['f1']:.3f}")
                if universe != "genome_tf":
                    continue
                curve += pr_curve(net_id, mode, pairs, ev, len(gold))
                tiers.append(breakdown(net_id, mode, ev, "tier"))
                origins.append(breakdown(net_id, mode, ev, "origin"))
                genomes_tbl.append(by_genome(net_id, mode, ev, gold, genomes))

    files = {
        "summary.tsv": pd.DataFrame(summary),
        "pr_curve.tsv": pd.DataFrame(curve),
        "by_tier.tsv": pd.concat(tiers),
        "by_origin.tsv": pd.concat(origins),
        "by_genome.tsv": pd.concat(genomes_tbl),
    }
    for name, df in files.items():
        df.to_csv(out / name, sep="\t", index=False)

    cache_manifest = CACHE / "manifest.json"
    manifest = {
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "git_commit": git_commit(),
        "git_dirty": dirty,
        "cache_manifest": json.loads(cache_manifest.read_text()) if cache_manifest.exists() else None,
        "gold": args.gold,
        "gold_stats": gstats,
        "definition": {
            "level": "TF -> operon",
            "tf_matching": "normalized name (lowercase)",
            "locus_matching": "locus_tag, then old_locus_tag; prefix gene-/gene_ removed",
            "pair_collapse": "max confidence per (genome, TF, operon)",
            "recall_denominator": "all projected gold pairs",
            "universes": {"genome_tf": "pairs (genome, TF) with curated regulon (default)",
                          "genome": "all predictions in validable genomes"},
            "modes": {"all": "all edges",
                      "independent": "excludes RegPrecise motifs whose source regulog "
                                     "contains the evaluated genome"},
            "pr_curve_grid": "confidence 0.00-1.00, step 0.01",
        },
        "networks": args.networks,
        "files": sorted(files) + ["locus_mapping.tsv"],
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
    print(f"Resultados en {out}/")


if __name__ == "__main__":
    main()
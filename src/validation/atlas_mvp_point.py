#!/usr/bin/env python
"""Red del MVP frente a las redes del atlas, con la misma definición (excepción E6 del congelamiento).

El MVP cubre 8 genomas y las curvas de Validation 312, así que sus puntos no se pueden poner sobre esas curvas sin
comparar poblaciones distintas. Aquí las redes del MVP (por umbral de p) y las 5 del atlas se evalúan en los MISMOS
8 genomas contra RegPrecise: TF -> operón, universo genome_tf, modos all e independent.
En independent, un par del MVP se conserva si tiene al menos un motivo que no sea de un regulog del propio genoma;
el MVP guarda un solo p por arista, así que el umbral se aplica a ese p.

Uso (después de make mvp y make validate-atlas): PYTHONPATH=. python src/validation/atlas_mvp_point.py
Salidas en data/results/validation_mvp/: points.tsv, manifest.json
"""
import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from src.atlas_common import KEY, NETWORKS, check_dirty, git_commit, load, norm_locus, norm_tf
from src.validation.atlas import build_gold_regprecise, collapse, evaluable, f1, load_edges, load_motifs, safe_div

MVP = Path("data/results/mvp/networks")
ACCESSIONS = Path("config/mvp_genomes.txt")
OUT_DEFAULT = Path("data/results/validation_mvp")
THRESHOLDS = [5.0, 5.5, 6.0, 6.5, 7.0]


def read_accessions():
    return [ln.split("#")[0].strip() for ln in ACCESSIONS.read_text().splitlines() if ln.split("#")[0].strip()]


def has_independent_motif(motifs, genome_id, self_regulogs):
    """True si algún motivo no proviene de un regulog que contiene al genoma."""
    items = [m for m in re.split(r"[,;|\s]+", str(motifs)) if m]
    return any(not ((x := re.fullmatch(r"RG(\d+)", m)) and (int(x.group(1)), genome_id) in self_regulogs)
               for m in items)


def load_mvp(accessions, genomes, membership):
    ids = genomes.set_index("accession")["genome_id"]
    genes = load("genes_validation", ["genome_id", "locus_tag", "old_locus_tag", "operon_id"])
    genes["genome_id"] = genes["genome_id"].astype("int64")
    genes = genes[genes["genome_id"].isin(ids.loc[accessions])]
    lt = genes.assign(lt=norm_locus(genes["locus_tag"]))[["genome_id", "lt", "operon_id"]]
    old = genes.assign(lt=norm_locus(genes["old_locus_tag"]))[["genome_id", "lt", "operon_id"]]
    loci = pd.concat([lt, old]).dropna().drop_duplicates(["genome_id", "lt"])
    self_regulogs = set(map(tuple, membership[["regulog_id", "genome_id"]].astype(int).to_numpy()))
    frames = []
    for acc in accessions:
        path = MVP / f"{acc}.edges.tsv"
        if not path.exists():
            sys.exit(f"Falta {path}. Ejecuta make mvp primero.")
        d = pd.read_csv(path, sep="\t")
        gid = int(ids[acc])
        d = d.assign(genome_id=gid, tf=norm_tf(d["tf"]), lt=norm_locus(d["target_locus_tag"]))
        d["independent"] = [has_independent_motif(m, gid, self_regulogs) for m in d["motifs"]]
        frames.append(d[["genome_id", "tf", "lt", "neg_log10_p", "independent"]])
    e = pd.concat(frames).merge(loci, on=["genome_id", "lt"], how="left")
    unmatched = int(e["operon_id"].isna().sum())
    total = len(e)
    e = e.dropna(subset=["operon_id", "tf"]).copy()
    e["operon_id"] = e["operon_id"].astype("int64")
    return e, {"mvp_edges": total, "mvp_edges_without_operon": unmatched}


def score(pairs, gold):
    ev = evaluable(pairs, gold, "genome_tf")
    tp = int(ev["is_gold"].sum())
    p, r = safe_div(tp, len(ev)), safe_div(tp, len(gold))
    return {"pairs_total": len(pairs), "pairs_evaluable": len(ev), "TP": tp, "FP": len(ev) - tp, "FN": len(gold) - tp,
            "precision": p, "recall": r, "f1": f1(p, r)}


def main():
    ap = argparse.ArgumentParser(description="MVP frente a las redes del atlas en los mismos genomas")
    ap.add_argument("--out", type=Path, default=OUT_DEFAULT)
    args = ap.parse_args()
    dirty = check_dirty()
    args.out.mkdir(parents=True, exist_ok=True)
    genomes = load("genomes", ["genome_id", "accession", "ncbi_organism", "gtdb_family", "selection"])
    genomes["genome_id"] = genomes["genome_id"].astype("int64")
    accessions = read_accessions()
    ids = set(genomes.loc[genomes["accession"].isin(accessions), "genome_id"])
    gold, membership, _, _ = build_gold_regprecise(genomes)
    gold = gold[gold["genome_id"].isin(ids)]
    mvp, mstats = load_mvp(accessions, genomes, membership)
    rows = []
    for mode in ("all", "independent"):
        sub = mvp if mode == "all" else mvp[mvp["independent"]]
        for thr in THRESHOLDS:
            pairs = sub[sub["neg_log10_p"] >= thr][KEY].drop_duplicates()
            rows.append({"source": "mvp", "label": f"MVP p<=1e-{thr:g}", "network_id": None, "neg_log10_p": thr,
                         "mode": mode, **score(pairs, gold)})
    motifs = load_motifs()
    for net_id, name in NETWORKS.items():
        e = load_edges(net_id, motifs, membership)
        e = e[e["genome_id"].isin(ids)]
        for mode in ("all", "independent"):
            pairs = collapse(e if mode == "all" else e[~e["self_regulog"]])
            rows.append({"source": "atlas", "label": name, "network_id": net_id, "neg_log10_p": None, "mode": mode,
                         **score(pairs, gold)})
    t = pd.DataFrame(rows)
    t.to_csv(args.out / "points.tsv", sep="\t", index=False)
    manifest = {
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "git_commit": git_commit(),
        "git_dirty": dirty, "genomes": accessions, "gold_pairs": int(len(gold)), **mstats,
        "definition": {"level": "TF -> operon", "universe": "genome_tf", "gold": "RegPrecise",
                       "scope": "the 8 MVP genomes for both the MVP and the atlas networks"},
        "files": ["points.tsv"],
    }
    (args.out / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
    print(mstats, "gold", len(gold))
    print(t.drop(columns=["network_id"]).round(3).to_string())


if __name__ == "__main__":
    main()

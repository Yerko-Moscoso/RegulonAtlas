#!/usr/bin/env python3
"""
Etapa 2 - Construcción de las redes regulatorias TF -> gen.

Para cada genoma del subconjunto:
  1. Hits FIMO con p <= 10^-min_neg_log10_p (caché).
  2. Filtro de ortólogos: solo motivos elegibles en ese genoma según
     transfer_map.tsv y params["eligible_rules"].
  3. Aristas directas: un par DISTINTO (TF, gen) por genoma. Varios sitios del
     mismo TF frente al mismo gen, o varios motivos del mismo TF, son una sola
     arista; se guarda el mejor p-value y los motivos que la sustentan.
  4. Propagación por operones (si params["propagate_operons"]): un sitio frente
     a un gen regula a ese gen y a los genes que se transcriben después de él
     en el mismo operón (según genes.operon_id y el orden en la hebra).
     La arista propagada hereda el p-value del sitio y queda marcada con
     evidence = "operon" y via_locus_tag = gen donde está el sitio.

Salida por genoma: <results>/networks/<accession>.edges.tsv
  tf, target_gene_id, target_locus_tag, target_gene_name, neg_log10_p,
  evidence (direct | operon), via_locus_tag, motifs
Las aristas se guardan desde min_neg_log10_p; las etapas siguientes filtran
por el umbral de la red (network_neg_log10_p) o por cada umbral de validación.

Uso: python -m src.pipeline.build_networks [--params ...]
"""
from __future__ import annotations

import argparse
import logging
import sys

import pandas as pd

from src.pipeline.common import (cache_dir, load_params, now_utc, read_accessions,
                                 results_dir, setup_logging, write_provenance)

log = logging.getLogger("build_networks")

EDGE_COLUMNS = ["tf", "target_gene_id", "target_locus_tag", "target_gene_name",
                "neg_log10_p", "evidence", "via_locus_tag", "motifs"]


def downstream_map(genes: pd.DataFrame) -> dict[int, list[int]]:
    """gene_id -> [gene_id, genes siguientes del mismo operón en sentido de transcripción]."""
    out = {int(g): [int(g)] for g in genes["gene_id"]}
    op = genes.dropna(subset=["operon_id"])
    for _, grp in op.groupby("operon_id", sort=False):
        if len(grp) < 2:
            continue
        strand = grp["strand"].iloc[0]
        order = grp.sort_values("start_pos", ascending=(strand != "-"))["gene_id"].astype(int).tolist()
        for i, g in enumerate(order):
            out[g] = order[i:]
    return out


def build_network(hits: pd.DataFrame, motifs: pd.DataFrame, genes: pd.DataFrame,
                  eligible: set[int], propagate: bool) -> tuple[pd.DataFrame, dict]:
    stats = {"hits": int(len(hits))}
    h = hits[hits["motif_id"].isin(eligible)]
    stats["hits_eligible"] = int(len(h))
    h = h.merge(motifs[["motif_id", "motif_key", "tf_name"]], on="motif_id").dropna(subset=["tf_name"])

    direct = (h.groupby(["tf_name", "gene_id"], sort=False)
                .agg(neg_log10_p=("neg_log10_p", "max"),
                     motifs=("motif_key", lambda s: ",".join(sorted(set(s)))))
                .reset_index().rename(columns={"tf_name": "tf"}))
    stats["edges_direct"] = int(len(direct))

    if propagate:
        down = downstream_map(genes)
        prop = direct.assign(target_gene_id=direct["gene_id"].map(lambda g: down.get(int(g), [int(g)])))
        prop = prop.explode("target_gene_id", ignore_index=True)
    else:
        prop = direct.assign(target_gene_id=direct["gene_id"])
    prop["target_gene_id"] = prop["target_gene_id"].astype(int)
    prop["is_direct"] = prop["target_gene_id"] == prop["gene_id"]

    # Una arista por (TF, gen blanco): mejor p-value; "direct" si existe un
    # sitio frente al propio gen, si no "operon" (vía el gen con mejor sitio).
    prop = prop.sort_values(["tf", "target_gene_id", "is_direct", "neg_log10_p"],
                            ascending=[True, True, False, False], kind="mergesort")
    best_p = prop.groupby(["tf", "target_gene_id"])["neg_log10_p"].transform("max")
    edges = prop.drop_duplicates(["tf", "target_gene_id"]).copy()
    edges["neg_log10_p"] = best_p.loc[edges.index]
    edges["evidence"] = edges["is_direct"].map({True: "direct", False: "operon"})

    info = genes.set_index("gene_id")[["locus_tag", "gene_name"]]
    edges["target_locus_tag"] = edges["target_gene_id"].map(info["locus_tag"])
    edges["target_gene_name"] = edges["target_gene_id"].map(info["gene_name"])
    edges["via_locus_tag"] = edges["gene_id"].map(info["locus_tag"]).where(edges["evidence"] == "operon")

    edges = edges[EDGE_COLUMNS].sort_values(["tf", "target_locus_tag"], kind="mergesort", ignore_index=True)
    stats["edges_total"] = int(len(edges))
    stats["edges_from_operon_propagation"] = int((edges["evidence"] == "operon").sum())
    return edges, stats


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--params")
    args = ap.parse_args(argv)
    setup_logging()
    started = now_utc()
    params = load_params(args.params)
    cache, res = cache_dir(params), results_dir(params)
    out = res / "networks"
    out.mkdir(parents=True, exist_ok=True)

    inputs = {"genomes": cache / "genomes.tsv", "motifs": cache / "motifs.tsv",
              "genes": cache / "genes.tsv.gz", "fimo_hits": cache / "fimo_hits.tsv.gz",
              "transfer_map": res / "transfer_map" / "transfer_map.tsv"}
    genomes = pd.read_csv(inputs["genomes"], sep="\t")
    motifs = pd.read_csv(inputs["motifs"], sep="\t")
    genes = pd.read_csv(inputs["genes"], sep="\t", dtype={"gene_name": str, "locus_tag": str})
    hits = pd.read_csv(inputs["fimo_hits"], sep="\t")
    tmap = pd.read_csv(inputs["transfer_map"], sep="\t")
    tmap = tmap[tmap["rule"].isin(params["eligible_rules"])]

    acc2gid = dict(zip(genomes["accession"], genomes["genome_id"]))
    outputs, per_genome = {}, {}
    for acc in read_accessions(params["accessions_file"]):
        gid = int(acc2gid[acc])
        eligible = set(tmap.loc[tmap["genome_id"] == gid, "motif_id"].astype(int))
        edges, stats = build_network(
            hits[hits["genome_id"] == gid], motifs, genes[genes["genome_id"] == gid],
            eligible, params["propagate_operons"])
        path = out / f"{acc}.edges.tsv"
        edges.to_csv(path, sep="\t", index=False)
        outputs[acc] = path
        per_genome[acc] = {"eligible_motifs": len(eligible), **stats}
        log.info("%s: %s", acc, per_genome[acc])

    write_provenance(out / "networks.provenance.json", "build_networks", params, inputs,
                     outputs, started, extra={"per_genome": per_genome})
    return 0


if __name__ == "__main__":
    sys.exit(main())

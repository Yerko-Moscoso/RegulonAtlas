#!/usr/bin/env python3
"""
Etapa 1 - Detección de ortólogos del TF (mapa de elegibilidad motivo -> genoma).

Un hit de FIMO solo entra a la red si el TF del motivo tiene evidencia de
estar presente en el genoma. Cada par (motivo, genoma) recibe la PRIMERA
regla que cumple, en este orden:

  source_genome  El genoma es el organismo de origen del motivo.
  ortholog       El genoma tiene un gen del mismo grupo ortólogo eggNOG (og)
                 que el TF en su organismo de origen y con el mismo nombre.
  ortholog_og    Mismo grupo ortólogo, nombre distinto o ausente (puede
                 incluir parálogos de familias grandes: LacI, MerR, ...).
  name_match     Mismo nombre de gen (gene_name o preferred_name), sin
                 evidencia de grupo ortólogo.

La red usa las reglas de params["eligible_rules"] (por defecto
source_genome + ortholog); el mapa guarda todas para poder comparar.

tier = distancia taxonómica GTDB al organismo de origen más cercano:
  same_genome, same_species, same_genus, same_family, same_order,
  same_class, same_phylum, cross_phylum, unknown (origen no resuelto).

Entrada: caché (data/cache/mvp).  Salida: <results>/transfer_map/.
Uso:     python -m src.pipeline.build_transfer_map [--params ...] [--strict]
"""
from __future__ import annotations

import argparse
import logging
import sys
from collections import Counter, defaultdict

import pandas as pd

from src.pipeline.common import (cache_dir, load_params, norm_name, now_utc, read_accessions,
                                 results_dir, setup_logging, tf_aliases, write_provenance)
from src.pipeline.motif_sources import build_source_resolver, regulog_accessions

log = logging.getLogger("build_transfer_map")

RULES = ["source_genome", "ortholog", "ortholog_og", "name_match"]
RANKS = [
    ("gtdb_species", "same_species"),
    ("gtdb_genus", "same_genus"),
    ("gtdb_family", "same_family"),
    ("gtdb_order", "same_order"),
    ("gtdb_class", "same_class"),
    ("gtdb_phylum", "same_phylum"),
]


def build_gene_indexes(gene_index: pd.DataFrame, source_ids: set[int]):
    """Índices invertidos: nombre -> genomas, og -> genomas, (og, nombre) -> genomas."""
    alias_idx, og_idx, pair_idx = defaultdict(set), defaultdict(set), defaultdict(set)
    name_ogs = defaultdict(set)
    src_pairs, src_names = defaultdict(set), defaultdict(set)
    stats = Counter()
    for gid, gene_name, pref, og in gene_index[["genome_id", "gene_name", "preferred_name", "og"]].itertuples(index=False):
        gid = int(gid)
        stats["genes"] += 1
        og = og if isinstance(og, str) and og and og != "-" else None
        names = {norm_name(gene_name), norm_name(pref)} - {""}
        if og:
            stats["genes_with_og"] += 1
            og_idx[og].add(gid)
        for n in names:
            alias_idx[n].add(gid)
            if og:
                pair_idx[(og, n)].add(gid)
                name_ogs[n].add(og)
        if gid in source_ids:
            src_names[gid] |= names
            if og:
                src_pairs[gid] |= {(og, n) for n in names}
    return alias_idx, og_idx, pair_idx, name_ogs, src_pairs, src_names, stats


def compute_transfer_map(motifs, targets, motif_sources, idx, ranks, gid2acc):
    alias_idx, og_idx, pair_idx, name_ogs, src_pairs, src_names, _ = idx
    rows, diag, tf_not_in_source = [], Counter(), []

    for m in motifs.itertuples(index=False):
        aliases = tf_aliases(m.tf_name)
        if not aliases:
            diag["motifs_without_tf_name"] += 1
            continue
        sources = motif_sources[m.motif_id]

        # OG del TF en su(s) organismo(s) de origen.
        src_ogs = {og for s in sources for (og, n) in src_pairs.get(s, ()) if n in aliases}
        if sources and not any(aliases & src_names.get(s, set()) for s in sources):
            diag["motifs_tf_not_found_in_source"] += 1
            if len(tf_not_in_source) < 30:
                tf_not_in_source.append({"motif_key": m.motif_key, "tf_name": m.tf_name,
                                         "source_taxon": m.source_taxon})
        # Respaldo: sin OG en el origen, OGs de genes homónimos.
        anchor_ogs = src_ogs or {og for a in aliases for og in name_ogs.get(a, ())}
        diag["anchor_" + ("source" if src_ogs else "name" if anchor_ogs else "none")] += 1

        g_ortholog = set().union(*(pair_idx.get((og, a), set()) for og in anchor_ogs for a in aliases)) if anchor_ogs else set()
        g_og = set().union(*(og_idx.get(og, set()) for og in src_ogs)) if src_ogs else set()
        g_name = set().union(*(alias_idx.get(a, set()) for a in aliases))

        src_rank_values = {r: {ranks[s][r] for s in sources if s in ranks and ranks[s][r]} for r, _ in RANKS}

        def tier(t: int) -> str:
            if not sources:
                return "unknown"
            if t in sources:
                return "same_genome"
            for rank, label in RANKS:
                if ranks[t][rank] and ranks[t][rank] in src_rank_values[rank]:
                    return label
            return "cross_phylum"

        for t in (sources | g_ortholog | g_og | g_name) & targets:
            rule = ("source_genome" if t in sources else "ortholog" if t in g_ortholog
                    else "ortholog_og" if t in g_og else "name_match")
            rows.append((m.motif_id, m.motif_key, m.tf_name, t, gid2acc[t], rule, tier(t)))

    df = pd.DataFrame(rows, columns=["motif_id", "motif_key", "tf_name", "genome_id", "accession", "rule", "tier"])
    df = df.sort_values(["motif_id", "genome_id"], kind="mergesort", ignore_index=True)
    return df, diag, tf_not_in_source


def reference_check(df, curated_tfs, ref_gid, rules) -> list[str]:
    eligible = df[(df["genome_id"] == ref_gid) & (df["rule"].isin(rules))]
    covered = set().union(*(tf_aliases(t) for t in eligible["tf_name"])) if len(eligible) else set()
    return sorted(t for t in curated_tfs if not (tf_aliases(t) & covered))


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--params")
    ap.add_argument("--strict", action="store_true",
                    help="Error si algún TF curado de la referencia queda sin motivo elegible.")
    args = ap.parse_args(argv)
    setup_logging()
    started = now_utc()
    params = load_params(args.params)
    cache, out = cache_dir(params), results_dir(params) / "transfer_map"
    out.mkdir(parents=True, exist_ok=True)

    inputs = {n: cache / f for n, f in [
        ("genomes", "genomes.tsv"), ("motifs", "motifs.tsv"),
        ("regprecise_genome_map", "regprecise_genome_map.tsv"),
        ("regprecise_regulogs", "regprecise_regulogs.tsv"),
        ("curated_regulons", "curated_regulons.tsv"), ("gene_index", "gene_index.tsv.gz")]}
    genomes = pd.read_csv(inputs["genomes"], sep="\t", keep_default_na=False, na_values=[""])
    motifs = pd.read_csv(inputs["motifs"], sep="\t")
    rp_map = pd.read_csv(inputs["regprecise_genome_map"], sep="\t")
    regulogs = pd.read_csv(inputs["regprecise_regulogs"], sep="\t")
    curated = pd.read_csv(inputs["curated_regulons"], sep="\t")
    gene_index = pd.read_csv(inputs["gene_index"], sep="\t", dtype={"gene_name": str, "preferred_name": str, "og": str})

    acc2gid = {a: int(g) for a, g in zip(genomes["accession"], genomes["genome_id"])}
    gid2acc = {g: a for a, g in acc2gid.items()}
    accessions = read_accessions(params["accessions_file"])
    targets = {acc2gid[a] for a in accessions}

    rp_name_acc = dict(rp_map.dropna(subset=["accession"])[["genome_name", "accession"]].itertuples(index=False))
    resolve = build_source_resolver(genomes, regulog_accessions(regulogs), rp_name_acc)
    motif_sources, resolution = {}, Counter()
    for m in motifs.itertuples(index=False):
        accs, method = resolve(m.motif_key, m.source, m.source_taxon)
        motif_sources[m.motif_id] = {acc2gid[a] for a in accs if a in acc2gid}
        resolution[f"{m.source}:{method}"] += 1
    source_ids = set().union(*motif_sources.values())
    log.info("Origen de los motivos: %s", dict(resolution))

    idx = build_gene_indexes(gene_index, source_ids)
    ranks = genomes.set_index("genome_id")[[r for r, _ in RANKS]].fillna("").to_dict("index")
    df, diag, tf_not_in_source = compute_transfer_map(motifs, targets, motif_sources, idx, ranks, gid2acc)

    rules = params["eligible_rules"]
    ref = params["reference_accession"]
    ref_curated = set(curated.loc[curated["accession"] == ref, "tf_name"])
    ref_missing = reference_check(df, ref_curated, acc2gid[ref], rules) if ref in acc2gid else None

    summary = {
        "pairs": int(len(df)),
        "by_rule": {r: int(n) for r, n in df["rule"].value_counts().reindex(RULES, fill_value=0).items()},
        "by_tier": {t: int(n) for t, n in df["tier"].value_counts().items()},
        "pairs_used_by_network": int(df["rule"].isin(rules).sum()),
    }
    log.info("Pares: %s | por regla: %s", f"{summary['pairs']:,}", summary["by_rule"])
    log.info("Por tier: %s | diagnóstico: %s", summary["by_tier"], dict(diag))
    if ref_missing:
        log.warning("TF curados de %s sin motivo elegible (%s): %s", ref, ",".join(rules), ref_missing)

    tsv = out / "transfer_map.tsv"
    df.to_csv(tsv, sep="\t", index=False)
    write_provenance(
        out / "transfer_map.provenance.json", "build_transfer_map", params, inputs,
        {"transfer_map": tsv}, started,
        extra={"rules_priority": RULES, "source_resolution": dict(resolution),
               "genes_indexed": dict(idx[-1]), "diagnostics": dict(diag),
               "motifs_tf_not_found_in_source_examples": tf_not_in_source,
               "reference_check": {"reference": ref, "rules": rules,
                                   "curated_tfs_without_eligible_motif": ref_missing},
               "summary": summary},
    )
    log.info("Escrito %s", tsv)
    return 1 if (args.strict and ref_missing) else 0


if __name__ == "__main__":
    sys.exit(main())

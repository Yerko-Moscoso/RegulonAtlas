#!/usr/bin/env python3
"""
Etapa 0 - Caché de datos del subconjunto (única etapa que usa MariaDB).

Exporta, en modo SOLO LECTURA, todo lo que el resto del pipeline necesita
para los genomas de config/mvp_genomes.txt:

  genomes.tsv                 todos los genomas (taxonomía GTDB y NCBI)
  motifs.tsv                  catálogo de motivos (PRODORIC + RegPrecise)
  regprecise_genome_map.tsv   genome_name de RegPrecise -> accession
  regprecise_regulogs.tsv     regulog_id -> accession (origen de cada PWM)
  curated_regulons.tsv        interacciones curadas de los genomas objetivo
  genes.tsv.gz                genes de los genomas objetivo (con operon_id)
  fimo_hits.tsv.gz            hits FIMO de los genomas objetivo, p <= 10^-min_neg_log10_p
  gene_index.tsv.gz           nombre y grupo ortólogo eggNOG de las proteínas de
                              los genomas objetivo y de origen de los motivos
  cache_manifest.json         procedencia: consultas SQL, versión del servidor,
                              conteos y sha256 de cada archivo

Después de esta etapa, `make mvp` regenera todo sin conectarse a la base.

Uso:  python -m src.pipeline.export_cache [--params config/mvp_params.json]
"""
from __future__ import annotations

import argparse
import logging
import sys

import pandas as pd
from sqlalchemy import bindparam, text

from src.database.connection import get_engine
from src.pipeline.common import (cache_dir, load_params, now_utc, read_accessions,
                                 setup_logging, write_provenance)
from src.pipeline.motif_sources import build_source_resolver, regulog_accessions

log = logging.getLogger("export_cache")
GENE_INDEX_CHUNK = 100

SQL = {
    "genomes": """
        SELECT genome_id, accession, ncbi_organism, gtdb_domain, gtdb_phylum, gtdb_class,
               gtdb_order, gtdb_family, gtdb_genus, gtdb_species, completeness,
               contamination, assembly_level, selection
        FROM genomes""",
    "motifs": """
        SELECT motif_id, motif_key, source, tf_name, tf_family, source_taxon, length
        FROM motifs""",
    "regprecise_genome_map": """
        SELECT genome_name, accession, source, resolved_name, assembly_level
        FROM regprecise_genome_map""",
    "regprecise_regulogs": """
        SELECT DISTINCT cr.regulog_id, rm.accession
        FROM curated_regulons cr
        JOIN regprecise_genome_map rm ON cr.genome_name = rm.genome_name
        WHERE rm.accession IS NOT NULL""",
    "curated_regulons": """
        SELECT rm.accession, cr.regulog_id, cr.tf_name, cr.locus_tag, cr.gene_name
        FROM curated_regulons cr
        JOIN regprecise_genome_map rm ON cr.genome_name = rm.genome_name
        WHERE rm.accession IN :accs""",
    "genes": """
        SELECT gene_id, genome_id, locus_tag, contig, start_pos, end_pos, strand,
               protein_id, gene_name, biotype, operon_id, operon_role
        FROM genes WHERE genome_id IN :ids""",
    "fimo_hits": """
        SELECT genome_id, gene_id, motif_id, neg_log10_p
        FROM fimo_hits
        WHERE genome_id IN :ids AND neg_log10_p >= :min_p""",
    "gene_index": """
        SELECT g.genome_id, g.gene_name, ann.preferred_name, ann.og
        FROM genes g
        LEFT JOIN annotations ann ON ann.gene_id = g.gene_id
        WHERE g.genome_id IN :ids AND g.protein_id IS NOT NULL""",
}


def q(name: str, *expanding: str):
    return text(SQL[name]).bindparams(*(bindparam(e, expanding=True) for e in expanding))


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--params", help="Archivo de parámetros (por defecto config/mvp_params.json)")
    args = ap.parse_args(argv)
    setup_logging()
    started = now_utc()

    params = load_params(args.params)
    accessions = read_accessions(params["accessions_file"])
    out = cache_dir(params)
    out.mkdir(parents=True, exist_ok=True)
    engine = get_engine()

    genomes = pd.read_sql(q("genomes"), engine)
    acc2gid = dict(zip(genomes["accession"], genomes["genome_id"]))
    unknown = [a for a in accessions if a not in acc2gid]
    if unknown:
        log.error("Accessions que no están en genomes: %s", unknown)
        return 2
    target_ids = [int(acc2gid[a]) for a in accessions]

    motifs = pd.read_sql(q("motifs"), engine)
    rp_map = pd.read_sql(q("regprecise_genome_map"), engine)
    regulogs = pd.read_sql(q("regprecise_regulogs"), engine)
    curated = pd.read_sql(q("curated_regulons", "accs"), engine, params={"accs": accessions})
    genes = pd.read_sql(q("genes", "ids"), engine, params={"ids": target_ids})
    hits = pd.read_sql(q("fimo_hits", "ids"), engine,
                       params={"ids": target_ids, "min_p": params["min_neg_log10_p"]})
    log.info("genomas=%s motivos=%s genes=%s hits=%s curadas=%s",
             len(genomes), len(motifs), len(genes), len(hits), len(curated))

    # Genomas de origen de los motivos: se necesitan sus nombres y OGs para la
    # detección de ortólogos (build_transfer_map).
    rp_name_acc = dict(rp_map.dropna(subset=["accession"])[["genome_name", "accession"]].itertuples(index=False))
    resolve = build_source_resolver(genomes, regulog_accessions(regulogs), rp_name_acc)
    source_accs = set()
    for m in motifs.itertuples(index=False):
        accs, _ = resolve(m.motif_key, m.source, m.source_taxon)
        source_accs |= accs
    index_ids = sorted(set(target_ids) | {int(acc2gid[a]) for a in source_accs if a in acc2gid})

    parts = []
    with engine.connect() as conn:
        for i in range(0, len(index_ids), GENE_INDEX_CHUNK):
            chunk = index_ids[i:i + GENE_INDEX_CHUNK]
            parts.append(pd.read_sql(q("gene_index", "ids"), conn, params={"ids": chunk}))
            log.info("gene_index: %s de %s genomas", min(i + GENE_INDEX_CHUNK, len(index_ids)), len(index_ids))
    gene_index = pd.concat(parts, ignore_index=True)
    gene_index = gene_index.dropna(subset=["gene_name", "preferred_name", "og"], how="all")

    files = {
        "genomes": (out / "genomes.tsv", genomes),
        "motifs": (out / "motifs.tsv", motifs),
        "regprecise_genome_map": (out / "regprecise_genome_map.tsv", rp_map),
        "regprecise_regulogs": (out / "regprecise_regulogs.tsv", regulogs),
        "curated_regulons": (out / "curated_regulons.tsv", curated),
        "genes": (out / "genes.tsv.gz", genes),
        "fimo_hits": (out / "fimo_hits.tsv.gz", hits),
        "gene_index": (out / "gene_index.tsv.gz", gene_index),
    }
    for name, (path, df) in files.items():
        sort_cols = [c for c in ("genome_id", "gene_id", "motif_id", "accession", "regulog_id") if c in df.columns]
        if sort_cols:
            df = df.sort_values(sort_cols, kind="mergesort")
        # mtime=0 en gzip: mismo contenido -> mismo sha256 entre corridas.
        compression = {"method": "gzip", "mtime": 0} if path.suffix == ".gz" else None
        df.to_csv(path, sep="\t", index=False, compression=compression)
        log.info("Escrito %s (%s filas)", path, f"{len(df):,}")

    with engine.connect() as conn:
        server_version = conn.execute(text("SELECT VERSION()")).scalar()
    try:
        db_url = engine.url.render_as_string(hide_password=True)
    except Exception:
        db_url = f"{engine.url.drivername}://{engine.url.host}/{engine.url.database}"

    write_provenance(
        out / "cache_manifest.json", "export_cache", params,
        inputs={}, outputs={k: v[0] for k, v in files.items()}, started=started,
        extra={
            "database": {"url": db_url, "server_version": server_version, "access": "SELECT only"},
            "target_accessions": accessions,
            "source_genomes_for_gene_index": len(index_ids),
            "row_counts": {k: int(len(v[1])) for k, v in files.items()},
            "queries": {k: " ".join(v.split()) for k, v in SQL.items()},
        },
    )
    log.info("Caché listo en %s", out)
    return 0


if __name__ == "__main__":
    sys.exit(main())

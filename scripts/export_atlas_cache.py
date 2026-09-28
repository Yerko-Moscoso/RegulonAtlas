"""Exporta a caché de solo lectura las redes materializadas en regulon_atlas.

Solo usa SELECT. Genera parquet en data/cache/atlas/ con etiquetas legibles
(TF, operón, gen) para que la API no tenga que consultar la base en cada request.
"""
import json
import os
from datetime import date
from pathlib import Path

import pandas as pd
from sqlalchemy import text

from src.database.connection import get_engine  # ajusta el nombre si es distinto

OUT = Path(os.getenv("ATLAS_CACHE", "data/cache/atlas"))
OUT.mkdir(parents=True, exist_ok=True)
engine = get_engine()

manifest = {"exportado": str(date.today()), "tablas": {}}


def guardar(df: pd.DataFrame, nombre: str) -> None:
    df.to_parquet(OUT / f"{nombre}.parquet", index=False)
    manifest["tablas"][nombre] = len(df)
    print(f"{nombre}: {len(df):,} filas")


# Tablas pequeñas, completas
for tabla in ["networks", "network_metrics", "provenance"]:
    guardar(pd.read_sql(text(f"SELECT * FROM {tabla}"), engine), tabla)

guardar(pd.read_sql(text(
    "SELECT genome_id, accession, selection, gtdb_phylum, gtdb_class, gtdb_order, "
    "gtdb_family, gtdb_genus, gtdb_species, ncbi_organism FROM genomes"), engine), "genomes")

guardar(pd.read_sql(text(
    "SELECT motif_id, motif_key, source, tf_name, tf_family, regulatory_role FROM motifs"),
    engine), "motifs")

# Aristas con etiquetas, una red por archivo
SQL_EDGES = text("""
    SELECT e.network_id, e.genome_id, e.motif_id, m.tf_name, m.tf_family,
           e.target_operon, o.label AS operon_label, o.n_genes,
           e.best_gene_id, g.locus_tag AS best_locus, g.gene_name AS best_gene_name,
           e.best_score, e.best_neg_log10_p, e.n_sites,
           e.footprint_enrichment, e.tier, e.confidence
    FROM edges e
    JOIN motifs  m ON m.motif_id  = e.motif_id
    JOIN operons o ON o.operon_id = e.target_operon
    JOIN genes   g ON g.gene_id   = e.best_gene_id
    WHERE e.network_id = :n
""")

redes = pd.read_parquet(OUT / "networks.parquet")
for nid, nombre in zip(redes.network_id, redes.name):
    df = pd.read_sql(SQL_EDGES, engine, params={"n": int(nid)})
    guardar(df, f"edges_net{nid}")

(OUT / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
print("Listo:", OUT)
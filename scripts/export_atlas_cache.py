"""Exporta a caché de solo lectura las redes materializadas en regulon_atlas.

Solo usa SELECT. Genera parquet en data/cache/atlas/ con etiquetas legibles
(TF, operón, gen) para que la API no tenga que consultar la base en cada request.

Además del atlas, exporta lo necesario para la validación (semana 10):
el gold standard de RegPrecise, su mapeo a accesiones y los genes de los
genomas validables con su locus antiguo, para emparejar sin tocar la base.
"""
import json
import os
from datetime import date
from pathlib import Path

import pandas as pd
from sqlalchemy import text

from src.database.connection import get_engine

OUT = Path(os.getenv("ATLAS_CACHE", "data/cache/atlas"))
OUT.mkdir(parents=True, exist_ok=True)
engine = get_engine()

manifest = {
    "exportado": str(date.today()),
    "fuente": "MariaDB regulon_atlas (solo SELECT)",
    "tablas": {},
}


def guardar(df: pd.DataFrame, nombre: str) -> None:
    df.to_parquet(OUT / f"{nombre}.parquet", index=False)
    manifest["tablas"][nombre] = len(df)
    print(f"{nombre}: {len(df):,} filas")


# --- Tablas pequeñas, completas -------------------------------------------
for tabla in ["networks", "network_metrics", "provenance"]:
    guardar(pd.read_sql(text(f"SELECT * FROM {tabla}"), engine), tabla)

# genomes y motifs completos: el catálogo de la API (genomes.py, motifs.py)
# necesita completeness, contamination, assembly_level, source_taxon y length.
guardar(pd.read_sql(text("SELECT * FROM genomes"), engine), "genomes")
guardar(pd.read_sql(text("SELECT * FROM motifs"), engine), "motifs")

# --- Validación (gold standard RegPrecise) --------------------------------
guardar(pd.read_sql(text("SELECT * FROM curated_regulons"), engine), "curated_regulons")
guardar(pd.read_sql(text("SELECT * FROM regprecise_genome_map"), engine), "regprecise_genome_map")

# Genes solo de los genomas que RegPrecise cubre (no los 9,4M), con su locus
# antiguo: RegPrecise usa locus antiguos en muchos genomas. gene_old_locus
# tiene a lo más una fila por gen, así que el LEFT JOIN no duplica genes.
SQL_GENES_VALIDACION = text("""
    SELECT g.gene_id, g.genome_id, g.locus_tag, g.gene_name, g.operon_id,
           o.old_locus_tag
    FROM genes g
    LEFT JOIN gene_old_locus o ON o.gene_id = g.gene_id
    WHERE g.genome_id IN (
        SELECT ge.genome_id
        FROM genomes ge
        JOIN regprecise_genome_map r ON r.accession = ge.accession
    )
""")
genes_val = pd.read_sql(SQL_GENES_VALIDACION, engine)
guardar(genes_val, "genes_validation")
manifest["genomas_validacion"] = int(genes_val["genome_id"].nunique())

# --- Aristas con etiquetas, una red por archivo ----------------------------
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
print(f"Manifest escrito en {OUT / 'manifest.json'}")
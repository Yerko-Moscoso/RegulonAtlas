import pandas as pd
from pathlib import Path
import logging
import re
from sqlalchemy import text
from src.database.connection import get_engine

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

# Rutas de entrada y salida locales
REGPRECISE_FILE = Path("data/processed/curated/regprecise/motifs_regprecise.tsv")
PRODORIC_FILE = Path("data/processed/curated/prodoric/motifs_prodoric.tsv")
OUT_MAP = Path("data/processed/transfer_map.tsv")

def normalize_tf_name(name):
    """Limpia caracteres especiales para cruzar TFs de las bases curadas con los ortólogos."""
    if pd.isna(name) or not name:
        return ""
    return re.sub(r'[^A-Z0-9]', '', str(name).upper())

def main():
    print("\n" + "=" * 65)
    print("      MAPA DE TRANSFERENCIA POR ORTÓLOGOS (MariaDB - Solo Lectura)")
    print("=" * 65)

    # 1. Extraer los Factores de Transcripción (ortólogos) directo de MariaDB
    logging.info("Conectando a MariaDB para extraer ortólogos anotados por eggNOG...")
    try:
        engine = get_engine()
        
        # Consulta estricta de solo lectura cruzando las 3 tablas genómicas
        query = text("""
            SELECT DISTINCT gen.accession AS genome_acc, ann.preferred_name AS tf_name
            FROM genomes gen
            JOIN genes g ON gen.genome_id = g.genome_id
            JOIN annotations ann ON g.gene_id = ann.gene_id
            WHERE ann.preferred_name IS NOT NULL 
              AND ann.preferred_name != '-'
        """)
        
        df_db_ortologos = pd.read_sql(query, con=engine)
        logging.info(f"Se extrajeron {len(df_db_ortologos):,} pares genoma-TF de la base de datos.")
    except Exception as e:
        logging.error(f"Error al conectar con MariaDB: {e}")
        return

    # Normalizar los nombres de TF de la base de datos para el cruce
    df_db_ortologos["tf_clean"] = df_db_ortologos["tf_name"].apply(normalize_tf_name)
    
    # Crear diccionario rápido: {genome_acc: set(tf_clean)}
    genome_tf_map = df_db_ortologos.groupby("genome_acc")["tf_clean"].apply(set).to_dict()

    # 2. Cargar y combinar PRODORIC y RegPrecise desde archivos locales
    dfs = []
    if REGPRECISE_FILE.exists(): dfs.append(pd.read_csv(REGPRECISE_FILE, sep="\t"))
    if PRODORIC_FILE.exists(): dfs.append(pd.read_csv(PRODORIC_FILE, sep="\t"))
    
    if not dfs:
        logging.error("No se encontraron catálogos de motivos locales. Corre 'parse_prodoric.py' primero.")
        return
        
    df_motifs = pd.concat(dfs, ignore_index=True)
    transfer_rows = []

    # 3. Cruzar los motivos locales contra los ortólogos de MariaDB
    logging.info("Cruzando catálogo de motivos locales con la base de datos...")
    for _, row in df_motifs.iterrows():
        motif_key = row["motif_key"]
        tf_clean = normalize_tf_name(row["tf_name"])
        
        if not tf_clean:
            continue
            
        for genome_acc, tfs_present in genome_tf_map.items():
            if tf_clean in tfs_present:
                transfer_rows.append({
                    "genome_acc": genome_acc,
                    "motif_key": motif_key,
                    "tf_name": row["tf_name"],
                    "source": row.get("source", "Unknown")
                })

    # 4. Guardar resultado de forma local (Sin tocar la BD)
    df_transfer = pd.DataFrame(transfer_rows)
    OUT_MAP.parent.mkdir(parents=True, exist_ok=True)
    df_transfer.to_csv(OUT_MAP, sep="\t", index=False)

    print("\n" + "-" * 65)
    print(f"[*] Genomas en la BD con ortólogos:  {len(genome_tf_map)}")
    print(f"[*] Motivos locales evaluados:       {len(df_motifs):,}")
    print(f"[*] Asignaciones exactas generadas:  {len(df_transfer):,}")
    print(f"[*] Mapa de transferencia guardado:  {OUT_MAP}")
    print("=" * 65 + "\n")

if __name__ == "__main__":
    main()
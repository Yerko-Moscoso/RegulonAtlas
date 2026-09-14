import pandas as pd
from pathlib import Path
import logging
from tqdm import tqdm
import re

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

MOTIFS_FILE = Path("data/processed/curated/regprecise/motifs_regprecise.tsv")
EGGNOG_DIR = Path("data/annotations/eggnog")
OUT_MAP = Path("data/processed/transfer_map_eggnog.tsv")

def normalize_tf_name(name):
    """Limpia caracteres especiales para cruzar limpiamente TFs de RegPrecise con eggNOG."""
    if pd.isna(name) or not name:
        return ""
    return re.sub(r'[^A-Z0-9]', '', str(name).upper())

def main():
    print("\n" + "=" * 65)
    print("      REFINAMIENTO DE MAPA DE TRANSFERENCIA POR ORTÓLOGOS (eggNOG)")
    print("=" * 65)

    if not MOTIFS_FILE.exists():
        logging.error(f"Falta el catálogo de motivos: {MOTIFS_FILE}")
        return

    eggnog_files = list(EGGNOG_DIR.glob("*.annotations"))
    if not eggnog_files:
        logging.error(f"No se encontraron anotaciones de eggNOG en {EGGNOG_DIR}")
        return

    # 1. Mapear qué genomas poseen qué Factores de Transcripción según eggNOG
    genome_tf_map = {}
    
    for e_file in tqdm(eggnog_files, desc="Procesando anotaciones de ortólogos"):
        with open(e_file, "rt", encoding="utf-8", errors="ignore") as f:
            q_idx, pref_idx = 0, 4 # Índices por defecto
            
            for line in f:
                if line.startswith("##"):
                    continue
                if line.startswith("#query"):
                    headers = line.strip().replace("#", "").split("\t")
                    try:
                        q_idx = headers.index("query")
                        pref_idx = headers.index("Preferred_name")
                    except ValueError:
                        pass
                    continue
                
                if line.startswith("#"):
                    continue
                    
                parts = line.strip().split("\t")
                if len(parts) > max(q_idx, pref_idx):
                    query = parts[q_idx]
                    pref_name = parts[pref_idx]
                    
                    # Extraer el Accession GCF_ del formato 'GCF_XXXXX.X|WP_XXXXX'
                    acc_match = re.search(r"(GCF_\d+\.\d+)", query)
                    if acc_match and pref_name and pref_name != "-":
                        genome_acc = acc_match.group(1)
                        tf_clean = normalize_tf_name(pref_name)
                        
                        if genome_acc not in genome_tf_map:
                            genome_tf_map[genome_acc] = set()
                        genome_tf_map[genome_acc].add(tf_clean)

    # 2. Cargar el catálogo de motivos curados
    df_motifs = pd.read_csv(MOTIFS_FILE, sep="\t")
    transfer_rows = []

    # 3. Asignar motivos a genomas SOLO si existe el ortólogo del TF
    for _, row in tqdm(df_motifs.iterrows(), desc="Generando cruces biológicos", total=len(df_motifs)):
        motif_id = str(row["motif_key"]).replace("RG_", "").replace("MX_", "")
        tf_clean = normalize_tf_name(row["tf_name"])
        
        if not tf_clean:
            continue
            
        for genome_acc, tfs_present in genome_tf_map.items():
            if tf_clean in tfs_present:
                transfer_rows.append({
                    "genome_acc": genome_acc,
                    "motif_key": row["motif_key"],
                    "motif_id": motif_id,
                    "tf_name": row["tf_name"]
                })

    if not transfer_rows:
        logging.warning("No se generaron cruces. Verifica la nomenclatura de las anotaciones.")
        return

    df_transfer = pd.DataFrame(transfer_rows)
    OUT_MAP.parent.mkdir(parents=True, exist_ok=True)
    df_transfer.to_csv(OUT_MAP, sep="\t", index=False)

    print("\n" + "-" * 65)
    print(f"[*] Genomas con perfil de ortólogos: {len(genome_tf_map)}")
    print(f"[*] Asignaciones biológicas exactas: {len(df_transfer):,}")
    print(f"[*] Nuevo mapa de transferencia:     {OUT_MAP}")
    print("=" * 65 + "\n")

if __name__ == "__main__":
    main()
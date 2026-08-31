import pandas as pd
from pathlib import Path
import logging
import re

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

# Rutas de entrada
MOTIFS_FILE = Path("data/processed/curated/regprecise/motifs_regprecise.tsv")
ATLAS_DIR = Path("data/genomes/atlas_genomes")
# Rutas de salida
OUT_MAP = Path("data/processed/transfer_map.tsv")

def get_genus(organism_name):
    """Extrae el género taxonómico (primera palabra) limpiando caracteres extraños."""
    if pd.isna(organism_name) or not organism_name:
        return "Unknown"
    s = str(organism_name).strip()
    s = re.sub(r"[\[\]()_,-]", " ", s)
    parts = s.split()
    return parts[0] if parts else "Unknown"

def main():
    print("\n" + "=" * 65)
    print("      CONSTRUCCIÓN DEL MAPA DE TRANSFERENCIA DE MOTIVOS")
    print("=" * 65)
    
    # 1. Identificar los genomas MVP descargados en disco
    genome_dirs = [d for d in ATLAS_DIR.iterdir() if d.is_dir() and d.name.startswith("GCF_")]
    if not genome_dirs:
        logging.error(f"No se encontraron genomas en {ATLAS_DIR}")
        return
        
    mvp_accessions = [d.name for d in genome_dirs]
    logging.info(f"Genomas objetivo detectados en disco: {len(mvp_accessions)}")
    
    # Diccionario duro para asignar organismos a los GCF del MVP (para el prototipo)
    # En producción esto sale de selected_genomes.tsv
    mvp_metadata = {
        "GCF_000005845.2": "Escherichia coli",
        "GCF_000006765.1": "Pseudomonas aeruginosa",
        "GCF_000009045.1": "Bacillus subtilis",
        "GCF_000195955.2": "Mycobacterium tuberculosis",
        "GCF_000006945.2": "Salmonella enterica",
        "GCF_000006745.1": "Vibrio cholerae",
        "GCF_000013425.1": "Staphylococcus aureus",
        "GCF_000006885.1": "Streptococcus pneumoniae",
        "GCF_000006905.1": "Caulobacter crescentus",
        "GCF_000008525.1": "Helicobacter pylori"
    }

    df_genomes = pd.DataFrame([
        {"genome_acc": acc, "organism_name": mvp_metadata.get(acc, "Unknown")}
        for acc in mvp_accessions
    ])
    df_genomes["genus"] = df_genomes["organism_name"].apply(get_genus)

    # 2. Cargar el catálogo de motivos de RegPrecise
    if not MOTIFS_FILE.exists():
        logging.error(f"No se encontró el archivo de motivos: {MOTIFS_FILE}")
        return
        
    df_motifs = pd.read_csv(MOTIFS_FILE, sep="\t")
    df_motifs["genus"] = df_motifs["source_taxon"].apply(get_genus)
    
    # 3. Cruzar genomas objetivo con motivos fuente (Restricción por Género)
    transfer_pairs = []
    
    for _, genome in df_genomes.iterrows():
        # Buscar motivos cuyo género coincida con el del genoma objetivo
        valid_motifs = df_motifs[df_motifs["genus"] == genome["genus"]]
        
        for _, motif in valid_motifs.iterrows():
            transfer_pairs.append({
                "genome_acc": genome["genome_acc"],
                "genome_name": genome["organism_name"],
                "motif_key": motif["motif_key"],
                "tf_name": motif["tf_name"],
                "source_taxon": motif["source_taxon"]
            })
            
    df_transfer = pd.DataFrame(transfer_pairs)
    
    # 4. Guardar resultado
    OUT_MAP.parent.mkdir(parents=True, exist_ok=True)
    df_transfer.to_csv(OUT_MAP, sep="\t", index=False)
    
    print("\n" + "-" * 65)
    print(f"[*] Motivos evaluados:        {len(df_motifs):,}")
    print(f"[*] Genomas objetivo:         {len(df_genomes)}")
    print(f"[*] Asignaciones generadas:   {len(df_transfer):,}")
    print(f"[*] Archivo de mapa guardado: {OUT_MAP}")
    print("=" * 65 + "\n")

if __name__ == "__main__":
    main()
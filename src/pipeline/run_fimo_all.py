import subprocess
import logging
import pandas as pd
import numpy as np
from pathlib import Path
from tqdm import tqdm
from io import StringIO

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

PROMOTERS_DIR = Path("data/processed/promoters")
BG_DIR = Path("data/processed/backgrounds")
MEME_FILE = Path("data/raw/regprecise/regprecise_all_motifs.meme")
OUT_DIR = Path("data/processed/fimo_hits_all")

def main():
    print("\n" + "=" * 65)
    print("      ESCANEO MASIVO FIMO (FORZADO EN TODOS LOS GENOMAS)")
    print("=" * 65)

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    if not MEME_FILE.exists():
        logging.error("Falta el catálogo regprecise_all_motifs.meme.")
        return

    # Obtener los 10 genomas directamente de la carpeta de promotores
    fasta_files = list(PROMOTERS_DIR.glob("*.fa"))
    
    success_count = 0
    total_hits = 0

    for fasta in tqdm(fasta_files, desc="Escaneando los 10 genomas"):
        genome_acc = fasta.name.replace("_promoters.fa", "").replace(".fa", "")
        bg_file = BG_DIR / f"{genome_acc}.bg"
        out_file = OUT_DIR / f"{genome_acc}_hits_all.tsv.gz"

        if not bg_file.exists():
            logging.warning(f"Falta el modelo de fondo para {genome_acc}")
            continue

        # Comando FIMO sin restricción de motivos (busca todos contra todos)
        cmd = [
            "fimo",
            "--text",
            "--thresh", "1e-4",
            "--bgfile", str(bg_file),
            str(MEME_FILE),
            str(fasta)
        ]

        try:
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            
            if not result.stdout.strip():
                continue

            df_hits = pd.read_csv(StringIO(result.stdout), sep="\t", comment="#")
            
            if df_hits.empty or "motif_id" not in df_hits.columns:
                continue
                
            # Calcular estadística y guardar todo
            df_hits["neg_log10_pvalue"] = -np.log10(df_hits["p-value"].astype(float))
            df_hits.to_csv(out_file, sep="\t", index=False, compression="gzip")
            
            success_count += 1
            total_hits += len(df_hits)

        except subprocess.CalledProcessError as e:
            logging.error(f"Error ejecutando FIMO en {genome_acc}: {e.stderr}")
        except Exception as e:
            logging.error(f"Fallo en el procesamiento de {genome_acc}: {e}")

    print("\n" + "-" * 65)
    print(f"[*] Genomas procesados exitosamente: {success_count} de {len(fasta_files)}")
    print(f"[*] Interacciones masivas predichas: {total_hits:,}")
    print(f"[*] Archivos guardados en:           {OUT_DIR}")
    print("=" * 65 + "\n")

if __name__ == "__main__":
    main()
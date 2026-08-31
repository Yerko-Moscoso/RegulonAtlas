import subprocess
import logging
import pandas as pd
import numpy as np
from pathlib import Path
from tqdm import tqdm
from io import StringIO

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

# Rutas de archivos
PROMOTERS_DIR = Path("data/processed/promoters")
BG_DIR = Path("data/processed/backgrounds")
MEME_FILE = Path("data/raw/regprecise/regprecise_all_motifs.meme")
TRANSFER_MAP = Path("data/processed/transfer_map.tsv")
OUT_DIR = Path("data/processed/fimo_hits")

def main():
    print("\n" + "=" * 65)
    print("      ORQUESTACIÓN DE ESCANEO MASIVO CON FIMO (OPTIMIZADO)")
    print("=" * 65)

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    if not TRANSFER_MAP.exists() or not MEME_FILE.exists():
        logging.error("Faltan archivos clave (transfer_map.tsv o regprecise_all_motifs.meme).")
        return

    # 1. Cargar el mapa de transferencia
    df_map = pd.read_csv(TRANSFER_MAP, sep="\t")
    genomes = df_map.groupby("genome_acc")

    success_count = 0
    total_hits = 0

    for genome_acc, group in tqdm(genomes, desc="Escaneando genomas"):
        # LIMPIEZA DE PREFIJOS: Quitar RG_ o MX_ para que coincida exactamente con FIMO
        allowed_motifs = set(group["motif_key"].astype(str))
        allowed_motifs_clean = {m.replace("RG_", "").replace("MX_", "") for m in allowed_motifs}
        
        promoter_fa = PROMOTERS_DIR / f"{genome_acc}_promoters.fa"
        bg_file = BG_DIR / f"{genome_acc}.bg"
        out_file = OUT_DIR / f"{genome_acc}_hits.tsv.gz"

        if not promoter_fa.exists() or not bg_file.exists():
            continue

        # 2. Comando FIMO Optimizado
        cmd = [
            "fimo",
            "--text",
            "--thresh", "1e-4",
            "--bgfile", str(bg_file)
        ]
        
        # Le decimos a FIMO que escanee SOLO los motivos de esta bacteria
        for m in allowed_motifs_clean:
            cmd.extend(["--motif", str(m)])
            
        cmd.extend([str(MEME_FILE), str(promoter_fa)])

        try:
            # 3. Ejecutar FIMO
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            
            if not result.stdout.strip():
                continue

            df_hits = pd.read_csv(StringIO(result.stdout), sep="\t", comment="#")
            
            if df_hits.empty or "motif_id" not in df_hits.columns:
                continue
                
            # 4. Filtrado de seguridad
            df_hits["motif_id"] = df_hits["motif_id"].astype(str)
            df_filtered = df_hits[df_hits["motif_id"].isin(allowed_motifs_clean)].copy()

            if not df_filtered.empty:
                # Calcular la estadística y guardar
                df_filtered["neg_log10_pvalue"] = -np.log10(df_filtered["p-value"].astype(float))
                df_filtered.to_csv(out_file, sep="\t", index=False, compression="gzip")
                
                success_count += 1
                total_hits += len(df_filtered)

        except subprocess.CalledProcessError as e:
            logging.error(f"Error ejecutando FIMO en {genome_acc}: {e.stderr}")
        except Exception as e:
            logging.error(f"Fallo en el procesamiento de {genome_acc}: {e}")

    print("\n" + "-" * 65)
    print(f"[*] Genomas procesados exitosamente: {success_count} de {len(genomes)}")
    print(f"[*] Interacciones predichas totales: {total_hits:,}")
    print(f"[*] Archivos listos para BD:         {OUT_DIR}")
    print("=" * 65 + "\n")

if __name__ == "__main__":
    main()
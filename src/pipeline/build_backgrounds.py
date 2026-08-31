import subprocess
from pathlib import Path
import logging
from tqdm import tqdm

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

PROMOTERS_DIR = Path("data/processed/promoters")
BG_DIR = Path("data/processed/backgrounds")

def build_backgrounds():
    print("\n" + "=" * 65)
    print("      GENERACIÓN DE MODELOS DE FONDO (MARKOV)")
    print("=" * 65)
    
    BG_DIR.mkdir(parents=True, exist_ok=True)
    fasta_files = list(PROMOTERS_DIR.glob("*.fa"))
    
    if not fasta_files:
        logging.error(f"No se encontraron archivos FASTA en {PROMOTERS_DIR}.")
        return

    success_count = 0
    
    for fasta in tqdm(fasta_files, desc="Calculando fondos"):
        # Extraer el accession (ej. GCF_000005845.2)
        genome_acc = fasta.name.replace("_promoters.fa", "").replace(".fa", "")
        bg_out = BG_DIR / f"{genome_acc}.bg"
        
        # Construir comando: fasta-get-markov -m 1 input.fa output.bg
        cmd = ["fasta-get-markov", "-m", "1", str(fasta), str(bg_out)]
        
        try:
            subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if bg_out.exists() and bg_out.stat().st_size > 0:
                success_count += 1
        except subprocess.CalledProcessError as e:
            logging.error(f"Error al procesar {fasta.name}: {e}")
        except FileNotFoundError:
            logging.error("El comando 'fasta-get-markov' no se encontró. Verifica tu entorno Conda.")
            return

    print("\n" + "-" * 65)
    print(f"[*] Genomas procesados: {success_count} de {len(fasta_files)}")
    print(f"[*] Modelos guardados:  {BG_DIR}")
    print("=" * 65 + "\n")

if __name__ == "__main__":
    build_backgrounds()
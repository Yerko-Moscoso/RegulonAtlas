import subprocess
import logging
import pandas as pd
import numpy as np
from pathlib import Path
from tqdm import tqdm
from io import StringIO
from concurrent.futures import ProcessPoolExecutor, as_completed
import multiprocessing

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

# Rutas de archivos
PROMOTERS_DIR = Path("data/processed/promoters")
BG_DIR = Path("data/processed/backgrounds")
REGPRECISE_MEME = Path("data/raw/regprecise/regprecise_all_motifs.meme")
PRODORIC_MEME = Path("data/processed/curated/prodoric/prodoric.meme")
TRANSFER_MAP = Path("data/processed/transfer_map.tsv")
OUT_DIR = Path("data/processed/fimo_hits")

def run_fimo_for_meme(meme_file, bg_file, promoter_fa, allowed_motifs):
    if not allowed_motifs:
        return pd.DataFrame()
        
    cmd = ["fimo", "--text", "--thresh", "1e-4", "--bgfile", str(bg_file)]
    for m in allowed_motifs:
        cmd.extend(["--motif", str(m)])
    cmd.extend([str(meme_file), str(promoter_fa)])
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        if not result.stdout.strip():
            return pd.DataFrame()
            
        df_hits = pd.read_csv(StringIO(result.stdout), sep="\t", comment="#")
        if df_hits.empty or "motif_id" not in df_hits.columns:
            return pd.DataFrame()
            
        df_hits["motif_id"] = df_hits["motif_id"].astype(str)
        return df_hits[df_hits["motif_id"].isin(allowed_motifs)].copy()
    except Exception:
        return pd.DataFrame()

def process_single_genome(args):
    """Función de nivel superior para paralelizar un solo genoma."""
    genome_acc, group_df = args
    allowed_motifs = set(group_df["motif_key"].astype(str))
    
    rp_motifs = {m.replace("RG_", "") for m in allowed_motifs if m.startswith("RG_")}
    pr_motifs = {m for m in allowed_motifs if m.startswith("MX_")}
    
    promoter_fa = PROMOTERS_DIR / f"{genome_acc}_promoters.fa"
    bg_file = BG_DIR / f"{genome_acc}.bg"
    out_file = OUT_DIR / f"{genome_acc}_hits.tsv.gz"

    if not promoter_fa.exists() or not bg_file.exists():
        return 0, 0

    df_rp = run_fimo_for_meme(REGPRECISE_MEME, bg_file, promoter_fa, rp_motifs)
    df_pr = run_fimo_for_meme(PRODORIC_MEME, bg_file, promoter_fa, pr_motifs)
    
    dfs_to_concat = [df for df in [df_rp, df_pr] if not df.empty]
    
    if dfs_to_concat:
        df_final = pd.concat(dfs_to_concat, ignore_index=True)
        df_final["neg_log10_pvalue"] = -np.log10(df_final["p-value"].astype(float))
        df_final.to_csv(out_file, sep="\t", index=False, compression="gzip")
        return 1, len(df_final)
    
    return 0, 0

def main():
    print("\n" + "=" * 65)
    print("  ORQUESTACIÓN DE ESCANEO MASIVO CON FIMO (40 NÚCLEOS PARALELOS)")
    print("=" * 65)

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    df_map = pd.read_csv(TRANSFER_MAP, sep="\t")
    # Agrupar los genomas y prepararlos para el ProcessPool
    genome_tasks = [(acc, group) for acc, group in df_map.groupby("genome_acc")]

    success_count = 0
    total_hits = 0

    # Dejamos 8 núcleos libres para el sistema y MariaDB
    max_workers = min(40, multiprocessing.cpu_count() - 2)
    logging.info(f"Lanzando {max_workers} procesos en paralelo para {len(genome_tasks)} genomas...")

    with ProcessPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(process_single_genome, task): task[0] for task in genome_tasks}
        
        for future in tqdm(as_completed(futures), total=len(futures), desc="Procesando genomas (Paralelo)"):
            try:
                s_count, t_hits = future.result()
                success_count += s_count
                total_hits += t_hits
            except Exception as e:
                logging.error(f"Fallo en hilo paralelo: {e}")

    print("\n" + "-" * 65)
    print(f"[*] Genomas procesados exitosamente: {success_count} de {len(genome_tasks)}")
    print(f"[*] Interacciones predichas totales: {total_hits:,}")
    print(f"[*] Archivos listos para BD:         {OUT_DIR}")
    print("=" * 65 + "\n")

if __name__ == "__main__":
    main()
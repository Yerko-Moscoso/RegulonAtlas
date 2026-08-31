import pandas as pd
from pathlib import Path
import logging
import re

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

PREDICTED_DIR = Path("data/processed/expanded_networks")
CURATED_FILE = Path("data/processed/curated/regprecise/curated_regulons.tsv")
TRANSFER_MAP = Path("data/processed/transfer_map.tsv")
OUT_METRICS = Path("data/processed/validation_metrics.tsv")

def normalize_id(text):
    """Limpia caracteres especiales para que RefSeq y RegPrecise coincidan (ej. BSU_0010 -> BSU0010).
    También elimina el prefijo 'gene-' que usan los IDs estilo GFF3 de NCBI
    (ej. gene-BSU_00010 -> BSU00010), para que coincidan con los locus_tag
    reales que vienen de RegPrecise (ej. BSU_00010 -> BSU00010)."""
    s = str(text).strip()
    s = re.sub(r'(?i)^gene[-_]', '', s)
    return re.sub(r'[^A-Z0-9]', '', s.upper())

def main():
    print("\n" + "=" * 65)
    print("      MÓDULO DE VALIDACIÓN CIENTÍFICA (OE5) - Bacillus subtilis")
    print("=" * 65)

    predicted_candidates = list(PREDICTED_DIR.glob("*000009045.1*_expanded_network.tsv"))
    if not predicted_candidates:
        logging.error("Falta la red predicha de B. subtilis.")
        return
        
    PREDICTED_FILE = predicted_candidates[0]

    if not TRANSFER_MAP.exists():
        logging.error(f"Falta el mapa de transferencia: {TRANSFER_MAP}")
        return

    df_map = pd.read_csv(TRANSFER_MAP, sep="\t")
    motif_to_tf = {}
    for _, row in df_map.iterrows():
        clean_motif = str(row["motif_key"]).replace("RG_", "").replace("MX_", "")
        motif_to_tf[clean_motif] = normalize_id(row["tf_name"])

    df_curated = pd.read_csv(CURATED_FILE, sep="\t")
    df_curated_bsub = df_curated[df_curated["genome_name"].str.contains("Bacillus subtilis", case=False, na=False)]
    
    gold_standard_edges = set(
        zip(
            df_curated_bsub["tf_name"].apply(normalize_id), 
            df_curated_bsub["locus_tag"].apply(normalize_id)
        )
    )

    df_predicted = pd.read_csv(PREDICTED_FILE, sep="\t")
    
    df_predicted["tf_name_translated"] = df_predicted["motif_id"].astype(str).map(motif_to_tf)
    df_predicted = df_predicted.dropna(subset=["tf_name_translated"])
    
    predicted_edges = set(
        zip(
            df_predicted["tf_name_translated"], 
            df_predicted["target_gene"].apply(normalize_id)
        )
    )

    true_positives = len(predicted_edges.intersection(gold_standard_edges))
    false_positives = len(predicted_edges - gold_standard_edges)
    false_negatives = len(gold_standard_edges - predicted_edges)

    precision = true_positives / (true_positives + false_positives) if (true_positives + false_positives) > 0 else 0.0
    recall = true_positives / (true_positives + false_negatives) if (true_positives + false_negatives) > 0 else 0.0

    metrics_data = [{
        "genome_acc": "GCF_000009045.1",
        "threshold": "1e-4",
        "true_positives": true_positives,
        "false_positives": false_positives,
        "false_negatives": false_negatives,
        "precision": round(precision, 6),
        "recall": round(recall, 6)
    }]
    
    df_metrics = pd.DataFrame(metrics_data)
    df_metrics.to_csv(OUT_METRICS, sep="\t", index=False)

    print("\n" + "-" * 65)
    print(f"[*] Interacciones Curadas (Gold Standard): {len(gold_standard_edges):,}")
    print(f"[*] Interacciones Predichas (Pipeline):    {len(predicted_edges):,}")
    print("-" * 65)
    print(f"[*] Verdaderos Positivos (TP): {true_positives:,}")
    print(f"[*] Falsos Positivos (FP):     {false_positives:,}")
    print(f"[*] Falsos Negatives (FN):     {false_negatives:,}")
    print("-" * 65)
    print(f"[*] Precisión:                 {precision:.4%}")
    print(f"[*] Sensibilidad (Recall):     {recall:.4%}")
    print("-" * 65)
    print(f"[*] Métricas exportadas a:     {OUT_METRICS}")
    print("=" * 65 + "\n")

if __name__ == "__main__":
    main()
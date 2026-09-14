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
    s = str(text).strip()
    s = re.sub(r'(?i)^gene[-_]', '', s)
    return re.sub(r'[^A-Z0-9]', '', s.upper())

def main():
    print("\n" + "=" * 65)
    print("      CURVAS DE CALIBRACIÓN MATEMÁTICA - Bacillus subtilis")
    print("=" * 65)

    predicted_candidates = list(PREDICTED_DIR.glob("*000009045.1*_expanded_network.tsv"))
    if not predicted_candidates:
        logging.error("Falta la red predicha de B. subtilis.")
        return
        
    PREDICTED_FILE = predicted_candidates[0]

    if not TRANSFER_MAP.exists():
        logging.error(f"Falta el mapa de transferencia: {TRANSFER_MAP}")
        return

    # Traductor de motivos
    df_map = pd.read_csv(TRANSFER_MAP, sep="\t")
    motif_to_tf = {
        str(row["motif_key"]).replace("RG_", "").replace("MX_", ""): normalize_id(row["tf_name"])
        for _, row in df_map.iterrows()
    }

    # Estándar de Oro
    df_curated = pd.read_csv(CURATED_FILE, sep="\t")
    df_curated_bsub = df_curated[df_curated["genome_name"].str.contains("Bacillus subtilis", case=False, na=False)]
    gold_standard_edges = set(zip(
        df_curated_bsub["tf_name"].apply(normalize_id), 
        df_curated_bsub["locus_tag"].apply(normalize_id)
    ))

    # Red Predicha Base
    df_predicted = pd.read_csv(PREDICTED_FILE, sep="\t")
    df_predicted["tf_name_translated"] = df_predicted["motif_id"].astype(str).map(motif_to_tf)
    df_predicted = df_predicted.dropna(subset=["tf_name_translated"])
    
    # Umbrales a evaluar
    thresholds = [1e-4, 5e-5, 1e-5, 5e-6, 1e-6, 5e-7, 1e-7]
    metrics_data = []

    print(f"[*] Evaluando {len(thresholds)} umbrales estadísticos...\n")

    for thresh in thresholds:
        col_p = "p-value" if "p-value" in df_predicted.columns else "pvalue"
        if col_p in df_predicted.columns:
            df_filtered = df_predicted[df_predicted[col_p] <= thresh]
        else:
            df_filtered = df_predicted 

        predicted_edges = set(zip(
            df_filtered["tf_name_translated"], 
            df_filtered["target_gene"].apply(normalize_id)
        ))

        tp = len(predicted_edges.intersection(gold_standard_edges))
        fp = len(predicted_edges - gold_standard_edges)
        fn = len(gold_standard_edges - predicted_edges)

        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0

        metrics_data.append({
            "genome_acc": "GCF_000009045.1",
            "threshold": f"{thresh:.1e}",
            "true_positives": tp,
            "false_positives": fp,
            "false_negatives": fn,
            "precision": round(precision, 6),
            "recall": round(recall, 6)
        })

        print(f"  > Umbral: {thresh:.1e} | TP: {tp:<4} | FP: {fp:<7} | Precisión: {precision:.4%} | Recall: {recall:.4%}")

    df_metrics = pd.DataFrame(metrics_data)
    df_metrics.to_csv(OUT_METRICS, sep="\t", index=False)

    print("\n" + "-" * 65)
    print(f"[*] Interacciones Curadas (Gold Standard): {len(gold_standard_edges):,}")
    print(f"[*] Métricas exportadas a:     {OUT_METRICS}")
    print("=" * 65 + "\n")

if __name__ == "__main__":
    main()
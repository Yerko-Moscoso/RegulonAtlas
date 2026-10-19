import pandas as pd
from pathlib import Path
import logging
import re
import numpy as np

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

PREDICTED_DIR = Path("data/processed/expanded_networks")
CURATED_FILE = Path("data/processed/curated/regprecise/curated_regulons.tsv")
TRANSFER_MAP = Path("data/processed/transfer_map.tsv")
OUT_METRICS = Path("data/processed/validation_metrics.tsv")

def normalize_id(text):
    """Limpia caracteres especiales para que RefSeq y RegPrecise coincidan."""
    if pd.isna(text):
        return ""
    s = str(text).strip()
    s = re.sub(r'(?i)^gene[-_]', '', s)
    return re.sub(r'[^A-Z0-9]', '', s.upper())

def main():
    print("\n" + "=" * 65)
    print("      MÓDULO DE VALIDACIÓN Y CURVAS DE CALIBRACIÓN (CORREGIDO)")
    print("=" * 65)

    if not TRANSFER_MAP.exists() or not CURATED_FILE.exists():
        logging.error("Faltan archivos de validación.")
        return

    df_map = pd.read_csv(TRANSFER_MAP, sep="\t", dtype=str)
    df_curated = pd.read_csv(CURATED_FILE, sep="\t", dtype=str)
    
    # 1. Identificar inteligentemente la columna de nombre del organismo
    org_col = "genome_name" if "genome_name" in df_curated.columns else "organism"
    if org_col not in df_curated.columns:
        logging.error("No se encontró la columna de organismo en el Gold Standard.")
        return

    # 2. Búsqueda amplia por género para evitar bloqueos por sufijos de cepas
    mvp_mapping = {
        "GCF_000005845.2": "Escherichia",
        "GCF_000009045.1": "Bacillus subtilis",
        "GCF_000006765.1": "Pseudomonas",
        "GCF_000195955.2": "Mycobacterium",
        "GCF_000006945.2": "Salmonella",
        "GCF_000006745.1": "Vibrio",
        "GCF_000013425.1": "Staphylococcus aureus",
        "GCF_000006885.1": "Streptococcus pneumoniae",
        "GCF_000006905.1": "Caulobacter",
        "GCF_000008525.1": "Helicobacter"
    }

    thresholds_log = [4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0]
    metrics_data = []

    predicted_files = list(PREDICTED_DIR.glob("*_expanded_network.tsv"))
    if not predicted_files:
        logging.error("No se encontraron redes predichas expandidas.")
        return

    for pred_file in predicted_files:
        genome_acc = pred_file.name.replace("_expanded_network.tsv", "")
        
        keyword = mvp_mapping.get(genome_acc)
        if not keyword:
            continue

        # Filtrar el Gold Standard usando la palabra clave robusta
        df_curated_genome = df_curated[df_curated[org_col].astype(str).str.contains(keyword, case=False, na=False)]
        
        if df_curated_genome.empty:
            logging.warning(f"No hay Gold Standard para el genoma {genome_acc} (Buscando: '{keyword}').")
            continue

        gold_standard_edges = set(
            zip(
                df_curated_genome["tf_name"].apply(normalize_id),
                df_curated_genome["locus_tag"].apply(normalize_id)
            )
        )

        df_map_genome = df_map[df_map["genome_acc"] == genome_acc]
        motif_to_tf = {}
        for _, row in df_map_genome.iterrows():
            clean_motif = str(row["motif_key"]).replace("RG_", "").replace("MX_", "")
            motif_to_tf[clean_motif] = normalize_id(row["tf_name"])

        df_predicted = pd.read_csv(pred_file, sep="\t", dtype=str)
        if df_predicted.empty:
            continue

        df_predicted["tf_name_translated"] = df_predicted["motif_id"].map(motif_to_tf)
        df_predicted = df_predicted.dropna(subset=["tf_name_translated"])

        if "neg_log10_pvalue" not in df_predicted.columns:
            if "p-value" in df_predicted.columns:
                df_predicted["neg_log10_pvalue"] = -np.log10(df_predicted["p-value"].astype(float))
            else:
                df_predicted["neg_log10_pvalue"] = 4.0
        else:
            df_predicted["neg_log10_pvalue"] = df_predicted["neg_log10_pvalue"].astype(float)

        # Calcular métricas iterativas
        for thresh in thresholds_log:
            df_filtered = df_predicted[df_predicted["neg_log10_pvalue"] >= thresh]

            predicted_edges = set(
                zip(
                    df_filtered["tf_name_translated"],
                    df_filtered["target_gene"].apply(normalize_id)
                )
            )

            true_positives = len(predicted_edges.intersection(gold_standard_edges))
            false_positives = len(predicted_edges - gold_standard_edges)
            false_negatives = len(gold_standard_edges - predicted_edges)

            precision = true_positives / (true_positives + false_positives) if (true_positives + false_positives) > 0 else 0.0
            recall = true_positives / (true_positives + false_negatives) if (true_positives + false_negatives) > 0 else 0.0

            metrics_data.append({
                "genome_acc": genome_acc,
                "organism": keyword,
                "neg_log10_pvalue_threshold": thresh,
                "p_value_equivalent": f"1e-{thresh}",
                "true_positives": true_positives,
                "false_positives": false_positives,
                "false_negatives": false_negatives,
                "precision": round(precision, 6),
                "recall": round(recall, 6)
            })

    if metrics_data:
        df_metrics = pd.DataFrame(metrics_data)
        OUT_METRICS.parent.mkdir(parents=True, exist_ok=True)
        df_metrics.to_csv(OUT_METRICS, sep="\t", index=False)
        print("\n" + "-" * 65)
        print(f"[*] Genomas validados con éxito: {len(df_metrics['genome_acc'].unique())}")
        print(f"[*] Total de puntos de curva generados: {len(df_metrics)}")
        print(f"[*] Archivo listo para Dashboard: {OUT_METRICS}")
        print("=" * 65 + "\n")

if __name__ == "__main__":
    main()
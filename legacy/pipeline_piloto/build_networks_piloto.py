import pandas as pd
import networkx as nx
from pathlib import Path
import logging
import json
from tqdm import tqdm
from concurrent.futures import ProcessPoolExecutor, as_completed
import multiprocessing

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

NETWORKS_IN_DIR = Path("data/processed/expanded_networks")
TRANSFER_MAP = Path("data/processed/transfer_map.tsv")
NETWORKS_OUT_DIR = Path("data/processed/networks_json")
METRICS_OUT = Path("data/processed/network_metrics.tsv")

def calculate_metrics(G, genome_acc):
    """Calcula métricas topológicas básicas de la red dirigida."""
    num_nodes = G.number_of_nodes()
    num_edges = G.number_of_edges()
    density = nx.density(G)
    avg_degree = sum(dict(G.degree()).values()) / float(num_nodes) if num_nodes > 0 else 0
    
    out_degrees = dict(G.out_degree())
    sorted_hubs = sorted(out_degrees.items(), key=lambda x: x[1], reverse=True)
    top_hubs = [f"{node}({deg})" for node, deg in sorted_hubs[:5] if deg > 0]
    
    return {
        "genome_acc": genome_acc,
        "nodos": num_nodes,
        "aristas": num_edges,
        "densidad": round(density, 6),
        "grado_medio": round(avg_degree, 4),
        "top_hubs": ", ".join(top_hubs)
    }

def process_single_network(net_file, motif_to_tf_dict):
    """Ensambla el grafo para un solo genoma (diseñado para paralelización)."""
    genome_acc = net_file.name.replace("_expanded_network.tsv", "")
    
    try:
        df_net = pd.read_csv(net_file, sep="\t", dtype=str)
        if df_net.empty:
            return None
            
        G = nx.DiGraph()
        
        for _, row in df_net.iterrows():
            # Limpiar ID del motivo para cruzar con el diccionario
            raw_motif = str(row["motif_id"]).replace("RG_", "").replace("MX_", "")
            
            # TRADUCCIÓN BIOLÓGICA: Motivo a Nombre de TF real
            tf_node = motif_to_tf_dict.get(raw_motif, row["motif_id"]) 
            target_node = row["target_gene"]
            
            weight = float(row.get("neg_log10_pvalue", 1.0))
            is_leader = str(row.get("is_leader", "True")).lower() == "true"
            
            G.add_edge(tf_node, target_node, weight=weight, is_leader=is_leader)
            
        metrics = calculate_metrics(G, genome_acc)
        
        # Guardar JSON con formato de aristas amigable para Cytoscape (links)
        json_out = NETWORKS_OUT_DIR / f"{genome_acc}_graph.json"
        graph_data = nx.node_link_data(G, edges="links") 
        
        with open(json_out, "w", encoding="utf-8") as f:
            json.dump(graph_data, f, ensure_ascii=False)
            
        return metrics
    except Exception as e:
        logging.error(f"Error procesando {genome_acc}: {e}")
        return None

def main():
    print("\n" + "=" * 65)
    print("      CONSTRUCCIÓN DE GRAFOS Y MÉTRICAS (NetworkX - Optimizado)")
    print("=" * 65)
    
    NETWORKS_OUT_DIR.mkdir(parents=True, exist_ok=True)
    
    if not TRANSFER_MAP.exists():
        logging.error("Falta el mapa de transferencia para traducir los motivos a TFs.")
        return

    # 1. Cargar diccionario traductor de Motivos a TFs reales
    df_map = pd.read_csv(TRANSFER_MAP, sep="\t")
    motif_to_tf = {}
    for _, row in df_map.iterrows():
        clean_motif = str(row["motif_key"]).replace("RG_", "").replace("MX_", "")
        motif_to_tf[clean_motif] = row["tf_name"]

    network_files = list(NETWORKS_IN_DIR.glob("*_expanded_network.tsv"))
    if not network_files:
        logging.error(f"No se encontraron redes expandidas en {NETWORKS_IN_DIR}")
        return

    all_metrics = []
    success_count = 0

    # 2. Configurar paralelismo
    max_workers = min(40, multiprocessing.cpu_count() - 2)
    logging.info(f"Lanzando {max_workers} procesos para ensamblar {len(network_files)} grafos...")

    with ProcessPoolExecutor(max_workers=max_workers) as executor:
        # Pasamos el diccionario a cada proceso
        futures = {executor.submit(process_single_network, f, motif_to_tf): f for f in network_files}
        
        for future in tqdm(as_completed(futures), total=len(futures), desc="Generando JSONs y Métricas"):
            result = future.result()
            if result:
                all_metrics.append(result)
                success_count += 1

    # 3. Exportar vector de métricas consolidadas (Fingerprints)
    if all_metrics:
        df_metrics = pd.DataFrame(all_metrics)
        METRICS_OUT.parent.mkdir(parents=True, exist_ok=True)
        df_metrics.to_csv(METRICS_OUT, sep="\t", index=False)

    print("\n" + "-" * 65)
    print(f"[*] Grafos generados y exportados: {success_count} de {len(network_files)}")
    print(f"[*] JSONs listos para el Frontend: {NETWORKS_OUT_DIR}")
    print(f"[*] Tabla de métricas guardada en: {METRICS_OUT}")
    print("=" * 65 + "\n")

if __name__ == "__main__":
    main()
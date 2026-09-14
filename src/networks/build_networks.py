import pandas as pd
import networkx as nx
from pathlib import Path
import logging
import json
from tqdm import tqdm

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

NETWORKS_IN_DIR = Path("data/processed/expanded_networks")
NETWORKS_OUT_DIR = Path("data/processed/networks_json")
METRICS_OUT = Path("data/processed/network_metrics.tsv")

def extract_tf_name(motif_id):
    parts = str(motif_id).split("_")
    return parts[-1] if len(parts) > 1 else str(motif_id)

def calculate_metrics(G, genome_acc):
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

def main():
    print("\n" + "=" * 65)
    print("      CONSTRUCCIÓN DE GRAFOS Y CÁLCULO DE MÉTRICAS (NetworkX)")
    print("=" * 65)
    
    NETWORKS_OUT_DIR.mkdir(parents=True, exist_ok=True)
    
    network_files = list(NETWORKS_IN_DIR.glob("*_expanded_network.tsv"))
    if not network_files:
        logging.error(f"No se encontraron redes expandidas en {NETWORKS_IN_DIR}")
        return

    all_metrics = []
    success_count = 0

    for net_file in tqdm(network_files, desc="Ensamblando grafos"):
        genome_acc = net_file.name.replace("_expanded_network.tsv", "")
        df_net = pd.read_csv(net_file, sep="\t")
        
        if df_net.empty:
            continue
            
        G = nx.DiGraph()
        
        for _, row in df_net.iterrows():
            tf_node = extract_tf_name(row["motif_id"])
            target_node = row["target_gene"]
            
            G.add_edge(
                tf_node, 
                target_node, 
                weight=float(row.get("neg_log10_pvalue", 1.0)),
                is_leader=bool(row.get("is_leader", True))
            )
            
        metrics = calculate_metrics(G, genome_acc)
        all_metrics.append(metrics)
        
        json_out = NETWORKS_OUT_DIR / f"{genome_acc}_graph.json"
        graph_data = nx.node_link_data(G, edges="links")
        with open(json_out, "w", encoding="utf-8") as f:
            json.dump(graph_data, f, ensure_ascii=False)
            
        success_count += 1

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
from fastapi import APIRouter, HTTPException, Query, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
import math
import networkx as nx
from src.database.connection import get_db

router = APIRouter(prefix="/graphs", tags=["Graphs"])

def _calculate_metrics(G: nx.DiGraph) -> dict:
    num_nodes = G.number_of_nodes()
    num_edges = G.number_of_edges()

    if num_nodes == 0:
        return {
            "nodes": 0, "edges": 0, "density": 0, "avgDegree": 0,
            "hubs": 0, "components": 0, "modularity": 0,
            "clusteringCoefficient": 0, "hierarchyIndex": 0,
            "connectivityEntropy": 0,
        }

    density = nx.density(G)
    degrees = dict(G.degree())
    avg_degree = sum(degrees.values()) / num_nodes
    hubs = sum(1 for d in degrees.values() if d > 20)
    components = nx.number_weakly_connected_components(G)

    G_undirected = G.to_undirected()
    clustering_coefficient = nx.average_clustering(G_undirected)

    try:
        from networkx.algorithms.community import greedy_modularity_communities, modularity
        communities = greedy_modularity_communities(G_undirected)
        mod_value = modularity(G_undirected, communities)
    except Exception:
        mod_value = 0

    try:
        clustering_per_node = nx.clustering(G_undirected)
        deg_list = [degrees[n] for n in G_undirected.nodes()]
        clust_list = [clustering_per_node[n] for n in G_undirected.nodes()]
        if len(deg_list) > 1 and len(set(deg_list)) > 1:
            import statistics
            hierarchy_index = abs(statistics.correlation(deg_list, clust_list))
        else:
            hierarchy_index = 0
    except Exception:
        hierarchy_index = 0

    degree_counts = {}
    for d in degrees.values():
        degree_counts[d] = degree_counts.get(d, 0) + 1
    entropy = 0.0
    for count in degree_counts.values():
        p = count / num_nodes
        entropy -= p * math.log2(p)

    return {
        "nodes": num_nodes,
        "edges": num_edges,
        "density": round(density, 6),
        "avgDegree": round(avg_degree, 2),
        "hubs": hubs,
        "components": components,
        "modularity": round(mod_value, 4),
        "clusteringCoefficient": round(clustering_coefficient, 4),
        "hierarchyIndex": round(hierarchy_index, 4),
        "connectivityEntropy": round(entropy, 4),
    }

@router.get("/{genome_acc}")
async def get_network_graph(
    genome_acc: str,
    threshold: float = Query(
        1e-6,
        description="P-value máximo de FIMO para incluir una interacción (menor = más estricto).",
    ),
    leader_only: bool = Query(
        True,
        description="Si es True, solo incluye hits primarios de operón (is_leader=True).",
    ),
    db: Session = Depends(get_db)
):
    """
    Retorna la topología de red consultando directamente la base de datos MariaDB.
    Sin bloque try-except general para permitir que FastAPI imprima los errores reales.
    """
    min_weight = -math.log10(threshold) if threshold > 0 else 0
    
    # Consulta SQL con triple JOIN
    query = text("""
        SELECT 
            m.motif_key, 
            g.locus_tag, 
            fh.neg_log10_p
        FROM fimo_hits fh
        JOIN genomes gen ON fh.genome_id = gen.genome_id
        JOIN genes g ON fh.gene_id = g.gene_id
        JOIN motifs m ON fh.motif_id = m.motif_id
        WHERE gen.accession = :genome_acc 
          AND fh.neg_log10_p >= :min_weight
    """)

    results = db.execute(query, {
        "genome_acc": genome_acc, 
        "min_weight": min_weight
    }).fetchall()

    G = nx.DiGraph()
    
    # Extracción por índices (0=motif, 1=gene, 2=score) compatible con todas las versiones SQL
    for row in results:
        G.add_edge(
            str(row[0]), 
            str(row[1]), 
            weight=float(row[2]), 
            is_leader=True 
        )

    cytoscape_nodes = [
        {
            "data": {
                "id": node_id,
                "label": node_id,
                "node_type": "TF" if any(prefix in str(node_id) for prefix in ["TF", "MX", "RG"]) else "Gene",
            }
        }
        for node_id in G.nodes()
    ]
    
    cytoscape_edges = [
        {
            "data": {
                "source": u,
                "target": v,
                "weight": data.get("weight", 1.0),
                "is_leader": data.get("is_leader", True),
            }
        }
        for u, v, data in G.edges(data=True)
    ]

    metrics = _calculate_metrics(G)

    return {
        "graph_id": genome_acc,
        "elements": {"nodes": cytoscape_nodes, "edges": cytoscape_edges},
        "metrics": metrics,
    }
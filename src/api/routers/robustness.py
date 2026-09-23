from fastapi import APIRouter
import networkx as nx
import math

router = APIRouter(prefix="/robustness", tags=["Robustness"])

# Se independiza la función para no depender de graphs.py
def _calculate_metrics(G: nx.DiGraph) -> dict:
    num_nodes = G.number_of_nodes()
    num_edges = G.number_of_edges()

    if num_nodes == 0:
        return {"nodes": 0, "edges": 0, "density": 0, "avgDegree": 0}

    density = nx.density(G)
    degrees = dict(G.degree())
    avg_degree = sum(degrees.values()) / num_nodes

    return {
        "nodes": num_nodes,
        "edges": num_edges,
        "density": round(density, 6),
        "avgDegree": round(avg_degree, 2),
    }

@router.get("/{genome_acc}")
async def get_robustness_simulation(genome_acc: str):
    """
    Endpoint temporal para la vista de Robustez. 
    Los cálculos masivos de remoción de nodos (OE6) se implementarán en la fase correspondiente.
    """
    return {
        "graph_id": genome_acc,
        "status": "pending",
        "message": "El análisis de robustez (OE6) se calculará en la siguiente fase de la tesis."
    }
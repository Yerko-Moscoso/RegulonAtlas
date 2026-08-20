from fastapi import APIRouter, Query
from src.api.schemas.network_graph import NetworkGraphResponse

router = APIRouter(prefix="/graphs", tags=["Graphs"])


@router.get("/{graph_id}", response_model=NetworkGraphResponse)
async def get_network_graph(
    graph_id: str,
    min_weight: float = Query(0.0, ge=0.0, description="Filtro de peso mínimo"),
    limit_nodes: int = Query(100, ge=1, le=5000, description="Límite máximo de nodos a transferir")
):
    sample_nodes = [
        {"data": {"id": "node_1", "label": "Origin_A", "node_type": "source"}},
        {"data": {"id": "node_2", "label": "Target_B", "node_type": "target"}},
    ]
    sample_edges = [
        {"data": {"id": "e_1_2", "source": "node_1", "target": "node_2", "weight": 0.95}}
    ]

    return {
        "graph_id": graph_id,
        "elements": {
            "nodes": sample_nodes,
            "edges": sample_edges
        },
        "metrics": {
            "density": 0.05,
            "total_nodes": len(sample_nodes),
            "total_edges": len(sample_edges)
        }
    }
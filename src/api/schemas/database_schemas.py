from pydantic import BaseModel
from typing import List, Optional

# ==========================================
# 1. ESQUEMAS PARA GRAFOS Y REDES (OE4/OE8)
# ==========================================
class NodeData(BaseModel):
    id: str
    label: str
    node_type: str

class Node(BaseModel):
    data: NodeData

class EdgeData(BaseModel):
    source: str
    target: str
    weight: float
    is_leader: bool

class Edge(BaseModel):
    data: EdgeData

class GraphElements(BaseModel):
    nodes: List[Node]
    edges: List[Edge]

class NetworkGraphResponse(BaseModel):
    graph_id: str
    elements: GraphElements


# ==========================================
# 2. ESQUEMAS PARA GENOMAS
# ==========================================
class GenomeItem(BaseModel):
    genome_id: int
    accession: str
    ncbi_organism: Optional[str] = None
    completeness: Optional[float] = None
    contamination: Optional[float] = None
    assembly_level: Optional[str] = None

class PaginatedGenomes(BaseModel):
    total: int
    items: List[GenomeItem]


# ==========================================
# 3. ESQUEMAS PARA MOTIVOS
# ==========================================
class MotifItem(BaseModel):
    motif_id: int
    motif_key: str
    tf_name: Optional[str] = None
    tf_family: Optional[str] = None
    source: Optional[str] = None
    source_taxon: Optional[str] = None
    length: Optional[int] = None

class PaginatedMotifs(BaseModel):
    total: int
    items: List[MotifItem]
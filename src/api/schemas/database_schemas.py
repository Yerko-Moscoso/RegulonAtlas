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
    # Solo se llenan al pedir genomas por accession (?accessions= o /{accession}).
    gtdb_family: Optional[str] = None
    gtdb_genus: Optional[str] = None
    gtdb_species: Optional[str] = None
    selection: Optional[str] = None
    genome_size_mb: Optional[float] = None      # aprox.: fin del último gen por contig
    n_genes: Optional[int] = None
    n_operons: Optional[int] = None
    n_tfs: Optional[int] = None                 # TF con al menos un blanco predicho
    predicted_edges: Optional[int] = None       # pares TF-gen al umbral de la red
    curated_interactions: Optional[int] = None  # pares TF-gen curados (RegPrecise)
    network_threshold: Optional[float] = None   # -log10(p) de la red

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
from typing import List, Dict, Any, Optional
from pydantic import BaseModel

class NodeData(BaseModel):
    id: str
    label: str
    node_type: str
    properties: Optional[Dict[str, Any]] = None

class NodeElement(BaseModel):
    data: NodeData

class EdgeData(BaseModel):
    id: str
    source: str
    target: str
    weight: Optional[float] = 1.0
    properties: Optional[Dict[str, Any]] = None

class EdgeElement(BaseModel):
    data: EdgeData

class GraphElements(BaseModel):
    nodes: List[NodeElement]
    edges: List[EdgeElement]

class NetworkGraphResponse(BaseModel):
    graph_id: str
    elements: GraphElements
    metrics: Dict[str, Any]
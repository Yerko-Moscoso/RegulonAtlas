from pydantic import BaseModel
from typing import List, Optional

# ==========================================
# 1. ESQUEMAS PARA GENOMAS
# ==========================================
class GenomeItem(BaseModel):
    genome_id: int
    accession: str
    ncbi_organism: Optional[str] = None
    completeness: Optional[float] = None
    contamination: Optional[float] = None
    assembly_level: Optional[str] = None
    gtdb_phylum: Optional[str] = None
    gtdb_class: Optional[str] = None
    gtdb_order: Optional[str] = None
    gtdb_family: Optional[str] = None
    gtdb_genus: Optional[str] = None
    gtdb_species: Optional[str] = None
    selection: Optional[str] = None
    in_atlas: Optional[bool] = None   # selection en {representative, forced, replacement} (primera palabra)

class PaginatedGenomes(BaseModel):
    total: int
    items: List[GenomeItem]


# ==========================================
# 2. ESQUEMAS PARA MOTIVOS
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
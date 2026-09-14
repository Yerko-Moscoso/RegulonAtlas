from pydantic import BaseModel
from typing import Optional, List

# --- Esquemas para Genomas ---
class GenomeBase(BaseModel):
    accession: str
    ncbi_organism: Optional[str] = None
    completeness: Optional[float] = None
    contamination: Optional[float] = None
    assembly_level: Optional[str] = None

class GenomeResponse(GenomeBase):
    genome_id: int

    class Config:
        from_attributes = True  # Permite leer desde modelos SQLAlchemy

# --- Esquemas para Motivos ---
class MotifBase(BaseModel):
    motif_key: str
    source: Optional[str] = None
    tf_name: Optional[str] = None
    tf_family: Optional[str] = None
    source_taxon: Optional[str] = None
    length: Optional[int] = None

class MotifResponse(MotifBase):
    motif_id: int

    class Config:
        from_attributes = True

# --- Esquema de Paginación ---
class PaginatedGenomes(BaseModel):
    total: int
    items: List[GenomeResponse]

class PaginatedMotifs(BaseModel):
    total: int
    items: List[MotifResponse]
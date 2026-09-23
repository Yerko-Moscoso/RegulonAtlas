from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from src.api import results
from src.api.schemas.database_schemas import GenomeItem, PaginatedGenomes
from src.database.connection import get_db
from src.database.models import Genome

router = APIRouter(prefix="/genomes", tags=["Genomes"])


@router.get("/", response_model=PaginatedGenomes)
async def get_genomes(
    skip: int = Query(0, ge=0, description="Registros a omitir"),
    limit: int = Query(100, ge=0, le=5000, description="Límite de registros por página"),
    search: str = Query(None, description="Buscar por nombre de organismo o accession"),
    accessions: Optional[List[str]] = Query(
        None, description="Solo estos genomas, con su ficha completa (resultados del pipeline)"
    ),
    db: Session = Depends(get_db),
):
    """Catálogo de genomas. Con ?accessions= devuelve la ficha del pipeline."""
    if accessions:
        summaries = results.genomes()
        items = [summaries[a] for a in accessions if a in summaries]
        return {"total": len(items), "items": items}

    query = db.query(Genome)
    if search:
        term = f"%{search}%"
        query = query.filter(Genome.ncbi_organism.ilike(term) | Genome.accession.ilike(term))
    total = query.count()
    items = [
        {"genome_id": g.genome_id, "accession": g.accession, "ncbi_organism": g.ncbi_organism,
         "completeness": g.completeness, "contamination": g.contamination,
         "assembly_level": g.assembly_level}
        for g in query.offset(skip).limit(limit).all()
    ]
    return {"total": total, "items": items}


@router.get("/{accession}", response_model=GenomeItem)
async def get_genome(accession: str):
    """Ficha de un genoma analizado (resultados del pipeline)."""
    summary = results.genomes().get(accession)
    if not summary:
        raise HTTPException(status_code=404, detail=f"Genoma {accession} no analizado.")
    return summary

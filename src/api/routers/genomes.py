from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from src.database.connection import get_db
from src.database.models import Genome
from src.api.schemas.database_schemas import PaginatedGenomes

router = APIRouter(prefix="/genomes", tags=["Genomes"])

@router.get("/", response_model=PaginatedGenomes)
async def get_genomes(
    skip: int = Query(0, ge=0, description="Registros a omitir"),
    limit: int = Query(100, ge=0, le=5000, description="Límite de registros por página"),
    search: str = Query(None, description="Buscar por nombre de organismo o accession"),
    db: Session = Depends(get_db)
):
    """
    Lista los genomas disponibles en el Atlas (Solo Lectura).
    """
    query = db.query(Genome)
    
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            (Genome.ncbi_organism.ilike(search_term)) | 
            (Genome.accession.ilike(search_term))
        )
        
    total_genomes = query.count()
    genomes = query.offset(skip).limit(limit).all()
    
    return {"total": total_genomes, "items": genomes}
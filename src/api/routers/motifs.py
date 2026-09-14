from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from src.database.connection import get_db
from src.database.models import Motif
from src.api.schemas.database_schemas import PaginatedMotifs

router = APIRouter(prefix="/motifs", tags=["Motifs"])

@router.get("/", response_model=PaginatedMotifs)
async def get_motifs(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    tf_name: str = Query(None, description="Filtrar por nombre de Factor de Transcripción"),
    source: str = Query(None, description="Filtrar por base de origen (ej. PRODORIC, RegPrecise)"),
    db: Session = Depends(get_db)
):
    """
    Lista y filtra los motivos regulatorios (Solo Lectura).
    """
    query = db.query(Motif)
    
    if tf_name:
        query = query.filter(Motif.tf_name.ilike(f"%{tf_name}%"))
    if source:
        query = query.filter(Motif.source.ilike(f"%{source}%"))
        
    total_motifs = query.count()
    motifs = query.offset(skip).limit(limit).all()
    
    return {"total": total_motifs, "items": motifs}
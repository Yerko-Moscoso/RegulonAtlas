import os
from functools import lru_cache
from pathlib import Path

import pandas as pd
from fastapi import APIRouter, HTTPException, Query

from src.api.schemas.database_schemas import PaginatedMotifs

router = APIRouter(prefix="/motifs", tags=["Motifs"])

# Catálogo leído desde la caché del atlas (make cache-atlas), no desde MariaDB.
CACHE = Path(os.getenv("ATLAS_CACHE", "data/cache/atlas"))
MOTIF_COLUMNS = ["motif_id", "motif_key", "tf_name", "tf_family", "source", "source_taxon", "length"]


@lru_cache(maxsize=1)
def _motifs() -> pd.DataFrame:
    path = CACHE / "motifs.parquet"
    if not path.exists():
        raise HTTPException(status_code=503, detail="Atlas cache not found. Run `make cache-atlas`.")
    df = pd.read_parquet(path, columns=MOTIF_COLUMNS).sort_values("motif_id")
    return df.astype(object).where(df.notna(), None)


def _contains(series: pd.Series, term: str) -> pd.Series:
    return series.fillna("").str.lower().str.contains(term.strip().lower(), regex=False)


@router.get("/", response_model=PaginatedMotifs)
async def get_motifs(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    tf_name: str = Query(None, description="Filtrar por nombre de Factor de Transcripción"),
    source: str = Query(None, description="Filtrar por base de origen (ej. PRODORIC, RegPrecise)"),
):
    """Lista y filtra los motivos regulatorios (solo lectura, desde la caché)."""
    df = _motifs()
    if tf_name:
        df = df[_contains(df["tf_name"], tf_name)]
    if source:
        df = df[_contains(df["source"], source)]
    page = df.iloc[skip : skip + limit]
    return {"total": len(df), "items": page.to_dict(orient="records")}
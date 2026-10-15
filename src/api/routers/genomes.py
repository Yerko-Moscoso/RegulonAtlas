import os
from functools import lru_cache
from pathlib import Path
from typing import List, Optional

import pandas as pd
from fastapi import APIRouter, HTTPException, Query

from src.api import results
from src.api.schemas.database_schemas import GenomeItem, PaginatedGenomes

router = APIRouter(prefix="/genomes", tags=["Genomes"])

# Catálogo leído desde la caché del atlas (make cache-atlas), no desde MariaDB.
CACHE = Path(os.getenv("ATLAS_CACHE", "data/cache/atlas"))
CATALOG_COLUMNS = ["genome_id", "accession", "ncbi_organism", "completeness", "contamination", "assembly_level"]


@lru_cache(maxsize=1)
def _catalog() -> pd.DataFrame:
    path = CACHE / "genomes.parquet"
    if not path.exists():
        raise HTTPException(status_code=503, detail="Atlas cache not found. Run `make cache-atlas`.")
    df = pd.read_parquet(path, columns=CATALOG_COLUMNS).sort_values("genome_id")
    # NaN -> None para que la respuesta JSON tenga null y no NaN
    return df.astype(object).where(df.notna(), None)


@router.get("/", response_model=PaginatedGenomes)
async def get_genomes(
    skip: int = Query(0, ge=0, description="Registros a omitir"),
    limit: int = Query(100, ge=0, le=5000, description="Límite de registros por página"),
    search: str = Query(None, description="Buscar por nombre de organismo o accession"),
    accessions: Optional[List[str]] = Query(
        None, description="Solo estos genomas, con su ficha completa (resultados del pipeline)"
    ),
):
    """Catálogo de genomas. Con ?accessions= devuelve la ficha del pipeline."""
    if accessions:
        summaries = results.genomes()
        items = [summaries[a] for a in accessions if a in summaries]
        return {"total": len(items), "items": items}

    df = _catalog()
    if search:
        term = search.strip().lower()
        mask = df["ncbi_organism"].fillna("").str.lower().str.contains(term, regex=False) | df[
            "accession"
        ].str.lower().str.contains(term, regex=False)
        df = df[mask]
    page = df.iloc[skip : skip + limit]
    return {"total": len(df), "items": page.to_dict(orient="records")}


@router.get("/{accession}", response_model=GenomeItem)
async def get_genome(accession: str):
    """Ficha de un genoma analizado (resultados del pipeline)."""
    summary = results.genomes().get(accession)
    if not summary:
        raise HTTPException(status_code=404, detail=f"Genome {accession} was not analyzed.")
    return summary
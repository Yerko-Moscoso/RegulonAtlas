import os
from functools import lru_cache
from pathlib import Path
from typing import List, Optional

import pandas as pd
from fastapi import APIRouter, HTTPException, Query

from src.api.schemas.database_schemas import GenomeItem, PaginatedGenomes
from src.atlas_common import is_atlas_selection

router = APIRouter(prefix="/genomes", tags=["Genomes"])

# Catálogo leído desde la caché del atlas (make cache-atlas), no desde MariaDB.
# Hasta la semana 12, ?accessions= y /{accession} devolvían la ficha del MVP (data/results/mvp, 8 genomas).
CACHE = Path(os.getenv("ATLAS_CACHE", "data/cache/atlas"))
CATALOG_COLUMNS = ["genome_id", "accession", "ncbi_organism", "completeness", "contamination", "assembly_level",
                   "gtdb_phylum", "gtdb_class", "gtdb_order", "gtdb_family", "gtdb_genus", "gtdb_species",
                   "selection"]


@lru_cache(maxsize=1)
def _catalog() -> pd.DataFrame:
    path = CACHE / "genomes.parquet"
    if not path.exists():
        raise HTTPException(status_code=503, detail="Atlas cache not found. Run `make cache-atlas`.")
    df = pd.read_parquet(path, columns=CATALOG_COLUMNS).sort_values("genome_id")
    df["in_atlas"] = is_atlas_selection(df["selection"])  # compara la primera palabra de selection
    # NaN -> None para que la respuesta JSON tenga null y no NaN
    return df.astype(object).where(df.notna(), None)


@router.get("/", response_model=PaginatedGenomes)
async def get_genomes(
    skip: int = Query(0, ge=0, description="Registros a omitir"),
    limit: int = Query(100, ge=0, le=5000, description="Límite de registros por página"),
    search: str = Query(None, description="Buscar por nombre de organismo o accession"),
    accessions: Optional[List[str]] = Query(None, description="Solo estos genomas"),
):
    """Genome catalog of the atlas cache (2,644 genomes, atlas and auxiliary)."""
    df = _catalog()
    if accessions:
        df = df[df["accession"].isin(accessions)]
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
    """Catalog entry of one genome: taxonomy, assembly quality and atlas membership."""
    df = _catalog()
    row = df[df["accession"] == accession]
    if row.empty:
        raise HTTPException(status_code=404, detail=f"Genome {accession} not found.")
    return row.iloc[0].to_dict()

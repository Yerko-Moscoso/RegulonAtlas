"""Comparación de las métricas propias entre taxones (solo lectura).

Lee los resultados de `make comparison-atlas` en data/results/comparison/.
No calcula nada: el cálculo se hace offline en src/networks/atlas_comparison.py.
"""
import json
from functools import lru_cache
from pathlib import Path
from typing import Optional

import pandas as pd
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/atlas/comparison", tags=["atlas-comparison"])

RESULTS = Path("data/results/comparison")
LEVELS = {"phylum": "gtdb_phylum", "class": "gtdb_class", "order": "gtdb_order", "family": "gtdb_family"}


@lru_cache(maxsize=4)
def _read_tsv(path: str, mtime: float) -> pd.DataFrame:
    return pd.read_csv(path, sep="\t")


def _path(name: str) -> Path:
    p = RESULTS / name
    if not p.exists():
        raise HTTPException(status_code=503, detail="Comparison results not found. Run 'make comparison-atlas'.")
    return p


def _table(name: str) -> pd.DataFrame:
    p = _path(name)
    return _read_tsv(str(p), p.stat().st_mtime)


def _level(level: str) -> str:
    if level not in LEVELS:
        raise HTTPException(status_code=400, detail=f"Unknown level '{level}'. Use one of: {', '.join(LEVELS)}.")
    return LEVELS[level]


def _records(df: pd.DataFrame) -> list:
    return json.loads(df.to_json(orient="records"))  # NaN -> null


@router.get("/manifest")
def manifest():
    """Definition, parameters and run metadata of the taxon comparison."""
    return json.loads(_path("manifest.json").read_text())


@router.get("/taxa")
def taxa(network_id: int = 3, level: str = "phylum", metric: Optional[str] = None):
    """Own and external distribution of each metric per taxon (taxa with >= 5 genomes)."""
    df = _table("by_taxon.tsv")
    df = df[(df["network_id"] == network_id) & (df["level"] == _level(level))]
    if metric:
        df = df[df["metric"] == metric]
    if df.empty:
        raise HTTPException(status_code=404, detail=f"No taxa for network {network_id}, level {level}"
                                                    f"{f', metric {metric}' if metric else ''}.")
    return {"network_id": network_id, "level": level, "rows": _records(df.sort_values(["metric", "median"]))}


@router.get("/tests")
def tests(network_id: Optional[int] = None, level: Optional[str] = None):
    """Kruskal-Wallis across taxa (own and external) and agreement with network_metrics."""
    df = _table("taxon_tests.tsv")
    if network_id is not None:
        df = df[df["network_id"] == network_id]
    if level is not None:
        df = df[df["level"] == _level(level)]
    return {"rows": _records(df)}

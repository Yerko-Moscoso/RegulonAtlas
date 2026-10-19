"""Robustez de las métricas propias (solo lectura).

Lee los resultados de `make robustness-atlas` en data/results/robustness/.
No calcula nada: el cálculo se hace offline en src/networks/atlas_robustness.py.
El router antiguo /robustness (MVP) sigue respondiendo "pending".
"""
import json
from functools import lru_cache
from pathlib import Path
from typing import Literal, Optional

import pandas as pd
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/atlas/robustness", tags=["atlas-robustness"])

RESULTS = Path("data/results/robustness")
Strategy = Literal["random", "degree_biased", "low_confidence"]


@lru_cache(maxsize=8)
def _read(path: str, mtime: float) -> pd.DataFrame:
    return pd.read_parquet(path) if path.endswith(".parquet") else pd.read_csv(path, sep="\t")


def _path(name: str) -> Path:
    p = RESULTS / name
    if not p.exists():
        raise HTTPException(status_code=503, detail="Robustness results not found. Run 'make robustness-atlas'.")
    return p


def _table(name: str) -> pd.DataFrame:
    p = _path(name)
    return _read(str(p), p.stat().st_mtime)


def _records(df: pd.DataFrame) -> list:
    return json.loads(df.to_json(orient="records"))  # NaN -> null


@router.get("/manifest")
def manifest():
    """Definition, parameters and run metadata of the robustness analysis."""
    return json.loads(_path("manifest.json").read_text())


@router.get("/nesting")
def nesting():
    """Share of the TF-operon pairs of each network that are also in each other network."""
    return {"rows": _records(_table("nesting.tsv"))}


@router.get("/between")
def between(metric: Optional[str] = None):
    """Spearman correlation of per-genome metric values between pairs of networks."""
    df = _table("rank_between_networks.tsv")
    if metric:
        df = df[df["metric"] == metric]
        if df.empty:
            raise HTTPException(status_code=404, detail=f"Metric {metric} not found.")
    return {"rows": _records(df)}


@router.get("/footprint")
def footprint():
    """Controlled comparison validated vs no-footprint (same p-value and tier, footprinting only)."""
    return {"rows": _records(_table("footprint_effect.tsv"))}


@router.get("/subsampling")
def subsampling(network_id: int = 3, strategy: Optional[Strategy] = None):
    """Per metric and removal rate: median retention and rank stability across atlas genomes."""
    df = _table("subsampling_summary.tsv")
    df = df[df["network_id"] == network_id]
    if strategy:
        df = df[df["strategy"] == strategy]
    if df.empty:
        raise HTTPException(status_code=404, detail=f"No subsampling results for network {network_id}.")
    return {"network_id": network_id, "rows": _records(df)}


@router.get("/subsampling/genome")
def subsampling_genome(accession: str, network_id: int = 3, strategy: Optional[Strategy] = None):
    """Original value, mean and SD after edge removal, and retention for one genome."""
    df = _table("subsampling_genomes.parquet")
    df = df[(df["network_id"] == network_id) & (df["accession"] == accession)]
    if strategy:
        df = df[df["strategy"] == strategy]
    if df.empty:
        min_edges = json.loads(_path("manifest.json").read_text())["definition"]["subsampling"]["genomes"]
        raise HTTPException(status_code=404,
                            detail=f"No subsampling results for {accession} in network {network_id} "
                                   f"(only {min_edges}).")
    return {"network_id": network_id, "accession": accession, "rows": _records(df)}

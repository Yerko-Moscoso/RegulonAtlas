"""Línea base del pipeline propio desde fimo_hits (solo lectura).

Lee los resultados de `make baseline-atlas` en data/results/baseline/.
Es una red de prueba en los 312 genomas validables, no forma parte del atlas.
"""
import json
from functools import lru_cache
from pathlib import Path
from typing import Literal, Optional

import pandas as pd
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/atlas/baseline", tags=["atlas-baseline"])

RESULTS = Path("data/results/baseline")
Mode = Literal["all", "independent"]
Universe = Literal["genome_tf", "genome"]


@lru_cache(maxsize=4)
def _read_tsv(path: str, mtime: float) -> pd.DataFrame:
    return pd.read_csv(path, sep="\t")


def _path(name: str) -> Path:
    p = RESULTS / name
    if not p.exists():
        raise HTTPException(status_code=503, detail="Baseline results not found. Run 'make baseline-atlas'.")
    return p


def _table(name: str) -> pd.DataFrame:
    p = _path(name)
    return _read_tsv(str(p), p.stat().st_mtime)


def _records(df: pd.DataFrame) -> list:
    return json.loads(df.to_json(orient="records"))  # NaN -> null


@router.get("/manifest")
def manifest():
    """Definition, scope and run metadata of the baseline."""
    return json.loads(_path("manifest.json").read_text())


@router.get("/summary")
def summary(mode: Optional[Mode] = None, universe: Optional[Universe] = None):
    """Baseline P/R/F1 next to the five external networks (same gold standard and definition)."""
    df = _table("vs_networks.tsv")
    if mode:
        df = df[df["mode"] == mode]
    if universe:
        df = df[df["universe"] == universe]
    return {"rows": _records(df)}


@router.get("/reproduction")
def reproduction():
    """Each external network vs the baseline with its own p-value threshold and tier ceiling."""
    return {"rows": _records(_table("reproduction.tsv"))}


@router.get("/reproduction-edges")
def reproduction_edges():
    """Edge-level (genome, motif, operon) reproduction: no-footprint from the FIMO hits and each footprinted
    network from a parent network with its p-value, tier and footprint rule."""
    return {"rows": _records(_table("reproduction_edges.tsv"))}

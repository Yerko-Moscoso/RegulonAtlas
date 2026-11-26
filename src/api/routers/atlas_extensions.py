"""Ampliaciones de la v1.0 (excepciones E1, E3 y E4 del congelamiento; solo lectura).

Lee los resultados de make ci-atlas, adjusted-atlas y reliability-atlas. No calcula nada.
La comparación MVP frente al atlas (E6) se quitó el 26-11-2026 (E13).
RegulonDB (E5) se sirve con /atlas/validation/*?gold=regulondb: solo cifras agregadas, nunca sus interacciones.
"""
import json
from functools import lru_cache
from pathlib import Path
from typing import Literal, Optional

import pandas as pd
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/atlas/extensions", tags=["atlas-extensions"])

RESULTS = Path("data/results")
SOURCES = {
    "ci": ("validation_ci", "make ci-atlas"),
    "adjusted": ("comparison_adjusted", "make adjusted-atlas"),
    "reliability": ("reliability", "make reliability-atlas"),
}
LEVELS = {"phylum": "gtdb_phylum", "class": "gtdb_class", "order": "gtdb_order", "family": "gtdb_family"}
Mode = Literal["all", "independent"]
Scheme = Literal["genome", "family"]
Source = Literal["ci", "adjusted", "reliability"]


@lru_cache(maxsize=16)
def _read_tsv(path: str, mtime: float) -> pd.DataFrame:
    return pd.read_csv(path, sep="\t")


def _path(source: str, name: str) -> Path:
    folder, command = SOURCES[source]
    p = RESULTS / folder / name
    if not p.exists():
        raise HTTPException(status_code=503, detail=f"Results not found. Run '{command}'.")
    return p


def _table(source: str, name: str) -> pd.DataFrame:
    p = _path(source, name)
    return _read_tsv(str(p), p.stat().st_mtime)


def _records(df: pd.DataFrame) -> list:
    return json.loads(df.to_json(orient="records"))  # NaN -> null


def _level(level: str) -> str:
    if level not in LEVELS:
        raise HTTPException(status_code=400, detail=f"Unknown level '{level}'. Use one of: {', '.join(LEVELS)}.")
    return LEVELS[level]


@router.get("/manifest/{source}")
def manifest(source: Source):
    """Definition and run metadata of one extension."""
    return json.loads(_path(source, "manifest.json").read_text())


@router.get("/validation-ci")
def validation_ci(scheme: Scheme = "family", mode: Optional[Mode] = None):
    """Bootstrap 95% intervals of precision, recall and F1."""
    df = _table("ci", "ci.tsv")
    df = df[df["scheme"] == scheme]
    return {"scheme": scheme, "rows": _records(df if mode is None else df[df["mode"] == mode])}


@router.get("/f1-differences")
def f1_differences(scheme: Scheme = "family", mode: Optional[Mode] = None):
    """Paired bootstrap interval of the F1 difference between each pair of networks."""
    df = _table("ci", "f1_differences.tsv")
    df = df[df["scheme"] == scheme]
    return {"scheme": scheme, "rows": _records(df if mode is None else df[df["mode"] == mode])}


@router.get("/adjusted/taxa")
def adjusted_taxa(network_id: int = 3, level: str = "phylum", metric: str = "n_tf"):
    """Per-taxon residual after discounting genome size and motif supply."""
    df = _table("adjusted", "by_taxon.tsv")
    df = df[(df["network_id"] == network_id) & (df["level"] == _level(level)) & (df["metric"] == metric)]
    if df.empty:
        raise HTTPException(status_code=404, detail=f"No taxa for network {network_id}, level {level}, metric {metric}.")
    return {"network_id": network_id, "level": level, "metric": metric,
            "rows": _records(df.sort_values("residual_median", ascending=False))}


@router.get("/adjusted/tests")
def adjusted_tests(network_id: Optional[int] = None, level: Optional[str] = None, metric: Optional[str] = None):
    """Share of the taxon effect explained by genome size and motif supply."""
    df = _table("adjusted", "tests.tsv")
    if network_id is not None:
        df = df[df["network_id"] == network_id]
    if level is not None:
        df = df[df["level"] == _level(level)]
    if metric is not None:
        df = df[df["metric"] == metric]
    return {"rows": _records(df)}


@router.get("/reliability")
def reliability(accession: str, network_id: Optional[int] = None):
    """Expected precision of one genome's networks, estimated from the transfer tiers of its edges."""
    df = _table("reliability", "genomes.tsv")
    df = df[df["accession"] == accession]
    if network_id is not None:
        df = df[df["network_id"] == network_id]
    if df.empty:
        raise HTTPException(status_code=404, detail=f"No reliability estimate for {accession}.")
    return {"accession": accession, "rows": _records(df.sort_values("network_id"))}


@router.get("/reliability/calibration")
def reliability_calibration():
    """Cross-validated agreement between expected and observed precision, per network."""
    return {"rows": _records(_table("reliability", "calibration.tsv"))}

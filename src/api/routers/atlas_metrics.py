"""Métricas topológicas propias de las redes del atlas (solo lectura).

Lee los resultados de `make metrics-atlas` en data/results/metrics/.
No calcula nada: el cálculo se hace offline en src/networks/atlas_metrics.py.
La tabla externa network_metrics sigue disponible en /atlas/networks/{id}/metrics.
"""
import json
from functools import lru_cache
from pathlib import Path
from typing import Optional

import pandas as pd
from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/atlas/metrics", tags=["atlas-metrics"])

RESULTS = Path("data/results/metrics")
SUMMARY_METRICS = [
    "n_tf", "n_targets", "n_edges", "n_target_genes", "density", "edges_per_tf",
    "frac_multi_reg", "frac_genome_targeted", "frac_largest", "mean_out_degree",
    "max_out_degree", "mean_in_degree", "out_degree_entropy", "out_degree_gini",
    "hub_share", "n_components",
]


@lru_cache(maxsize=4)
def _read_parquet(path: str, mtime: float) -> pd.DataFrame:
    return pd.read_parquet(path)


@lru_cache(maxsize=4)
def _read_tsv(path: str, mtime: float) -> pd.DataFrame:
    return pd.read_csv(path, sep="\t")


def _path(name: str) -> Path:
    p = RESULTS / name
    if not p.exists():
        raise HTTPException(status_code=503, detail="Metrics not found. Run 'make metrics-atlas'.")
    return p


def _metrics() -> pd.DataFrame:
    p = _path("atlas_metrics.parquet")
    return _read_parquet(str(p), p.stat().st_mtime)


def _records(df: pd.DataFrame) -> list:
    return json.loads(df.to_json(orient="records"))  # NaN -> null


@router.get("/definitions")
def definitions():
    """Graph definition, metric groups and run metadata."""
    return json.loads(_path("manifest.json").read_text())


@router.get("")
def metrics(
    network_id: int = 3,
    accession: Optional[str] = None,
    atlas_only: bool = False,
    with_edges_only: bool = False,
):
    """Own metrics for every genome of one network (genomes without edges have has_edges=false)."""
    df = _metrics()
    df = df[df["network_id"] == network_id]
    if df.empty:
        raise HTTPException(status_code=404, detail=f"Network {network_id} not found.")
    if accession:
        df = df[df["accession"] == accession]
        if df.empty:
            raise HTTPException(status_code=404, detail=f"Genome {accession} not found.")
    if atlas_only:
        df = df[df["in_atlas"]]
    if with_edges_only:
        df = df[df["has_edges"]]
    df = df.sort_values("ncbi_organism")
    return {"network_id": network_id, "total": int(len(df)), "rows": _records(df)}


@router.get("/summary")
def summary(network_id: Optional[int] = None, atlas_only: bool = True):
    """Median and 10th/90th percentiles of each metric over genomes with edges."""
    df = _metrics()
    df = df[df["has_edges"]]
    if atlas_only:
        df = df[df["in_atlas"]]
    if network_id is not None:
        df = df[df["network_id"] == network_id]
    rows = []
    for (net_id, net), g in df.groupby(["network_id", "network"]):
        for m in SUMMARY_METRICS:
            v = g[m].dropna()
            rows.append({
                "network_id": int(net_id), "network": net, "metric": m, "genomes": int(len(v)),
                "median": float(v.median()) if len(v) else None,
                "p10": float(v.quantile(0.1)) if len(v) else None,
                "p90": float(v.quantile(0.9)) if len(v) else None,
            })
    return {"atlas_only": atlas_only, "rows": rows}


@router.get("/compare-external")
def compare_external(network_id: Optional[int] = None):
    """Own metrics vs the external network_metrics table (median ratio and Spearman rank correlation)."""
    p = _path("metrics_vs_external.tsv")
    df = _read_tsv(str(p), p.stat().st_mtime)
    if network_id is not None:
        df = df[df["network_id"] == network_id]
    return {"rows": _records(df)}


@router.get("/genomes")
def genomes_metrics(
    network_id: int = 3,
    accessions: list[str] = Query(default=[]),
):
    """Own metrics for a list of genomes (?accessions=A&accessions=B), e.g. comparators in Fingerprints."""
    df = _metrics()
    df = df[(df["network_id"] == network_id) & (df["accession"].isin(accessions))]
    return {"network_id": network_id, "rows": _records(df)}
"""Resultados de la validación de las redes del atlas (solo lectura).

Lee los TSV que genera `make validate-atlas` en data/results/validation/<gold>/.
No calcula nada: la evaluación se hace offline en src/validation/atlas.py.
"""
import json
from functools import lru_cache
from pathlib import Path
from typing import Literal, Optional

import pandas as pd
from fastapi import APIRouter, HTTPException, Query

from src.api.routers import atlas_metrics

router = APIRouter(prefix="/atlas/validation", tags=["atlas-validation"])

RESULTS = Path("data/results/validation")
Gold = Literal["regprecise", "regulondb", "regulondb_strong"]
Mode = Literal["all", "independent"]
Universe = Literal["genome_tf", "genome"]
# Solo se entregan valores calculados por esta validación, aunque un summary.tsv anterior traiga más columnas
SUMMARY_COLUMNS = ["network_id", "network", "mode", "universe", "pairs_total", "pairs_evaluable", "pairs_not_evaluable",
                   "genomes_evaluated", "TP", "FP", "FN", "precision", "recall", "f1", "precision_macro_median",
                   "recall_macro_median"]


@lru_cache(maxsize=32)
def _read_tsv(path: str, mtime: float) -> pd.DataFrame:
    # mtime forma parte de la clave: si se regeneran los resultados, se vuelve a leer
    return pd.read_csv(path, sep="\t")


def _path(gold: str, name: str) -> Path:
    p = RESULTS / gold / name
    if not p.exists():
        raise HTTPException(
            status_code=503,
            detail=f"Validation results for '{gold}' not found. Run 'make validate-atlas'.",
        )
    return p


def _table(gold: str, name: str) -> pd.DataFrame:
    p = _path(gold, name)
    return _read_tsv(str(p), p.stat().st_mtime)


def _records(df: pd.DataFrame) -> list:
    return json.loads(df.to_json(orient="records"))  # NaN -> null


def _filter(df, network_id=None, mode=None, universe=None):
    if network_id is not None:
        df = df[df["network_id"] == network_id]
    if mode is not None and "mode" in df:
        df = df[df["mode"] == mode]
    if universe is not None and "universe" in df:
        df = df[df["universe"] == universe]
    return df


@router.get("/manifest")
def manifest(gold: Gold = "regprecise"):
    """Definition of the evaluation, gold standard statistics and run metadata."""
    return json.loads(_path(gold, "manifest.json").read_text())


@router.get("/summary")
def summary(
    gold: Gold = "regprecise",
    mode: Optional[Mode] = None,
    universe: Optional[Universe] = None,
):
    """P/R/F1 per network, mode and universe."""
    df = _filter(_table(gold, "summary.tsv")[SUMMARY_COLUMNS], mode=mode, universe=universe)
    return {"gold": gold, "rows": _records(df)}


@router.get("/coverage")
def coverage():
    """Evaluable pairs (mode all, universe genome-TF) across all genomes and within the atlas genomes."""
    evaluados = _filter(_table("regprecise", "by_genome.tsv"), mode="all")
    redes = atlas_metrics._metrics()[["genome_id", "network_id", "n_edges", "in_atlas"]]
    cruce = evaluados.merge(redes, on=["genome_id", "network_id"], how="left")
    filas = []
    for network_id, red in redes.groupby("network_id"):
        ev = cruce[cruce.network_id == network_id]
        en_atlas = ev[ev.in_atlas.eq(True)]
        filas.append({
            "network_id": int(network_id),
            "pairs_total": int(red.n_edges.sum()),
            "pairs_evaluable": int(ev.pairs_evaluable.sum()),
            "atlas_pairs_total": int(red[red.in_atlas].n_edges.sum()),
            "atlas_pairs_evaluable": int(en_atlas.pairs_evaluable.sum()),
            "genomes_validable": int(ev.genome_id.nunique()),
            "atlas_genomes_validable": int(en_atlas.genome_id.nunique()),
        })
    return {"genomes_total": int(redes.genome_id.nunique()),
            "genomes_atlas": int(redes[redes.in_atlas].genome_id.nunique()), "rows": filas}


@router.get("/curve")
def curve(
    gold: Gold = "regprecise",
    network_id: Optional[int] = None,
    mode: Mode = "all",
):
    """Precision/recall curve sweeping min_confidence (universe genome_tf)."""
    df = _filter(_table(gold, "pr_curve.tsv"), network_id=network_id, mode=mode)
    if df.empty:
        raise HTTPException(status_code=404, detail="No curve for the requested network/mode.")
    return {"gold": gold, "mode": mode, "points": _records(df)}


@router.get("/breakdown/{kind}")
def breakdown(
    kind: Literal["tier", "origin"],
    gold: Gold = "regprecise",
    network_id: Optional[int] = None,
    mode: Mode = "all",
):
    """Precision of evaluable pairs split by transfer tier or motif origin."""
    df = _filter(_table(gold, f"by_{kind}.tsv"), network_id=network_id, mode=mode)
    return {"gold": gold, "kind": kind, "mode": mode, "rows": _records(df)}


@router.get("/genomes")
def genomes(
    gold: Gold = "regprecise",
    network_id: int = 3,
    mode: Mode = "all",
    accession: Optional[str] = None,
    limit: int = Query(500, ge=1, le=5000),
):
    """Per-genome TP/FP/FN, precision and recall for one network and mode."""
    df = _filter(_table(gold, "by_genome.tsv"), network_id=network_id, mode=mode)
    if df.empty:
        raise HTTPException(status_code=404, detail=f"Network {network_id} has no validation results in {gold}.")
    if accession:
        df = df[df["accession"] == accession]
        if df.empty:
            raise HTTPException(status_code=404,
                                detail=f"Genome {accession} has no curated regulons in {gold}.")
    df = df.sort_values("n_gold", ascending=False)
    return {"gold": gold, "network_id": network_id, "mode": mode,
            "total": int(len(df)), "rows": _records(df.head(limit))}


@router.get("/locus-mapping")
def locus_mapping(gold: Gold = "regprecise", max_rate: float = Query(1.0, ge=0, le=1)):
    """Locus-tag matching rate per genome (genomes with map_rate <= max_rate)."""
    df = _table(gold, "locus_mapping.tsv")
    df = df[df["map_rate"] <= max_rate].sort_values("map_rate")
    return {"gold": gold, "rows": _records(df)}
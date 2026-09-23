"""
Acceso de la API a los resultados del pipeline (data/results/mvp).

El dashboard muestra exactamente lo que produjo `make mvp`: no recalcula nada
contra la base. Cada archivo se relee solo si cambió en disco, así que al
volver a correr el pipeline el dashboard se actualiza sin reiniciar uvicorn.
"""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
from fastapi import HTTPException

from src.pipeline.common import DEFAULT_PARAMS, load_params, results_dir

_files: dict[str, tuple[float, object]] = {}


def _load(path: Path, reader):
    try:
        mtime = path.stat().st_mtime
    except FileNotFoundError:
        raise HTTPException(
            status_code=503,
            detail=f"Faltan resultados del pipeline ({path.name}). Ejecuta: make mvp",
        )
    hit = _files.get(str(path))
    if hit and hit[0] == mtime:
        return hit[1]
    data = reader(path)
    _files[str(path)] = (mtime, data)
    return data


def _read_json(path: Path):
    return json.loads(path.read_text())


def params() -> dict:
    return _load(DEFAULT_PARAMS, lambda p: load_params(p))


def _results() -> Path:
    return results_dir(params())


def topology() -> dict:
    return _load(_results() / "metrics" / "topology.json", _read_json)


def genomes() -> dict:
    return _load(_results() / "metrics" / "genomes.json", _read_json)


def validation() -> dict:
    return _load(_results() / "validation" / "validation.json", _read_json)


def edges(accession: str) -> pd.DataFrame:
    path = _results() / "networks" / f"{accession}.edges.tsv"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"No hay red construida para {accession}.")
    return _load(path, lambda p: pd.read_csv(p, sep="\t", dtype={"target_locus_tag": str,
                                                                  "target_gene_name": str}))

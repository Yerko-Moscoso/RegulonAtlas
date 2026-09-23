"""
Utilidades compartidas por las etapas del pipeline del MVP.

Todas las etapas leen sus parámetros de config/mvp_params.json y escriben,
junto a cada salida, un JSON de procedencia (parámetros, commit de git,
fechas y sha256 de entradas y salidas), de modo que cada resultado sea
trazable y regenerable.
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PARAMS = PROJECT_ROOT / "config" / "mvp_params.json"


# ---------------------------------------------------------------------------
# Parámetros y rutas
# ---------------------------------------------------------------------------
def load_params(path: Path | str | None = None) -> dict:
    path = Path(path) if path else DEFAULT_PARAMS
    params = json.loads(path.read_text())
    params["_params_file"] = str(path)
    return params


def project_path(relative: str) -> Path:
    p = Path(relative)
    return p if p.is_absolute() else PROJECT_ROOT / p


def cache_dir(params: dict) -> Path:
    return project_path(params["cache_dir"])


def results_dir(params: dict) -> Path:
    return project_path(params["results_dir"])


def read_accessions(path: Path | str) -> list[str]:
    lines = [l.split("#", 1)[0].strip() for l in project_path(str(path)).read_text().splitlines()]
    return [l for l in lines if l]


def setup_logging() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Normalización de nombres e identificadores
# ---------------------------------------------------------------------------
def _is_missing(value) -> bool:
    return value is None or (isinstance(value, float) and pd.isna(value))


def norm_name(value) -> str:
    """Nombre de gen/TF comparable: mayúsculas, solo A-Z0-9 ('cueR' -> 'CUER')."""
    return "" if _is_missing(value) else re.sub(r"[^A-Z0-9]", "", str(value).upper())


def tf_aliases(tf_name) -> set[str]:
    """Separa nombres compuestos: 'GalR/GalS' -> {'GALR', 'GALS'}."""
    if _is_missing(tf_name):
        return set()
    parts = re.split(r"[/,;|]|\bAND\b", str(tf_name).upper())
    return {norm_name(p) for p in parts} - {""}


def norm_locus(value) -> str:
    """Locus tag comparable: sin prefijo 'gene-', mayúsculas, solo A-Z0-9."""
    if _is_missing(value):
        return ""
    s = re.sub(r"^GENE[-_]", "", str(value).upper())
    return re.sub(r"[^A-Z0-9]", "", s)


# ---------------------------------------------------------------------------
# Procedencia
# ---------------------------------------------------------------------------
def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def git_info() -> dict:
    def run(*cmd):
        try:
            return subprocess.run(
                cmd, capture_output=True, text=True, check=True, cwd=PROJECT_ROOT
            ).stdout.strip()
        except Exception:
            return None

    return {"commit": run("git", "rev-parse", "HEAD"), "dirty": bool(run("git", "status", "--porcelain"))}


def _rel(path: Path) -> str:
    path = Path(path)
    try:
        return str(path.resolve().relative_to(PROJECT_ROOT))
    except ValueError:
        return str(path)


def describe_files(files: dict[str, Path]) -> dict:
    return {
        name: {"file": _rel(p), "sha256": sha256(Path(p)) if Path(p).exists() else None}
        for name, p in files.items()
    }


def write_provenance(path: Path, stage: str, params: dict, inputs: dict, outputs: dict,
                     started: datetime, extra: dict | None = None) -> None:
    record = {
        "stage": stage,
        "git": git_info(),
        "started_utc": started.isoformat(),
        "finished_utc": now_utc().isoformat(),
        "params_file": params.get("_params_file"),
        "params": {k: v for k, v in params.items() if not k.startswith("_")},
        "inputs": describe_files(inputs),
        "outputs": describe_files(outputs),
    }
    if extra:
        record.update(extra)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(record, indent=2, ensure_ascii=False, default=str))

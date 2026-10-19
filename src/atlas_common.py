"""Definiciones y utilidades comunes de los módulos del atlas (semana 12, limpieza).

Antes estaban copiadas en src/networks/atlas_metrics.py, src/validation/atlas.py y otros módulos;
una regla cambiada en una copia y no en otra causó el error del genoma replacement (semana 11, C2).
Las definiciones del dominio están explicadas en CLAUDE.md ("Definiciones del dominio").
"""
import subprocess
import sys
from pathlib import Path

import pandas as pd
import pyarrow.parquet as pq

CACHE = Path("data/cache/atlas")
NETWORKS = {1: "validated", 2: "high-precision", 3: "balanced", 4: "permissive", 5: "no-footprint"}
# Un par por (genoma, TF normalizado, operón): la unidad de la validación y de las métricas
KEY = ["genome_id", "tf", "operon_id"]
# Categorías de genomes.selection que forman el atlas (2.224 genomas); se compara la primera palabra
ATLAS_SELECTIONS = {"representative", "forced", "replacement"}
# Tiers de transferencia de motivos, de más cercano a más lejano (los que aparecen en edges)
TIERS = ["within_genus", "same_genus", "within_family", "same_family", "within_order", "same_order",
         "within_class", "same_class", "within_phylum", "same_phylum", "cross_phylum"]

_CACHE_HINTS = {
    "genes_all": "make cache-genes",
    "fimo_hits_validation": "make cache-fimo",
    "transfer_map_validation": "make cache-fimo",
}


def load(name, cols=None):
    """Lee data/cache/atlas/<name>.parquet; termina con un mensaje claro si falta el archivo o una columna."""
    path = CACHE / f"{name}.parquet"
    if not path.exists():
        sys.exit(f"Falta {path}. Ejecuta '{_CACHE_HINTS.get(name, 'make cache-atlas')}' primero.")
    if cols:
        have = set(pq.read_schema(path).names)
        missing = [c for c in cols if c not in have]
        if missing:
            sys.exit(f"{path.name}: faltan columnas {missing}. Disponibles: {sorted(have)}")
    return pd.read_parquet(path, columns=cols)


def norm_tf(s):
    """Nombre de TF normalizado: sin espacios en los extremos y en minúsculas; vacío -> NA."""
    return s.astype("string").str.strip().str.lower().replace("", pd.NA)


norm = norm_tf  # nombre usado en src/networks/


def norm_locus(s):
    """Locus normalizado: sin prefijo gene-/gene_ y en mayúsculas; vacío -> NA."""
    s = (s.astype("string").str.strip()
         .str.replace(r"(?i)^gene[-_]", "", regex=True)
         .str.upper())
    return s.replace("", pd.NA)


def is_atlas_selection(selection):
    """Serie booleana: genomes.selection pertenece al atlas (compara la primera palabra)."""
    return selection.str.split().str[0].isin(ATLAS_SELECTIONS)


def git_commit():
    try:
        out = subprocess.run(["git", "rev-parse", "--short", "HEAD"],
                             capture_output=True, text=True, check=True)
        return out.stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return None


def git_dirty():
    """True si hay archivos versionados con cambios sin commit: en ese caso git_commit
    no describe el código que generó los resultados."""
    try:
        out = subprocess.run(["git", "status", "--porcelain", "--untracked-files=no"],
                             capture_output=True, text=True, check=True)
        return bool(out.stdout.strip())
    except (OSError, subprocess.CalledProcessError):
        return None


def check_dirty():
    """git_dirty() con el aviso estándar; se llama al inicio de cada módulo que escribe resultados."""
    dirty = git_dirty()
    if dirty:
        print("AVISO: hay cambios sin commit; el manifest registrará git_dirty=true. "
              "Haz commit y vuelve a ejecutar para que los resultados sean trazables.")
    return dirty

"""Estado del pipeline del atlas: lee los manifest.json de la caché y de cada resultado (semana 13).

No calcula nada ni consulta MariaDB: solo lee archivos pequeños y pregunta a git si los commits registrados
existen. Las decisiones salen de scripts/explore_status.py:

  - Cada etapa declara su manifiesto, su regla de `make` y de qué etapa depende.
  - Una etapa está "al día" si su entrada coincide con la versión actual de lo que leyó:
      validation y metrics   -> copia de la caché en su manifiesto == manifiesto actual de la caché
      comparison y robustness -> metrics_manifest == git_commit actual de metrics
      baseline               -> created_at posterior a la exportación de fimo_hits
  - Problemas (status "warning"): git_dirty true, commit que ya no está en el historial, archivos declarados
    que faltan o entrada desactualizada. Sin manifiesto: status "missing".
  - Limitaciones conocidas (notas, no problemas): la exportación de la caché no registra el commit.
"""
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from src.atlas_common import git_commit, git_dirty

CACHE_MANIFEST = "data/cache/atlas/manifest.json"

# Orden del pipeline (arquitectura, contexto sección 13). Texto visible en inglés.
CACHE_STEPS = [
    {"id": "cache-atlas", "label": "Atlas cache", "make": "cache-atlas", "depends_on": [],
     "description": "Networks, genomes, motifs, RegPrecise gold standard and provenance exported from MariaDB."},
    {"id": "cache-genes", "label": "Gene cache", "make": "cache-genes", "depends_on": [], "tables": ["genes_all"],
     "description": "All genes of the 2,644 genomes (operon assignment)."},
    {"id": "cache-fimo", "label": "FIMO hits cache", "make": "cache-fimo", "depends_on": [],
     "tables": ["fimo_hits_validation", "transfer_map_validation"],
     "description": "Raw motif hits and transfer map of the 312 validable genomes (baseline input)."},
]
RESULT_STEPS = [
    {"id": "validation", "label": "Validation vs RegPrecise", "make": "validate-atlas",
     "dir": "data/results/validation/regprecise", "depends_on": ["cache-atlas"], "check": "cache",
     "description": "Own validation of the 5 networks (TF -> operon, modes all / independent)."},
    {"id": "metrics", "label": "Own network metrics", "make": "metrics-atlas",
     "dir": "data/results/metrics", "depends_on": ["cache-atlas", "cache-genes"], "check": "cache",
     "description": "Topological metrics with NetworkX for every genome and network."},
    {"id": "comparison", "label": "Taxon comparison", "make": "comparison-atlas",
     "dir": "data/results/comparison", "depends_on": ["metrics"], "check": "metrics",
     "description": "Own vs external metrics across GTDB taxa (Kruskal-Wallis, agreement)."},
    {"id": "robustness", "label": "Metric robustness", "make": "robustness-atlas",
     "dir": "data/results/robustness", "depends_on": ["metrics"], "check": "metrics",
     "description": "Robustness between networks and under edge subsampling."},
    {"id": "baseline", "label": "Own pipeline baseline", "make": "baseline-atlas",
     "dir": "data/results/baseline", "depends_on": ["cache-fimo"], "check": "fimo",
     "description": "Test network rebuilt from raw hits on the 312 validable genomes (not an atlas network)."},
    # Ampliaciones E1, E3, E4, E5 y E6 (make extensions, fuera de make all)
    {"id": "regulondb", "label": "Validation vs RegulonDB", "make": "validate-regulondb",
     "dir": "data/results/validation/regulondb", "depends_on": ["cache-atlas"], "check": "cache",
     "description": "Second gold standard for E. coli K-12 (aggregate figures only)."},
    {"id": "regulondb-strong", "label": "RegulonDB, strong evidence", "make": "validate-regulondb",
     "dir": "data/results/validation/regulondb_strong", "depends_on": ["cache-atlas"], "check": "cache",
     "description": "Same validation using only RegulonDB interactions with strong evidence."},
    {"id": "validation-ci", "label": "Confidence intervals", "make": "ci-atlas",
     "dir": "data/results/validation_ci", "depends_on": ["validation"], "check": "validation",
     "description": "Bootstrap intervals of precision, recall and F1."},
    {"id": "comparison-adjusted", "label": "Adjusted taxon comparison", "make": "adjusted-atlas",
     "dir": "data/results/comparison_adjusted", "depends_on": ["metrics"], "check": "unrecorded",
     "description": "Taxon comparison adjusted for genome size and motif supply."},
    {"id": "reliability", "label": "Expected precision", "make": "reliability-atlas",
     "dir": "data/results/reliability", "depends_on": ["cache-atlas"], "check": "unrecorded",
     "description": "Per-genome estimate from the transfer tiers of its edges."},
]


def commit_in_history(commit):
    """True/False si el commit existe en git; None si no hay git o no hay commit que buscar."""
    if not commit:
        return None
    try:
        r = subprocess.run(["git", "cat-file", "-e", f"{commit}^{{commit}}"], capture_output=True)
    except OSError:
        return None
    return r.returncode == 0


def _read_json(path):
    return json.loads(path.read_text()) if path.exists() else None


def _status(step):
    if not step["exists"]:
        return "missing"
    return "warning" if step["issues"] else "ok"


def _cache_steps(cache):
    steps = []
    for s in CACHE_STEPS:
        step = {k: v for k, v in s.items() if k != "tables"}
        step.update(kind="cache", path=CACHE_MANIFEST, git_commit=None, git_dirty=None, commit_in_history=None,
                    files_declared=0, files_missing=[], up_to_date=None, issues=[], notes=[], tables={})
        if cache is None:
            step.update(exists=False, created_at=None)
        elif s["id"] == "cache-atlas":
            step.update(exists=True, created_at=cache.get("exportado"),
                        tables=dict(cache.get("tablas", {})), source=cache.get("fuente"))
        else:
            tables = {t: cache.get("tables", {}).get(t) for t in s["tables"]}
            present = {t: v for t, v in tables.items() if v}
            step.update(exists=bool(present),
                        created_at=max((v["exported_at"] for v in present.values()), default=None),
                        tables={t: v["rows"] for t, v in present.items()})
            missing = [t for t, v in tables.items() if not v]
            if present and missing:
                step["issues"].append(f"Tables not exported: {', '.join(missing)}")
        if step["exists"]:
            step["notes"].append("The cache exports record the date and row counts, but not the git commit of the export script.")
        step["status"] = _status(step)
        steps.append(step)
    return steps


def _short(ts):
    """'2026-10-19T13:25:58+00:00' -> '2026-10-19 13:25 UTC' (texto visible)."""
    return ts[:16].replace("T", " ") + " UTC" if ts and len(ts) > 10 else ts


def _up_to_date(s, m, cache, manifests):
    """(al día, motivo) según la regla de la etapa; (None, motivo) si no se puede comprobar."""
    if s["check"] == "cache":
        used = m.get("cache_manifest") or {}
        if cache is None:
            return None, "Current cache manifest not found."
        same = used.get("exportado") == cache.get("exportado") and used.get("tablas") == cache.get("tablas")
        return same, (f"Built from the cache exported on {used.get('exportado')}; "
                      f"current cache: {cache.get('exportado')}.")
    if s["check"] == "metrics":
        current = (manifests.get("metrics") or {}).get("git_commit")
        used = m.get("metrics_manifest")
        if current is None:
            return None, "Metrics manifest not found."
        return used == current, f"Built from metrics {used}; current metrics: {current}."
    if s["check"] == "fimo":
        fimo = ((cache or {}).get("tables") or {}).get("fimo_hits_validation")
        if not fimo:
            return None, "FIMO hits export not found in the cache manifest."
        return m["created_at"] >= fimo["exported_at"], (
            f"Built on {_short(m['created_at'])}; FIMO hits exported on {_short(fimo['exported_at'])}.")
    if s["check"] == "validation":
        current = (manifests.get("validation") or {}).get("git_commit")
        used = m.get("validation_commit")
        if current is None:
            return None, "Validation manifest not found."
        return used == current, f"Built from validation {used}; current validation: {current}."
    if s["check"] == "unrecorded":
        return None, "This result records its commit, but not the version of its input."
    raise ValueError(f"Regla de coherencia desconocida: {s['check']}")


def pipeline_status(root=Path(".")):
    """Estado de cada etapa del pipeline del atlas, en orden."""
    root = Path(root)
    cache = _read_json(root / CACHE_MANIFEST)
    manifests = {s["id"]: _read_json(root / s["dir"] / "manifest.json") for s in RESULT_STEPS}

    steps = _cache_steps(cache)
    for s in RESULT_STEPS:
        m = manifests[s["id"]]
        step = {k: v for k, v in s.items() if k not in ("dir", "check")}
        step.update(kind="result", path=f"{s['dir']}/manifest.json", exists=m is not None, issues=[], notes=[])
        if m is None:
            step.update(created_at=None, git_commit=None, git_dirty=None, commit_in_history=None,
                        files_declared=0, files_missing=[], up_to_date=None, up_to_date_detail=None)
        else:
            files = m.get("files", [])
            step.update(created_at=m.get("created_at"), git_commit=m.get("git_commit"),
                        git_dirty=m.get("git_dirty"), commit_in_history=commit_in_history(m.get("git_commit")),
                        files_declared=len(files),
                        files_missing=[f for f in files if not (root / s["dir"] / f).exists()])
            ok, detail = _up_to_date(s, m, cache, manifests)
            step.update(up_to_date=ok, up_to_date_detail=detail)
            if step["git_dirty"]:
                step["issues"].append("Generated with uncommitted changes (git_dirty: true).")
            if step["git_dirty"] is None:
                step["issues"].append("git_dirty not recorded.")
            if step["commit_in_history"] is False:
                step["issues"].append(f"Commit {step['git_commit']} is not in the git history.")
            if step["files_missing"]:
                step["issues"].append(f"Missing files: {', '.join(step['files_missing'])}.")
            if ok is False:
                step["issues"].append(f"Out of date: {detail} Re-run 'make {s['make']}'.")
        step["status"] = _status(step)
        steps.append(step)

    summary = {k: sum(st["status"] == k for st in steps) for k in ("ok", "warning", "missing")}
    return {
        "checked_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "code": {"git_commit": git_commit(), "git_dirty": git_dirty()},
        "summary": summary,
        "steps": steps,
    }

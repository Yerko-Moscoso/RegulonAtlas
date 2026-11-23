"""Estado del pipeline (/atlas/status, src/atlas_status.py).

Las pruebas de humo necesitan los manifiestos reales (se omiten si faltan); las unitarias arman manifiestos
falsos en un directorio temporal para comprobar cada regla.
"""
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from src.api.main import app
from src.atlas_status import pipeline_status

client = TestClient(app)
STEP_IDS = ["cache-atlas", "cache-genes", "cache-fimo",
            "validation", "metrics", "comparison", "robustness", "baseline",
            "regulondb", "regulondb-strong", "validation-ci", "comparison-adjusted", "reliability", "validation-mvp"]
HAS_RESULTS = all(Path(p).exists() for p in [
    "data/cache/atlas/manifest.json", "data/results/metrics/manifest.json",
    "data/results/validation/regprecise/manifest.json"])


@pytest.mark.skipif(not HAS_RESULTS, reason="Faltan la caché o los resultados del atlas")
def test_status_lists_every_step_in_order():
    r = client.get("/api/v1/atlas/status")
    assert r.status_code == 200
    d = r.json()
    assert [s["id"] for s in d["steps"]] == STEP_IDS
    assert sum(d["summary"].values()) == len(STEP_IDS)
    for s in d["steps"]:
        assert s["status"] in {"ok", "warning", "missing"}
        assert s["make"]


@pytest.mark.skipif(not HAS_RESULTS, reason="Faltan la caché o los resultados del atlas")
def test_status_cache_counts_match_cache_manifest():
    cache = json.loads(Path("data/cache/atlas/manifest.json").read_text())
    steps = {s["id"]: s for s in client.get("/api/v1/atlas/status").json()["steps"]}
    assert steps["cache-atlas"]["tables"] == cache["tablas"]
    assert steps["cache-atlas"]["tables"]["genomes"] == 2644


# ---------- pruebas unitarias con manifiestos falsos ----------

CACHE = {"exportado": "2026-10-14", "fuente": "MariaDB", "tablas": {"genomes": 2644},
         "tables": {"genes_all": {"rows": 10, "exported_at": "2026-10-15T00:00:00+00:00"},
                    "fimo_hits_validation": {"rows": 5, "exported_at": "2026-10-19T00:00:00+00:00"},
                    "transfer_map_validation": {"rows": 3, "exported_at": "2026-10-19T00:00:00+00:00"}}}


def _write(root, rel, data, files=()):
    d = root / rel
    d.mkdir(parents=True, exist_ok=True)
    (d / "manifest.json").write_text(json.dumps(data))
    for f in files:
        (d / f).write_text("x")


def _fake_atlas(root, metrics_used="aaa", cache_used=None, dirty=False, missing_file=False):
    """Caché + los 5 resultados. Los commits falsos no existen en git: se espera ese aviso."""
    _write(root, "data/cache/atlas", CACHE)
    base = {"created_at": "2026-10-20T00:00:00+00:00", "git_dirty": dirty, "files": ["a.tsv"]}
    files = () if missing_file else ("a.tsv",)
    used = cache_used or {"exportado": CACHE["exportado"], "tablas": CACHE["tablas"]}
    _write(root, "data/results/validation/regprecise", {**base, "git_commit": "v1", "cache_manifest": used}, files)
    _write(root, "data/results/metrics", {**base, "git_commit": "aaa", "cache_manifest": used}, files)
    _write(root, "data/results/comparison", {**base, "git_commit": "c1", "metrics_manifest": metrics_used}, files)
    _write(root, "data/results/robustness", {**base, "git_commit": "r1", "metrics_manifest": "aaa"}, files)
    _write(root, "data/results/baseline", {**base, "git_commit": "b1"}, files)


def _steps(root):
    return {s["id"]: s for s in pipeline_status(root)["steps"]}


def test_consistent_atlas_is_up_to_date(tmp_path):
    _fake_atlas(tmp_path)
    steps = _steps(tmp_path)
    assert all(steps[k]["up_to_date"] for k in ["validation", "metrics", "comparison", "robustness", "baseline"])
    assert steps["cache-fimo"]["tables"] == {"fimo_hits_validation": 5, "transfer_map_validation": 3}
    # Los commits falsos no existen en el historial: es la única advertencia.
    assert steps["metrics"]["commit_in_history"] is False
    assert steps["metrics"]["issues"] == ["Commit aaa is not in the git history."]


def test_detects_comparison_built_from_old_metrics(tmp_path):
    _fake_atlas(tmp_path, metrics_used="old")
    s = _steps(tmp_path)["comparison"]
    assert s["up_to_date"] is False and s["status"] == "warning"
    assert any(i.startswith("Out of date") for i in s["issues"])


def test_detects_results_built_from_old_cache(tmp_path):
    _fake_atlas(tmp_path, cache_used={"exportado": "2026-09-01", "tablas": {"genomes": 2644}})
    steps = _steps(tmp_path)
    assert steps["validation"]["up_to_date"] is False
    assert steps["metrics"]["up_to_date"] is False


def test_detects_dirty_tree_and_missing_files(tmp_path):
    _fake_atlas(tmp_path, dirty=True, missing_file=True)
    s = _steps(tmp_path)["robustness"]
    assert s["files_missing"] == ["a.tsv"]
    assert any("git_dirty" in i for i in s["issues"])
    assert any(i.startswith("Missing files") for i in s["issues"])


def test_detects_intervals_built_from_old_validation(tmp_path):
    _fake_atlas(tmp_path)
    _write(tmp_path, "data/results/validation_ci", {"created_at": "2026-10-20T00:00:00+00:00", "git_commit": "ci1",
                                                     "git_dirty": False, "validation_commit": "old", "files": []})
    s = _steps(tmp_path)["validation-ci"]
    assert s["up_to_date"] is False and s["status"] == "warning"


def test_missing_manifests(tmp_path):
    d = pipeline_status(tmp_path)
    assert d["summary"] == {"ok": 0, "warning": 0, "missing": len(STEP_IDS)}

"""Pruebas de humo de la comparación entre taxones (make comparison-atlas).

Necesitan data/results/comparison/; si no existe, se omiten.
"""
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from src.api.main import app

RESULTS = Path("data/results/comparison")
pytestmark = pytest.mark.skipif(not (RESULTS / "by_taxon.tsv").exists(),
                                reason="Faltan data/results/comparison/ (make comparison-atlas)")

client = TestClient(app)
LEVEL_TAXA_BALANCED = {"phylum": 10, "class": 13, "order": 48, "family": 83}  # taxones con >= 5 genomas


@pytest.mark.parametrize("level,n_taxa", LEVEL_TAXA_BALANCED.items())
def test_taxa_per_level(level, n_taxa):
    r = client.get("/api/v1/atlas/comparison/taxa", params={"network_id": 3, "level": level, "metric": "n_edges"})
    assert r.status_code == 200
    rows = r.json()["rows"]
    assert len(rows) == n_taxa
    assert all(row["genomes"] >= 5 for row in rows)


def test_core_metrics_agree_with_external():
    """n_tf, n_targets, n_edges y max_out_degree ordenan los taxones como network_metrics."""
    rows = client.get("/api/v1/atlas/comparison/tests", params={"network_id": 3}).json()["rows"]
    core = [r for r in rows if r["metric"] in {"n_tf", "n_targets", "n_edges", "max_out_degree"}]
    assert len(core) == 16  # 4 métricas x 4 niveles
    assert all(r["agreement"] == "high" and r["same_conclusion"] for r in core)


def test_density_flagged_as_different_definition():
    rows = client.get("/api/v1/atlas/comparison/tests", params={"network_id": 3, "level": "phylum"}).json()["rows"]
    assert next(r for r in rows if r["metric"] == "density")["agreement"] == "different_definition"


def test_bad_level_is_400():
    assert client.get("/api/v1/atlas/comparison/taxa", params={"level": "genus"}).status_code == 400


def test_manifest_is_traceable():
    m = client.get("/api/v1/atlas/comparison/manifest").json()
    assert m["git_commit"] and m.get("git_dirty") is False

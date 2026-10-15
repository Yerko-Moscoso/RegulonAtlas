"""Pruebas de humo de la API de métricas propias contra los valores de control de CLAUDE.md.

Necesitan data/results/metrics/ (make metrics-atlas); si no existe, se omiten.
Ejecutar desde la raíz: make check  (o PYTHONPATH=. pytest tests)
"""
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from src.api.main import app

RESULTS = Path("data/results/metrics")
pytestmark = pytest.mark.skipif(not (RESULTS / "atlas_metrics.parquet").exists(),
                                reason="Faltan data/results/metrics/ (make metrics-atlas)")

client = TestClient(app)


def test_ecoli_balanced_control_values():
    r = client.get("/api/v1/atlas/metrics", params={"network_id": 3, "accession": "GCF_000005845.2"})
    assert r.status_code == 200
    row = r.json()["rows"][0]
    assert (row["n_tf"], row["n_targets"], row["n_edges"]) == (118, 342, 485)
    assert row["in_atlas"] is True


@pytest.mark.parametrize("network_id", [1, 2, 3, 4, 5])
def test_atlas_has_2224_genomes(network_id):
    rows = client.get("/api/v1/atlas/metrics", params={"network_id": network_id, "atlas_only": True}).json()
    assert rows["total"] == 2224


def test_replacement_genome_is_in_atlas():
    rows = client.get("/api/v1/atlas/metrics", params={"network_id": 3}).json()["rows"]
    repl = [r for r in rows if str(r["selection"]).startswith("replacement")]
    assert len(repl) == 1 and repl[0]["in_atlas"] is True


def test_manifest_is_traceable():
    m = client.get("/api/v1/atlas/metrics/definitions").json()
    assert m["git_commit"]
    assert m.get("git_dirty") is False, "Resultados generados con cambios sin commit: repetir make metrics-atlas"


@pytest.mark.parametrize("path", ["/api/v1/atlas/metrics/summary?network_id=3",
                                  "/api/v1/atlas/metrics/compare-external?network_id=3",
                                  "/api/v1/atlas/metrics/genomes?network_id=3&accessions=GCF_000005845.2"])
def test_endpoints_respond(path):
    assert client.get(path).status_code == 200

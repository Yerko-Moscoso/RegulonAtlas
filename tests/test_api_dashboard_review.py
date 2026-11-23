"""Correcciones del repaso general del dashboard: cobertura por conjunto de genomas, 404 y trazabilidad de ampliaciones."""
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from src.api.main import app

client = TestClient(app)
pytestmark = pytest.mark.skipif(
    not all(Path(p).exists() for p in ["data/results/metrics/atlas_metrics.parquet",
                                       "data/results/validation/regprecise/by_genome.tsv"]),
    reason="Faltan los resultados del atlas")


def test_coverage_control_values():
    d = client.get("/api/v1/atlas/validation/coverage").json()
    assert (d["genomes_total"], d["genomes_atlas"]) == (2644, 2224)
    balanced = next(r for r in d["rows"] if r["network_id"] == 3)
    assert (balanced["pairs_total"], balanced["pairs_evaluable"]) == (207505, 20222)
    assert (balanced["atlas_pairs_total"], balanced["atlas_pairs_evaluable"]) == (166646, 2960)
    assert (balanced["genomes_validable"], balanced["atlas_genomes_validable"]) == (312, 57)


def test_coverage_matches_validation_summary():
    summary = client.get("/api/v1/atlas/validation/summary",
                         params={"mode": "all", "universe": "genome_tf"}).json()["rows"]
    filas = {r["network_id"]: r for r in client.get("/api/v1/atlas/validation/coverage").json()["rows"]}
    for s in summary:
        assert (filas[s["network_id"]]["pairs_total"], filas[s["network_id"]]["pairs_evaluable"]) == (
            s["pairs_total"], s["pairs_evaluable"])


def test_validation_genomes_unknown_network_is_404():
    assert client.get("/api/v1/atlas/validation/genomes", params={"network_id": 9}).status_code == 404
    assert client.get("/api/v1/atlas/validation/genomes", params={"network_id": 3}).status_code == 200


def test_status_tracks_extensions():
    steps = {s["id"]: s for s in client.get("/api/v1/atlas/status").json()["steps"]}
    for step in ["regulondb", "regulondb-strong", "validation-ci", "comparison-adjusted", "reliability", "validation-mvp"]:
        assert steps[step]["kind"] == "result"

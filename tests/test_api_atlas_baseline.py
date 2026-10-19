"""Pruebas de humo de la línea base del pipeline propio (make baseline-atlas).

Necesitan data/results/baseline/; si no existe, se omiten.
"""
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from src.api.main import app

RESULTS = Path("data/results/baseline")
pytestmark = pytest.mark.skipif(not (RESULTS / "reproduction.tsv").exists(),
                                reason="Faltan data/results/baseline/ (make baseline-atlas)")

client = TestClient(app)


def test_every_external_network_is_inside_its_baseline():
    """Con el mismo umbral y techo de tier, todos los pares de cada red externa están en la línea base."""
    rows = client.get("/api/v1/atlas/baseline/reproduction").json()["rows"]
    assert len(rows) == 5
    assert all(r["external_in_baseline"] == 1.0 for r in rows)


def test_no_footprint_is_reproduced_exactly():
    rows = client.get("/api/v1/atlas/baseline/reproduction").json()["rows"]
    nf = next(r for r in rows if r["network"] == "no-footprint")
    assert nf["jaccard"] == 1.0 and nf["baseline_pairs"] == nf["external_pairs"]


def test_summary_has_networks_and_baseline():
    rows = client.get("/api/v1/atlas/baseline/summary", params={"mode": "all", "universe": "genome_tf"}).json()["rows"]
    assert sum(r["source"] == "external" for r in rows) == 5
    assert sum(r["source"] == "baseline" for r in rows) == 12  # 3 variantes x 4 umbrales
    balanced = next(r for r in rows if r["variant"] == "balanced")
    assert round(balanced["f1"], 3) == 0.431


def test_manifest_scope_and_traceability():
    m = client.get("/api/v1/atlas/baseline/manifest").json()
    assert m["gold_stats"]["validable_genomes"] == 312
    assert m["hits_in_transfer_map"] == 1.0
    assert m["git_commit"] and m.get("git_dirty") is False

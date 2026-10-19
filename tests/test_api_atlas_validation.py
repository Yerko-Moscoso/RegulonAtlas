"""Pruebas de humo de la validación contra RegPrecise (make validate-atlas).

Valores de control de CLAUDE.md: balanced, all / genome_tf -> P = 0,612, R = 0,332, F1 = 0,431.
Necesitan data/results/validation/regprecise/; si no existe, se omiten.
"""
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from src.api.main import app

RESULTS = Path("data/results/validation/regprecise")
pytestmark = pytest.mark.skipif(not (RESULTS / "summary.tsv").exists(),
                                reason="Faltan data/results/validation/ (make validate-atlas)")

client = TestClient(app)


def test_balanced_control_values():
    rows = client.get("/api/v1/atlas/validation/summary",
                      params={"mode": "all", "universe": "genome_tf"}).json()["rows"]
    b = next(r for r in rows if r["network_id"] == 3)
    assert (round(b["precision"], 3), round(b["recall"], 3), round(b["f1"], 3)) == (0.612, 0.332, 0.431)


def test_balanced_is_best_f1_in_all_genome_tf():
    rows = client.get("/api/v1/atlas/validation/summary",
                      params={"mode": "all", "universe": "genome_tf"}).json()["rows"]
    assert max(rows, key=lambda r: r["f1"])["network_id"] == 3


def test_manifest_is_traceable():
    m = client.get("/api/v1/atlas/validation/manifest").json()
    assert m["git_commit"] and m.get("git_dirty") is False

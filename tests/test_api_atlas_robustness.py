"""Pruebas de humo de la robustez de las métricas (make robustness-atlas).

Necesitan data/results/robustness/; si no existe, se omiten.
"""
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from src.api.main import app

RESULTS = Path("data/results/robustness")
pytestmark = pytest.mark.skipif(not (RESULTS / "subsampling_summary.tsv").exists(),
                                reason="Faltan data/results/robustness/ (make robustness-atlas)")

client = TestClient(app)


def test_networks_are_nested():
    """validated ⊂ balanced ⊂ permissive y high-precision ⊂ todas (mismo escaneo, filtros más estrictos)."""
    rows = client.get("/api/v1/atlas/robustness/nesting").json()["rows"]
    share = {(r["from_network"], r["to_network"]): r["share_in_to"] for r in rows}
    assert share[("validated", "balanced")] == 1.0
    assert share[("balanced", "permissive")] == 1.0
    assert all(share[("high-precision", n)] == 1.0
               for n in ["validated", "balanced", "permissive", "no-footprint"])


def test_n_edges_is_trivial_under_random():
    rows = client.get("/api/v1/atlas/robustness/subsampling",
                      params={"network_id": 3, "strategy": "random"}).json()["rows"]
    r = [x for x in rows if x["metric"] == "n_edges"]
    assert len(r) == 4 and all(x["trivial"] and x["robustness"] == "trivial" for x in r)
    assert all(abs(x["retention_median"] - (1 - x["rate"])) < 0.02 for x in r)


def test_size_metrics_robust_to_random_removal():
    rows = client.get("/api/v1/atlas/robustness/subsampling",
                      params={"network_id": 3, "strategy": "random"}).json()["rows"]
    half = {x["metric"]: x for x in rows if x["rate"] == 0.5}
    assert all(half[m]["robustness"] == "robust" for m in ["n_tf", "n_targets", "frac_genome_targeted"])


def test_ecoli_genome_card():
    r = client.get("/api/v1/atlas/robustness/subsampling/genome",
                   params={"network_id": 3, "accession": "GCF_000005845.2", "strategy": "random"})
    assert r.status_code == 200
    base = {x["metric"]: x["original"] for x in r.json()["rows"]}
    assert (base["n_tf"], base["n_targets"], base["n_edges"]) == (118, 342, 485)


def test_unknown_genome_is_404():
    r = client.get("/api/v1/atlas/robustness/subsampling/genome", params={"accession": "GCF_NONE"})
    assert r.status_code == 404


def test_manifest_is_traceable():
    m = client.get("/api/v1/atlas/robustness/manifest").json()
    assert m["git_commit"] and m.get("git_dirty") is False
    assert m["networks"] == [1, 2, 3, 4, 5]

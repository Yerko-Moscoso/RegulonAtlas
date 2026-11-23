"""Pruebas de las ampliaciones de la v1.0 (excepciones E1-E7 de docs/congelamiento_v1.md)."""
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from src.api.main import app
from src.api.routers.atlas_validation import SUMMARY_COLUMNS
from src.networks.atlas_adjusted import r2_fit
from src.networks.atlas_reliability import calibration_status, tier_precision
from src.validation.atlas import REGULONDB_ALIASES, regulondb_tf_names
from src.validation.atlas_ci import prf, replicate_weights
from src.validation.atlas_mvp_point import has_independent_motif

client = TestClient(app)
R = Path("data/results")
BASE = "/api/v1/atlas/extensions"


# ---------------------------------------------------------------- unitarias (no necesitan data/)
def test_prf_and_zero_division():
    p, r, f = prf(np.array([5.0, 0.0]), np.array([10.0, 0.0]), np.array([20.0, 4.0]))
    assert p[0] == 0.5 and r[0] == 0.25 and f[0] == pytest.approx(1 / 3)
    assert np.isnan(p[1]) and r[1] == 0


def test_bootstrap_weights_keep_sample_size_and_seed():
    a = replicate_weights(7, 50, np.random.default_rng(1))
    assert a.shape == (50, 7) and (a.sum(axis=1) == 7).all()
    assert (a == replicate_weights(7, 50, np.random.default_rng(1))).all()


def test_r2_fit_exact_line():
    x = np.column_stack([np.ones(5), np.arange(5.0)])
    r2, res = r2_fit(x, 2 + 3 * np.arange(5.0))
    assert r2 == pytest.approx(1) and np.abs(res).max() < 1e-9


def test_tier_precision_is_smoothed_to_global():
    ev = pd.DataFrame({"tier": ["a"] * 100 + ["b"], "is_gold": [True] * 50 + [False] * 50 + [True]})
    t, p0 = tier_precision(ev)
    assert t.loc["b", "precision_raw"] == 1
    assert p0 < t.loc["b", "precision"] < 1  # un solo par no puede dar precisión 1


@pytest.mark.parametrize("n,rho,status", [(10, 0.9, "insufficient"), (50, float("nan"), "insufficient"),
                                          (50, 0.1, "not_informative"), (50, 0.4, "weak"), (50, 0.7, "useful")])
def test_calibration_status(n, rho, status):
    assert calibration_status(n, rho) == status


def test_regulondb_aliases_keep_original_name():
    names = regulondb_tf_names(pd.Series(["Cra", " GalS ", "CRP"]))
    assert names.tolist() == [["cra", "frur"], ["gals", "galr/gals"], ["crp"]]
    assert all(k == k.lower() for k in REGULONDB_ALIASES)


def test_mvp_independent_motif():
    own = {(10, 1)}
    assert not has_independent_motif("RG10", 1, own)
    assert has_independent_motif("RG10,RG11", 1, own)
    assert has_independent_motif("MX000001", 1, own)
    assert has_independent_motif("RG10", 2, own)


@pytest.mark.parametrize("url", ["/manifest/ci", "/validation-ci", "/f1-differences", "/mvp-points",
                                 "/adjusted/taxa", "/adjusted/tests", "/reliability?accession=GCF_000005845.2",
                                 "/reliability/calibration"])
def test_missing_results_are_503(url, monkeypatch, tmp_path):
    import src.api.routers.atlas_extensions as r
    monkeypatch.setattr(r, "RESULTS", tmp_path)
    resp = client.get(BASE + url)
    assert resp.status_code == 503 and "make" in resp.json()["detail"]


# ---------------------------------------------------------------- con resultados
@pytest.mark.skipif(not (R / "validation_ci/ci.tsv").exists(), reason="Falta make ci-atlas")
def test_ci_contains_frozen_estimate():
    rows = client.get(f"{BASE}/validation-ci", params={"scheme": "family", "mode": "all"}).json()["rows"]
    f1 = next(r for r in rows if r["network"] == "balanced" and r["metric"] == "f1")
    assert f1["estimate"] == pytest.approx(0.431, abs=5e-4)
    assert all(r["ci_low"] <= r["estimate"] <= r["ci_high"] for r in rows)


@pytest.mark.skipif(not (R / "comparison_adjusted/tests.tsv").exists(), reason="Falta make adjusted-atlas")
def test_adjusted_reproduces_section_8_5():
    rows = client.get(f"{BASE}/adjusted/tests", params={"network_id": 3, "level": "phylum", "metric": "n_tf"}).json()["rows"]
    assert rows[0]["taxon_effect_explained"] == pytest.approx(0.88, abs=0.02)


@pytest.mark.skipif(not (R / "reliability/genomes.tsv").exists(), reason="Falta make reliability-atlas")
def test_reliability_ecoli_and_404():
    rows = client.get(f"{BASE}/reliability", params={"accession": "GCF_000005845.2"}).json()["rows"]
    assert {r["network_id"] for r in rows} == {1, 2, 3, 4, 5}
    assert all(0 <= r["expected_precision"] <= 1 for r in rows)
    assert client.get(f"{BASE}/reliability", params={"accession": "NOPE"}).status_code == 404


@pytest.mark.skipif(not (R / "validation_mvp/points.tsv").exists(), reason="Falta make mvp-point")
def test_mvp_points_cover_thresholds_and_networks():
    rows = client.get(f"{BASE}/mvp-points", params={"mode": "all"}).json()["rows"]
    assert sum(r["source"] == "mvp" for r in rows) == 5 and sum(r["source"] == "atlas" for r in rows) == 5


@pytest.mark.skipif(not (R / "validation/regulondb/summary.tsv").exists(), reason="Falta make validate-regulondb")
def test_regulondb_is_aggregate():
    rows = client.get("/api/v1/atlas/validation/summary", params={"gold": "regulondb"}).json()["rows"]
    assert rows and all(list(r) == SUMMARY_COLUMNS and r["genomes_evaluated"] == 1 for r in rows)


@pytest.mark.skipif(not (R / "validation/regprecise/summary.tsv").exists(), reason="Falta make validate-atlas")
def test_summary_only_returns_own_values():
    rows = client.get("/api/v1/atlas/validation/summary").json()["rows"]
    assert rows and all(list(r) == SUMMARY_COLUMNS for r in rows)


@pytest.mark.skipif(not Path("data/cache/atlas/networks.parquet").exists(), reason="Falta make cache-atlas")
def test_networks_expose_only_explicit_filters():
    nets = client.get("/api/v1/atlas/networks").json()
    assert len(nets) == 5
    assert all(set(n["params"]) == {"p_max", "footprint_enrichment_min", "tier_max_rank"} for n in nets)

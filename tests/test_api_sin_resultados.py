"""La API sin resultados ni caché: cada endpoint debe responder 503 con el `make` que hay que correr. Semana 14, bloque C.

Cada router se apunta a una carpeta vacía (tmp_path) con monkeypatch, que se deshace al terminar cada prueba;
las cachés en memoria (lru_cache) se vacían antes y después para no mezclar datos falsos con los reales en
las otras pruebas. No leen data/: corren también en un clon limpio. Detalle en docs/pruebas_semana14.md.

Antes de la semana 14 esto solo se había revisado a mano (revision_semana13.md, con los resultados retirados).
"""
import pytest
from fastapi.testclient import TestClient

import src.api.routers.atlas as r_atlas
import src.api.routers.atlas_baseline as r_baseline
import src.api.routers.atlas_comparison as r_comparison
import src.api.routers.atlas_metrics as r_metrics
import src.api.routers.atlas_robustness as r_robustness
import src.api.routers.atlas_validation as r_validation
import src.api.routers.genomes as r_genomes
import src.api.routers.motifs as r_motifs
from src.api.main import app

ECOLI = "GCF_000005845.2"
RESULT_ROUTERS = [r_validation, r_metrics, r_comparison, r_robustness, r_baseline]
CACHE_ROUTERS = [r_atlas, r_genomes, r_motifs]
CACHED = [r_atlas._tabla, r_genomes._catalog, r_motifs._motifs]

# endpoint -> regla de make que debe nombrar el mensaje (los 25 endpoints que leen data/results/)
RESULT_ENDPOINTS = [
    ("/atlas/validation/manifest", "make validate-atlas"),
    ("/atlas/validation/summary", "make validate-atlas"),
    ("/atlas/validation/curve", "make validate-atlas"),
    ("/atlas/validation/breakdown/tier", "make validate-atlas"),
    ("/atlas/validation/breakdown/origin", "make validate-atlas"),
    ("/atlas/validation/genomes", "make validate-atlas"),
    ("/atlas/validation/locus-mapping", "make validate-atlas"),
    ("/atlas/metrics", "make metrics-atlas"),
    ("/atlas/metrics/definitions", "make metrics-atlas"),
    ("/atlas/metrics/summary", "make metrics-atlas"),
    ("/atlas/metrics/compare-external", "make metrics-atlas"),
    (f"/atlas/metrics/genomes?accessions={ECOLI}", "make metrics-atlas"),
    ("/atlas/comparison/manifest", "make comparison-atlas"),
    ("/atlas/comparison/taxa", "make comparison-atlas"),
    ("/atlas/comparison/tests", "make comparison-atlas"),
    ("/atlas/robustness/manifest", "make robustness-atlas"),
    ("/atlas/robustness/nesting", "make robustness-atlas"),
    ("/atlas/robustness/between", "make robustness-atlas"),
    ("/atlas/robustness/footprint", "make robustness-atlas"),
    ("/atlas/robustness/subsampling", "make robustness-atlas"),
    (f"/atlas/robustness/subsampling/genome?accession={ECOLI}", "make robustness-atlas"),
    ("/atlas/baseline/manifest", "make baseline-atlas"),
    ("/atlas/baseline/summary", "make baseline-atlas"),
    ("/atlas/baseline/reproduction", "make baseline-atlas"),
    ("/atlas/baseline/reproduction-edges", "make baseline-atlas"),
]

CACHE_ENDPOINTS = [
    # /atlas/networks y /atlas/provenance respondían 500 sin caché (hallazgo H2, semana 14; corregido en
    # src/api/routers/atlas.py con _manifest). Ver docs/pruebas_semana14.md, sección 7.
    "/atlas/networks",
    "/atlas/provenance",
    "/atlas/networks/3/genomes",
    "/atlas/networks/3/metrics",
    f"/atlas/networks/3/graph/{ECOLI}",
    "/genomes/",
    "/motifs/",
]

client = TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def empty_data(tmp_path, monkeypatch):
    for mod in RESULT_ROUTERS:
        monkeypatch.setattr(mod, "RESULTS", tmp_path)
    for mod in CACHE_ROUTERS:
        monkeypatch.setattr(mod, "CACHE", tmp_path)
    for f in CACHED:
        f.cache_clear()
    yield tmp_path
    for f in CACHED:      # que las pruebas siguientes vuelvan a leer la caché real
        f.cache_clear()


@pytest.mark.parametrize("path, rule", RESULT_ENDPOINTS)
def test_results_endpoint_without_results_is_503(empty_data, path, rule):
    r = client.get(f"/api/v1{path}")
    assert r.status_code == 503
    assert rule in r.json()["detail"]


@pytest.mark.parametrize("path", CACHE_ENDPOINTS)
def test_cache_endpoint_without_cache_is_503(empty_data, path):
    r = client.get(f"/api/v1{path}")
    assert r.status_code == 503
    assert "make cache-atlas" in r.json()["detail"]


def test_health_and_status_work_without_data(empty_data):
    """El dashboard usa estos dos para avisar qué falta: deben responder aunque no haya datos."""
    assert client.get("/api/v1/health").status_code == 200
    assert client.get("/api/v1/atlas/status").status_code == 200


def test_every_results_endpoint_is_listed():
    """Si se agrega un endpoint que lee data/results/, esta prueba obliga a sumarlo a RESULT_ENDPOINTS."""
    prefixes = ("/api/v1/atlas/validation", "/api/v1/atlas/metrics", "/api/v1/atlas/comparison",
                "/api/v1/atlas/robustness", "/api/v1/atlas/baseline")
    routes = {p for p in app.openapi()["paths"] if p.startswith(prefixes)}
    listed = {"/api/v1" + p.split("?")[0] for p, _ in RESULT_ENDPOINTS}
    listed = {p.replace("/breakdown/tier", "/breakdown/{kind}").replace("/breakdown/origin", "/breakdown/{kind}")
              for p in listed}
    assert routes == listed

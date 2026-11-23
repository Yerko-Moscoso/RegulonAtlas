"""Pruebas de la descarga en Excel (E9) contra los valores de control de CLAUDE.md.

Necesitan la caché y los resultados del atlas; si faltan, se omiten.
"""
import base64
from io import BytesIO
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from openpyxl import load_workbook
from PIL import Image

from src.api.export_i18n import ES
from src.api.main import app
from src.api.routers.atlas_export import (DEFINITIONS, EDGE_COLUMNS, OPERON_COLUMNS, SUMMARY_COLUMNS, TF_COLUMNS)

REQUIRED = [Path("data/cache/atlas/edges_net4.parquet"), Path("data/results/metrics/atlas_metrics.parquet"),
            Path("data/results/reliability/genomes.tsv"), Path("data/results/validation/regprecise/by_genome.tsv")]
pytestmark = pytest.mark.skipif(not all(p.exists() for p in REQUIRED), reason="Faltan la caché o los resultados del atlas")

client = TestClient(app)
ECOLI = "GCF_000005845.2"
LARGEST = "GCF_016807805.1"  # 5.822 pares en permissive: supera el límite de 5.000 de la ruta del grafo


def _libro(url, **params):
    r = client.post(url, params=params, json={"images": []})
    assert r.status_code == 200
    return load_workbook(BytesIO(r.content), read_only=True)


def _filas(ws):
    """Filas de la tabla: termina en la primera fila vacía (en Networks, debajo van las imágenes)."""
    filas = list(ws.iter_rows(values_only=True))
    datos = []
    for f in filas[1:]:
        if not f or f[0] is None:
            break
        datos.append(dict(zip(filas[0], f)))
    return datos


def test_network_download_matches_control_values():
    wb = _libro(f"/api/v1/atlas/export/network/3/{ECOLI}")
    assert wb.sheetnames == ["About", "Network image", "Edges", "TFs", "Operons"]
    assert (len(_filas(wb["TFs"])), len(_filas(wb["Operons"])), len(_filas(wb["Edges"]))) == (118, 342, 485)


def test_organism_download_has_five_networks_matching_metrics():
    wb = _libro(f"/api/v1/atlas/export/organism/{ECOLI}")
    assert wb.sheetnames == ["About", "Organism", "Networks", "Edges", "TFs", "Operons"]
    resumen = _filas(wb["Networks"])
    assert len(resumen) == 5
    aristas = _filas(wb["Edges"])
    for fila, network_id in zip(resumen, range(1, 6)):
        m = client.get("/api/v1/atlas/metrics", params={"network_id": network_id, "accession": ECOLI}).json()["rows"][0]
        assert (fila["TFs"], fila["Target operons"], fila["TF-operon pairs"]) == (m["n_tf"], m["n_targets"], m["n_edges"])
        assert sum(a["Network"] == fila["Network"] for a in aristas) == m["n_edges"]


def test_download_is_not_truncated():
    wb = _libro(f"/api/v1/atlas/export/network/4/{LARGEST}")
    assert len(_filas(wb["Edges"])) == 5822


def test_confidence_filter_matches_graph():
    g = client.get(f"/api/v1/atlas/networks/3/graph/{ECOLI}", params={"min_confidence": 0.7, "max_edges": 5000}).json()
    filas = _filas(_libro(f"/api/v1/atlas/export/network/3/{ECOLI}", min_confidence=0.7)["Edges"])
    assert len(filas) == g["filtered_edges"]
    assert all(f["Confidence"] >= 0.7 for f in filas)


def test_genome_without_edges_still_downloads():
    genomas = client.get("/api/v1/atlas/networks/2/genomes").json()
    vacio = next(g["accession"] for g in genomas if g["n_edges"] == 0)
    wb = _libro(f"/api/v1/atlas/export/network/2/{vacio}")
    assert _filas(wb["Edges"]) == []
    assert any(f[0] == "No edges" for f in wb["About"].iter_rows(values_only=True))


@pytest.mark.parametrize("url", ["/api/v1/atlas/export/organism/GCF_NOPE", "/api/v1/atlas/export/network/3/GCF_NOPE",
                                 f"/api/v1/atlas/export/network/99/{ECOLI}"])
def test_not_found(url):
    assert client.post(url, json={"images": []}).status_code == 404


def _png():
    salida = BytesIO()
    Image.new("RGB", (160, 120), "white").save(salida, "PNG")
    return base64.b64encode(salida.getvalue()).decode()


def test_organism_report_keeps_dashboard_images_below_the_table():
    images = [{"network_id": n, "png": _png(), "shown_edges": 10} for n in range(1, 6)]
    r = client.post(f"/api/v1/atlas/export/organism/{ECOLI}", json={"images": images})
    assert r.status_code == 200
    imagenes = load_workbook(BytesIO(r.content))["Networks"]._images
    assert len(imagenes) == 5
    assert min(i.anchor._from.row for i in imagenes) >= 7  # la tabla ocupa las filas 1 a 6


def test_network_report_has_its_image():
    images = [{"network_id": 3, "png": _png(), "shown_edges": 10}]
    r = client.post(f"/api/v1/atlas/export/network/3/{ECOLI}", json={"images": images})
    wb = load_workbook(BytesIO(r.content))
    assert len(wb["Network image"]._images) == 1
    assert any("10 of 485" in str(c.value) for fila in wb["Network image"].iter_rows() for c in fila)


@pytest.mark.parametrize("image", [{"network_id": 3, "png": "not-base64!", "shown_edges": 1},
                                   {"network_id": 3, "png": base64.b64encode(b"text").decode(), "shown_edges": 1},
                                   {"network_id": 4, "png": _png(), "shown_edges": 1}])
def test_invalid_images_are_rejected(image):
    assert client.post(f"/api/v1/atlas/export/network/3/{ECOLI}", json={"images": [image]}).status_code == 400


def test_summary_explains_expected_precision():
    wb = _libro(f"/api/v1/atlas/export/organism/{ECOLI}")
    calidad = {f["Network"]: f["Estimate quality"] for f in _filas(wb["Networks"])}
    assert calidad["balanced"] == "weak for comparing genomes"
    assert calidad["high-precision"] == "too few genomes to check it"
    assert calidad["no-footprint"] == "not informative for comparing genomes"


def test_spanish_report_translates_text_and_keeps_data():
    en = _libro(f"/api/v1/atlas/export/organism/{ECOLI}")
    es = _libro(f"/api/v1/atlas/export/organism/{ECOLI}", lang="es")
    assert es.sheetnames == ["Acerca de", "Organismo", "Redes", "Aristas", "TF", "Operones"]
    for hoja_en, hoja_es in [("Edges", "Aristas"), ("TFs", "TF"), ("Operons", "Operones")]:
        filas_en = list(en[hoja_en].iter_rows(values_only=True))
        filas_es = list(es[hoja_es].iter_rows(values_only=True))
        assert filas_en[0] != filas_es[0] and filas_en[1:] == filas_es[1:]  # solo cambia el encabezado
    resumen = _filas(es["Redes"])
    assert resumen[2]["Red"] == "balanced" and resumen[2]["Calidad de la estimación"] == "débil para comparar genomas"
    assert resumen[2]["Pares TF-operón"] == 485
    acerca = {f[0]: f[1] for f in es["Acerca de"].iter_rows(values_only=True) if len(f) > 1}
    assert acerca["Pares permissive"] == "1.006"


def test_network_report_in_spanish_has_translated_sheets():
    wb = _libro(f"/api/v1/atlas/export/network/3/{ECOLI}", lang="es")
    assert wb.sheetnames == ["Acerca de", "Imagen de la red", "Aristas", "TF", "Operones"]


def test_every_fixed_report_text_has_a_translation():
    columnas = EDGE_COLUMNS + TF_COLUMNS + OPERON_COLUMNS + SUMMARY_COLUMNS
    textos = {h for h, _, _, _ in columnas} | {t for par in DEFINITIONS for t in par}
    assert textos <= set(ES)


def test_unknown_report_language_is_rejected():
    r = client.post(f"/api/v1/atlas/export/network/3/{ECOLI}", params={"lang": "fr"}, json={"images": []})
    assert r.status_code == 422

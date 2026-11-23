"""Descarga en Excel de un organismo y de sus redes (excepción E9 del congelamiento; solo lectura).

Lee la caché del atlas y los resultados ya calculados: no consulta MariaDB ni recalcula métricas. Las aristas salen de
pares_tf_operon, la misma regla del grafo. No incluye interacciones de RegulonDB, network_metrics externo ni las notas
de networks.params.source.
"""
import base64
import binascii
from datetime import datetime, timezone
from io import BytesIO
from math import ceil
from typing import Literal

import pandas as pd
from fastapi import APIRouter, HTTPException, Query, Response
from openpyxl import Workbook
from openpyxl.cell import WriteOnlyCell
from openpyxl.drawing.image import Image
from openpyxl.styles import Alignment, Font, PatternFill
from PIL import Image as PILImage
from pydantic import BaseModel, Field

from src.api.export_i18n import FILTER_NAMES, number, tr
from src.atlas_common import ATLAS_SELECTIONS
from src.api.routers import atlas_extensions, atlas_metrics, atlas_validation
from src.api.routers.atlas import _genoma, _manifest, _red, listar_redes, pares_tf_operon

router = APIRouter(prefix="/atlas/export", tags=["atlas-export"])

Lang = Literal["en", "es"]
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
HEADER_FONT = Font(bold=True, color="FFFFFF")
HEADER_FILL = PatternFill("solid", fgColor="176B57")
TITLE_FONT = Font(bold=True, size=14, color="176B57")
SECTION_FONT = Font(bold=True, color="176B57")
HEADER_ALIGN = Alignment(wrap_text=True, vertical="center")
HEADER_HEIGHT = 48
# Imágenes dibujadas por el dashboard. En Networks van dos por fila, debajo de la tabla, para que los filtros no las deformen
ORGANISM_IMAGE_BOX = (540, 405)
NETWORK_IMAGE_BOX = (1000, 750)
IMAGE_COLUMNS = (0, 3)  # columnas A y D
ROW_PIXELS = 20
MAX_IMAGE_BASE64 = 12_000_000
MAX_IMAGE_SIDE = 4000
# Mismos textos que ReliabilityCard.jsx
CALIBRATION_LABELS = {
    "useful": "useful to compare genomes",
    "weak": "weak for comparing genomes",
    "not_informative": "not informative for comparing genomes",
    "insufficient": "too few genomes to check it",
}

# (encabezado, columna, ancho, formato numérico)
EDGE_COLUMNS = [
    ("Network", "network", 14, None), ("TF", "tf_name", 14, None), ("TF family", "tf_family", 18, None),
    ("Operon ID", "target_operon", 11, None), ("Operon", "operon_label", 30, None),
    ("Best-site gene", "best_gene_name", 14, None), ("Best-site locus", "best_locus", 16, None),
    ("Genes in operon", "n_genes", 10, None), ("Confidence", "confidence", 11, "0.000"),
    ("-log10(p)", "best_neg_log10_p", 10, "0.00"), ("Footprint enrichment", "footprint_enrichment", 12, "0.000"),
    ("Transfer tier", "tier", 15, None), ("Binding sites", "n_sites", 9, None), ("Motifs", "motifs", 28, None),
]
TF_COLUMNS = [
    ("Network", "network", 14, None), ("TF", "tf_name", 14, None), ("TF family", "tf_family", 18, None),
    ("Motifs", "motifs", 34, None), ("Target operons", "n_targets", 10, None),
    ("Highest confidence", "max_confidence", 12, "0.000"),
]
OPERON_COLUMNS = [
    ("Network", "network", 14, None), ("Operon ID", "target_operon", 11, None), ("Operon", "operon_label", 30, None),
    ("Best-site gene", "best_gene_name", 14, None), ("Best-site locus", "best_locus", 16, None),
    ("Genes in operon", "n_genes", 10, None), ("Regulators", "n_regulators", 10, None),
    ("Regulator names", "regulators", 40, None),
]
SUMMARY_COLUMNS = [
    ("Network", "network", 14, None), ("Filters", "filters", 60, None), ("TFs", "n_tf", 8, None),
    ("Target operons", "n_targets", 10, None), ("TF-operon pairs", "n_edges", 10, None),
    ("Genome targeted", "frac_genome_targeted", 10, "0.0%"), ("Expected precision", "expected_precision", 10, "0.0%"),
    ("Estimate quality", "estimate_quality", 36, None),
    ("Precision (all)", "precision_all", 10, "0.0%"), ("Recall (all)", "recall_all", 10, "0.0%"),
    ("Precision (independent)", "precision_independent", 15, "0.0%"),
    ("Recall (independent)", "recall_independent", 15, "0.0%"),
]
DEFINITIONS = [
    ("Confidence", "Calibrated confidence of the edge. A pair keeps its highest-confidence edge."),
    ("-log10(p)", "Significance of the best binding site."),
    ("Footprint enrichment", "Phylogenetic footprinting enrichment of the edge, when available."),
    ("Transfer tier", "Taxonomic distance of the motif transfer."),
    ("Motifs", "RGnnn = RegPrecise regulog nnn; MX... = PRODORIC."),
    ("Expected precision", "Estimate from the precision of each transfer tier in mode independent. It is not a measured "
                           "value and leaves out pairs whose motif comes from a regulog containing this genome, so it "
                           "can cover fewer pairs than the network."),
    ("Estimate quality", "How well the expected precision separates genomes in this network (cross-validated by GTDB "
                         "family). It applies to the network, not to this genome alone."),
    ("Precision / Recall", "Against RegPrecise, universe genome-TF. 'all' uses every edge; 'independent' excludes edges "
                           "whose motif comes from a regulog containing this genome. Blank = the genome has no curated "
                           "regulons or no evaluable pairs in that network."),
]


def _valor(v):
    """Escalar seguro para Excel: NaN -> vacío y tipos numpy -> nativos."""
    if v is None or (not isinstance(v, (list, dict)) and pd.isna(v)):
        return None
    return v.item() if hasattr(v, "item") else v


def _celda(ws, valor, font=None, fill=None, formato=None, alineacion=None):
    c = WriteOnlyCell(ws, value=_valor(valor))
    if isinstance(c.value, str):
        c.data_type = "s"  # un texto que empiece con "=" nunca se interpreta como fórmula
    if font:
        c.font = font
    if fill:
        c.fill = fill
    if formato:
        c.number_format = formato
    if alineacion:
        c.alignment = alineacion
    return c


def _hoja_tabla(wb, titulo, columnas, df, lang: Lang):
    """Hoja con encabezado fijo y autofiltro."""
    ws = wb.create_sheet(tr(titulo, lang))
    ws.freeze_panes = "A2"
    for i, (_, _, ancho, _) in enumerate(columnas):
        ws.column_dimensions[chr(65 + i)].width = ancho
    ws.auto_filter.ref = f"A1:{chr(64 + len(columnas))}{len(df) + 1}"
    ws.row_dimensions[1].height = HEADER_HEIGHT
    ws.append([_celda(ws, tr(h, lang), HEADER_FONT, HEADER_FILL, alineacion=HEADER_ALIGN) for h, _, _, _ in columnas])
    for fila in df[[c for _, c, _, _ in columnas]].itertuples(index=False):
        ws.append([_celda(ws, v, formato=col[3]) for v, col in zip(fila, columnas)])
    return ws


class ImagenRed(BaseModel):
    network_id: int
    png: str = Field(max_length=MAX_IMAGE_BASE64)
    shown_edges: int = Field(ge=0)


class CuerpoReporte(BaseModel):
    images: list[ImagenRed] = Field(default_factory=list, max_length=5)


def _imagenes(cuerpo: CuerpoReporte, redes: list[dict]) -> dict:
    """Valida las imágenes del dashboard: solo PNG de las redes pedidas. No se guardan."""
    validas = {r["network_id"] for r in redes}
    salida = {}
    for item in cuerpo.images:
        if item.network_id not in validas:
            raise HTTPException(400, f"Image for network {item.network_id} does not belong to this report.")
        try:
            contenido = base64.b64decode(item.png, validate=True)
            with PILImage.open(BytesIO(contenido)) as img:
                formato, tamano = img.format, img.size
                img.verify()
        except (binascii.Error, OSError, SyntaxError, ValueError, PILImage.DecompressionBombError) as err:
            raise HTTPException(400, f"Invalid image for network {item.network_id}.") from err
        if formato != "PNG" or max(tamano) > MAX_IMAGE_SIDE:
            raise HTTPException(400, f"Invalid image for network {item.network_id}.")
        salida[item.network_id] = (contenido, tamano, item.shown_edges)
    return salida


def _titulo_imagen(red: dict, total: int, imagen, lang: Lang) -> str:
    if total == 0:
        return f"{red['name']}: {tr('no predicted edges in this network', lang)}"
    if imagen is None:
        return f"{red['name']}: {tr('image not available', lang)}"
    return (f"{red['name']}: {number(min(imagen[2], total), lang)} {tr('of', lang)} {number(total, lang)} "
            f"{tr('TF-operon pairs drawn', lang)}")


def _agregar_imagenes(ws, fila: int, redes: list[dict], tablas: dict, imagenes: dict, caja: tuple, nota: str, lang: Lang):
    """Agrega desde `fila` (última fila escrita) las imágenes, dos por bloque, con su título en una celda."""
    if fila:
        ws.append([None])
    ws.append([_celda(ws, tr("Network images", lang), SECTION_FONT)])
    ws.append([_celda(ws, tr(nota, lang))])
    fila += 3 if fila else 2
    alto_bloque = ceil(caja[1] / ROW_PIXELS) + 2
    for inicio in range(0, len(redes), len(IMAGE_COLUMNS)):
        bloque = redes[inicio:inicio + len(IMAGE_COLUMNS)]
        titulos = [None] * (IMAGE_COLUMNS[-1] + 1)
        for columna, red in zip(IMAGE_COLUMNS, bloque):
            imagen = imagenes.get(red["network_id"])
            titulos[columna] = _celda(ws, _titulo_imagen(red, len(tablas[red["network_id"]][0]), imagen, lang), SECTION_FONT)
            if imagen:
                dibujo = Image(BytesIO(imagen[0]))
                escala = min(caja[0] / imagen[1][0], caja[1] / imagen[1][1])
                dibujo.width, dibujo.height = round(imagen[1][0] * escala), round(imagen[1][1] * escala)
                dibujo.anchor = f"{chr(65 + columna)}{fila + 2}"
                ws.add_image(dibujo)
        ws.append(titulos)
        for _ in range(alto_bloque - 1):
            ws.append([None])
        fila += alto_bloque


def _hoja_pares(wb, titulo, filas, lang: Lang):
    """Hoja de dos columnas; una fila de un solo texto es un título de sección."""
    ws = wb.create_sheet(tr(titulo, lang))
    ws.column_dimensions["A"].width = 28
    ws.column_dimensions["B"].width = 90
    for fila in filas:
        if len(fila) == 1:
            ws.append([_celda(ws, tr(fila[0], lang), SECTION_FONT)])
        else:
            ws.append([_celda(ws, tr(fila[0], lang), Font(bold=True)), _celda(ws, tr(fila[1], lang))])


def _lista(s: pd.Series) -> str:
    return ", ".join(sorted({str(x) for x in s.dropna()}))


def _tablas_red(red: dict, genome_id: int, min_confidence: float):
    """Tablas de aristas, TF y operones de una red, completas (sin el límite de dibujo de la vista)."""
    e, pares, total = pares_tf_operon(red["network_id"], genome_id, min_confidence)
    if pares.empty:
        vacia = pd.DataFrame(columns=sorted({c for cols in (EDGE_COLUMNS, TF_COLUMNS, OPERON_COLUMNS)
                                             for _, c, _, _ in cols}))
        return vacia, vacia, vacia, total

    por_par = e.groupby(["tf_key", "target_operon"]).motif_key.agg(_lista)
    por_tf = e.groupby("tf_key").motif_key.agg(_lista)
    aristas = pares.assign(network=red["name"],
                           motifs=[por_par[(k, o)] for k, o in zip(pares.tf_key, pares.target_operon)])

    conteo_tf = pares.groupby("tf_key").agg(n_targets=("target_operon", "nunique"), max_confidence=("confidence", "max"))
    familia = pares.groupby("tf_key").tf_family.first()  # primera familia conocida del TF
    tfs = (pares.drop_duplicates("tf_key").drop(columns="motifs", errors="ignore")
           .merge(conteo_tf, left_on="tf_key", right_index=True)
           .assign(network=red["name"], motifs=lambda d: d.tf_key.map(por_tf),
                   tf_family=lambda d: d.tf_key.map(familia))
           .sort_values(["n_targets", "tf_key"], ascending=[False, True]))

    conteo_op = pares.groupby("target_operon").agg(n_regulators=("tf_key", "nunique"), regulators=("tf_name", _lista))
    operones = (pares.drop_duplicates("target_operon")
                .merge(conteo_op, left_on="target_operon", right_index=True)
                .assign(network=red["name"])
                .sort_values(["n_regulators", "target_operon"], ascending=[False, True]))
    return aristas, tfs, operones, total


def _filtros(red: dict, lang: Lang) -> str:
    """Filtros explícitos de la red (listar_redes ya quitó la nota externa "source")."""
    params = red.get("params") or {}
    nombre = (lambda k: FILTER_NAMES.get(k, k)) if lang == "es" else str
    return "; ".join(f"{nombre(k)} = {v}" for k, v in params.items()) or f"p <= {red['p_threshold']}, {red['tier_ceiling']}"


def _resumen_redes(redes: list[dict], accession: str, tablas: dict, lang: Lang) -> pd.DataFrame:
    """Una fila por red: tamaño desde las aristas exportadas y resultados ya calculados."""
    m = atlas_metrics._metrics()
    m = m[m.accession == accession].set_index("network_id")
    conf = atlas_extensions._table("reliability", "genomes.tsv")
    conf = conf[conf.accession == accession].set_index("network_id")
    val = atlas_validation._table("regprecise", "by_genome.tsv")
    val = val[val.accession == accession].set_index(["network_id", "mode"])
    calidad = atlas_extensions._table("reliability", "calibration.tsv").set_index("network_id").status

    filas = []
    for r in redes:
        n = r["network_id"]
        aristas = tablas[n][0]
        fila = {"network": r["name"], "filters": _filtros(r, lang), "n_tf": aristas.tf_key.nunique() if len(aristas) else 0,
                "n_targets": aristas.target_operon.nunique() if len(aristas) else 0, "n_edges": len(aristas),
                "frac_genome_targeted": m.frac_genome_targeted.get(n) if len(aristas) else None,
                "expected_precision": conf.expected_precision.get(n),
                "estimate_quality": tr(CALIBRATION_LABELS.get(calidad.get(n)), lang) if n in conf.index else None}
        for modo in ("all", "independent"):
            existe = (n, modo) in val.index
            fila[f"precision_{modo}"] = val.loc[(n, modo), "precision"] if existe else None
            fila[f"recall_{modo}"] = val.loc[(n, modo), "recall"] if existe else None
        filas.append(fila)
    return pd.DataFrame(filas)


def _libro(genoma: pd.Series, redes: list[dict], min_confidence: float, organismo: bool, imagenes: dict,
           lang: Lang = "en") -> bytes:
    genome_id = int(genoma.genome_id)
    tablas = {r["network_id"]: _tablas_red(r, genome_id, min_confidence) for r in redes}
    cache = _manifest()
    in_atlas = str(genoma.selection).split()[0] in ATLAS_SELECTIONS

    wb = Workbook(write_only=True)
    conteos = [(f"{tr('pairs', lang).capitalize()} {r['name']}" if lang == "es" else f"{r['name']} pairs",
                number(len(tablas[r["network_id"]][0]), lang)) for r in redes]
    sin_aristas = [r["name"] for r in redes if tablas[r["network_id"]][0].empty]
    about = [
        ("RegulonAtlas report",),
        ("Organism", genoma.ncbi_organism or genoma.accession), ("Accession", genoma.accession),
        ("Atlas status", tr("atlas genome", lang) if in_atlas else f"{tr('auxiliary genome', lang)} ({genoma.selection})"),
        ("Networks", ", ".join(r["name"] for r in redes)),
        ("Minimum confidence", "Any" if min_confidence == 0 else f">= {number(min_confidence, lang)}"),
        *conteos,
        ("Generated (UTC)", datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")),
        ("Atlas cache exported", cache.get("exportado")),
        ("Important", "Edges are computational predictions, not experimentally confirmed interactions."),
    ]
    if sin_aristas:
        about.append(("No edges", f"{tr('No predicted edges for this selection in:', lang)} {', '.join(sin_aristas)}."))
    about += [("Column definitions",), *DEFINITIONS]
    _hoja_pares(wb, "About", about, lang)

    if organismo:
        metricas = atlas_metrics._metrics()
        genes = metricas.loc[metricas.accession == genoma.accession, "n_genes"]
        _hoja_pares(wb, "Organism", [
            ("Organism", genoma.ncbi_organism), ("Accession", genoma.accession), ("Selection", genoma.selection),
            ("GTDB domain", genoma.gtdb_domain), ("GTDB phylum", genoma.gtdb_phylum), ("GTDB class", genoma.gtdb_class),
            ("GTDB order", genoma.gtdb_order), ("GTDB family", genoma.gtdb_family), ("GTDB genus", genoma.gtdb_genus),
            ("GTDB species", genoma.gtdb_species), ("Completeness (%)", genoma.completeness),
            ("Contamination (%)", genoma.contamination), ("Assembly level", genoma.assembly_level),
            ("Genes", genes.iloc[0] if len(genes) else None),
        ], lang)
        hoja = _hoja_tabla(wb, "Networks", SUMMARY_COLUMNS, _resumen_redes(redes, genoma.accession, tablas, lang), lang)
        _agregar_imagenes(hoja, len(redes) + 1, redes, tablas, imagenes, ORGANISM_IMAGE_BOX,
                          "Same drawing as the initial Regulatory Networks view (up to 500 highest-confidence edges). "
                          "Green = TF, blue = operon. Every pair is listed in the Edges sheet.", lang)
    else:
        hoja = wb.create_sheet(tr("Network image", lang))
        hoja.column_dimensions["A"].width = 14
        _agregar_imagenes(hoja, 0, redes, tablas, imagenes, NETWORK_IMAGE_BOX,
                          "Network as drawn in Regulatory Networks. Green = TF, blue = operon. "
                          "Every pair that passes the filters is listed in the Edges sheet.", lang)

    for indice, (titulo, columnas) in enumerate([("Edges", EDGE_COLUMNS), ("TFs", TF_COLUMNS), ("Operons", OPERON_COLUMNS)]):
        partes = [tablas[r["network_id"]][indice] for r in redes if not tablas[r["network_id"]][indice].empty]
        df = pd.concat(partes, ignore_index=True) if partes else pd.DataFrame(columns=[c for _, c, _, _ in columnas])
        _hoja_tabla(wb, titulo, columnas, df, lang)

    salida = BytesIO()
    wb.save(salida)
    return salida.getvalue()


def _respuesta(contenido: bytes, nombre: str) -> Response:
    return Response(content=contenido, media_type=XLSX,
                    headers={"Content-Disposition": f'attachment; filename="{nombre}"'})


@router.post("/organism/{accession}")
def exportar_organismo(accession: str, cuerpo: CuerpoReporte | None = None, lang: Lang = "en"):
    """Excel report of one organism with its five complete networks and the images drawn by the dashboard."""
    genoma = _genoma(accession)
    redes = listar_redes()
    contenido = _libro(genoma, redes, 0.0, True, _imagenes(cuerpo or CuerpoReporte(), redes), lang)
    return _respuesta(contenido, f"RegulonAtlas_{accession}_all_networks.xlsx")


@router.post("/network/{network_id}/{accession}")
def exportar_red(network_id: int, accession: str, cuerpo: CuerpoReporte | None = None,
                 min_confidence: float = Query(0.0, ge=0, le=1), lang: Lang = "en"):
    """Excel file with one complete network and the image drawn by the dashboard."""
    nombre_red = _red(network_id)["name"]
    genoma = _genoma(accession)
    red = [r for r in listar_redes() if r["network_id"] == network_id]
    sufijo = f"_conf{min_confidence:g}" if min_confidence > 0 else ""
    contenido = _libro(genoma, red, min_confidence, False, _imagenes(cuerpo or CuerpoReporte(), red), lang)
    return _respuesta(contenido, f"RegulonAtlas_{accession}_{nombre_red}{sufijo}.xlsx")

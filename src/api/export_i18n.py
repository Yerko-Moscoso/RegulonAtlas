"""Textos del reporte Excel en español. El texto base de atlas_export.py sigue en inglés.

No se traducen datos ni identificadores: organismos, TF, genes, redes, tiers, motivos ni categorías de selección.
"""

ES = {
    # Hojas
    "About": "Acerca de",
    "Organism": "Organismo",
    "Networks": "Redes",
    "Network image": "Imagen de la red",
    "Edges": "Aristas",
    "TFs": "TF",
    "Operons": "Operones",
    # Columnas
    "Network": "Red",
    "TF": "TF",
    "TF family": "Familia del TF",
    "Operon ID": "ID del operón",
    "Operon": "Operón",
    "Best-site gene": "Gen del mejor sitio",
    "Best-site locus": "Locus del mejor sitio",
    "Genes in operon": "Genes del operón",
    "Confidence": "Confianza",
    "-log10(p)": "-log10(p)",
    "Footprint enrichment": "Enriquecimiento de footprint",
    "Transfer tier": "Tier de transferencia",
    "Binding sites": "Sitios de unión",
    "Motifs": "Motivos",
    "Target operons": "Operones diana",
    "Highest confidence": "Confianza más alta",
    "Regulators": "Reguladores",
    "Regulator names": "Nombres de los reguladores",
    "Filters": "Filtros",
    "TF-operon pairs": "Pares TF-operón",
    "Genome targeted": "Genoma regulado",
    "Expected precision": "Precisión esperada",
    "Estimate quality": "Calidad de la estimación",
    "Precision (all)": "Precisión (all)",
    "Recall (all)": "Recall (all)",
    "Precision (independent)": "Precisión (independent)",
    "Recall (independent)": "Recall (independent)",
    "Precision / Recall": "Precisión / Recall",
    # Definiciones
    "Calibrated confidence of the edge. A pair keeps its highest-confidence edge.":
        "Confianza calibrada de la arista. Cada par conserva su arista de mayor confianza.",
    "Significance of the best binding site.": "Significancia del mejor sitio de unión.",
    "Phylogenetic footprinting enrichment of the edge, when available.":
        "Enriquecimiento de footprinting filogenético de la arista, cuando está disponible.",
    "Taxonomic distance of the motif transfer.": "Distancia taxonómica de la transferencia del motivo.",
    "RGnnn = RegPrecise regulog nnn; MX... = PRODORIC.": "RGnnn = regulog nnn de RegPrecise; MX... = PRODORIC.",
    "Estimate from the precision of each transfer tier in mode independent. It is not a measured value and leaves out "
    "pairs whose motif comes from a regulog containing this genome, so it can cover fewer pairs than the network.":
        "Estimación a partir de la precisión de cada tier de transferencia en el modo independent. No es un valor medido y "
        "excluye los pares cuyo motivo proviene de un regulog que contiene a este genoma, por lo que puede cubrir menos "
        "pares que la red.",
    "How well the expected precision separates genomes in this network (cross-validated by GTDB family). It applies to "
    "the network, not to this genome alone.":
        "Qué tan bien la precisión esperada distingue genomas en esta red (validación cruzada por familia GTDB). Se aplica "
        "a la red, no solo a este genoma.",
    "Against RegPrecise, universe genome-TF. 'all' uses every edge; 'independent' excludes edges whose motif comes from "
    "a regulog containing this genome. Blank = the genome has no curated regulons or no evaluable pairs in that network.":
        "Contra RegPrecise, universo genoma-TF. 'all' usa todas las aristas; 'independent' excluye las aristas cuyo motivo "
        "proviene de un regulog que contiene a este genoma. Vacío = el genoma no tiene regulones curados o no tiene pares "
        "evaluables en esa red.",
    # Calidad de la estimación
    "useful to compare genomes": "útil para comparar genomas",
    "weak for comparing genomes": "débil para comparar genomas",
    "not informative for comparing genomes": "no informativa para comparar genomas",
    "too few genomes to check it": "muy pocos genomas para comprobarla",
    # Acerca de
    "RegulonAtlas report": "Reporte de RegulonAtlas",
    "Accession": "Accession",
    "Atlas status": "Estado en el atlas",
    "atlas genome": "genoma del atlas",
    "auxiliary genome": "genoma auxiliar",
    "Minimum confidence": "Confianza mínima",
    "Any": "Cualquiera",
    "pairs": "pares",
    "Generated (UTC)": "Generado (UTC)",
    "Atlas cache exported": "Caché del atlas exportada",
    "Important": "Importante",
    "Edges are computational predictions, not experimentally confirmed interactions.":
        "Las aristas son predicciones computacionales, no interacciones confirmadas experimentalmente.",
    "No edges": "Sin aristas",
    "No predicted edges for this selection in:": "No hay aristas predichas para esta selección en:",
    "Column definitions": "Definición de las columnas",
    # Organismo
    "Selection": "Selección",
    "GTDB domain": "Dominio GTDB",
    "GTDB phylum": "Filo GTDB",
    "GTDB class": "Clase GTDB",
    "GTDB order": "Orden GTDB",
    "GTDB family": "Familia GTDB",
    "GTDB genus": "Género GTDB",
    "GTDB species": "Especie GTDB",
    "Completeness (%)": "Completitud (%)",
    "Contamination (%)": "Contaminación (%)",
    "Assembly level": "Nivel de ensamblaje",
    "Genes": "Genes",
    "Complete Genome": "Genoma completo",
    "Chromosome": "Cromosoma",
    "Scaffold": "Scaffold",
    "Contig": "Contig",
    # Imágenes
    "Network images": "Imágenes de las redes",
    "no predicted edges in this network": "sin aristas predichas en esta red",
    "image not available": "imagen no disponible",
    "of": "de",
    "TF-operon pairs drawn": "pares TF-operón dibujados",
    "Same drawing as the initial Regulatory Networks view (up to 500 highest-confidence edges). Green = TF, blue = operon. "
    "Every pair is listed in the Edges sheet.":
        "Mismo dibujo de la vista inicial de Redes regulatorias (hasta 500 aristas de mayor confianza). Verde = TF, azul = "
        "operón. Todos los pares están en la hoja Aristas.",
    "Network as drawn in Regulatory Networks. Green = TF, blue = operon. Every pair that passes the filters is listed in "
    "the Edges sheet.":
        "Red tal como se dibuja en Redes regulatorias. Verde = TF, azul = operón. Todos los pares que pasan los filtros "
        "están en la hoja Aristas.",
}

FILTER_NAMES = {
    "p_max": "p máximo",
    "footprint_enrichment_min": "footprint mínimo",
    "tier_max_rank": "rango máximo de tier",
}


def tr(text, lang: str):
    """Traduce un texto fijo del reporte; un dato (o un texto sin entrada) se devuelve igual."""
    return ES.get(text, text) if lang == "es" and isinstance(text, str) else text


def number(value, lang: str) -> str:
    """Número dentro de un texto: 1,006 en inglés y 1.006 en español. Las celdas numéricas siguen siendo números."""
    text = f"{value:,}"
    return text.translate(str.maketrans(",.", ".,")) if lang == "es" else text

"""
Parámetros compartidos de la red regulatoria (un único lugar para cambiarlos).

Los usan src/api/routers/metrics.py y src/api/routers/graphs.py, de modo que
la red que se dibuja, la que se mide y la que se valida sean la misma.
"""
import csv
from pathlib import Path

from fastapi import HTTPException

PROJECT_ROOT = Path(__file__).resolve().parents[2]

# Umbral que define la red, en -log10(p).
NETWORK_NEG_LOG10_P = 5.0

# En MariaDB solo se cargaron hits con p <= 1e-5 (el resto está en .tsv.gz).
# Un umbral más permisivo daría resultados truncados.
LOADED_MIN_NEG_LOG10_P = 5.0

# ---------------------------------------------------------------------------
# Filtro de ortólogos (etapa "detección de ortólogos del TF")
# ---------------------------------------------------------------------------
# Un hit de FIMO solo cuenta si el mapa de elegibilidad marca el motivo para
# ese genoma. El mapa lo genera src/pipeline/build_transfer_map.py (reglas
# documentadas ahí). Como el usuario de la base es de solo lectura, el mapa se
# lee desde su TSV y se aplica como filtro (genome_id, motif_id) en SQL.
# La tabla original 'transfer_map' no se usa: no es reproducible desde este
# repositorio y excluye TF de su propio organismo de origen (p. ej. TrpR).
USE_ELIGIBILITY = True
ELIGIBILITY_TSV = PROJECT_ROOT / "data/processed/transfer_map/transfer_map.tsv"
ELIGIBLE_RULES = ("source_genome", "ortholog")


def _load_eligibility_filter() -> str:
    if not USE_ELIGIBILITY:
        return ""
    if not ELIGIBILITY_TSV.exists():
        raise RuntimeError(
            f"USE_ELIGIBILITY = True, pero no existe {ELIGIBILITY_TSV}. Generarlo con:\n"
            "  python -m src.pipeline.build_transfer_map --accessions-file config/mvp_genomes.txt\n"
            "o poner USE_ELIGIBILITY = False en src/api/network_params.py."
        )
    pairs = set()
    with open(ELIGIBILITY_TSV, newline="") as f:
        for row in csv.DictReader(f, delimiter="\t"):
            if row["rule"] in ELIGIBLE_RULES:
                pairs.add((int(row["genome_id"]), int(row["motif_id"])))
    if not pairs:
        raise RuntimeError(f"{ELIGIBILITY_TSV} no tiene pares con reglas {ELIGIBLE_RULES}.")
    # Enteros leídos del TSV y convertidos con int(): seguros para interpolar.
    values = ",".join(f"({g},{m})" for g, m in sorted(pairs))
    return f"AND (fh.genome_id, fh.motif_id) IN ({values})"


# Fragmento para el WHERE de toda consulta sobre fimo_hits (alias fh).
# Genomas ausentes del TSV quedan sin aristas mientras el filtro esté activo.
ELIGIBILITY_FILTER = _load_eligibility_filter()

# Definición de arista: par DISTINTO (TF, gen) por genoma. Varios sitios FIMO
# del mismo TF en el mismo gen son una sola arista, y varios motivos del mismo
# TF (p. ej. PRODORIC + RegPrecise) se agrupan por tf_name.
# Requiere los parámetros :accs (lista, bindparam expanding) y :threshold.
EDGES_SQL = f"""
    SELECT DISTINCT gen.accession, m.tf_name AS tf, fh.gene_id
    FROM fimo_hits fh
    JOIN genomes gen ON fh.genome_id = gen.genome_id
    JOIN motifs m ON fh.motif_id = m.motif_id
    WHERE gen.accession IN :accs
      AND fh.neg_log10_p >= :threshold
      AND m.tf_name IS NOT NULL
      {ELIGIBILITY_FILTER}
"""


def check_threshold(threshold: float) -> None:
    if threshold < LOADED_MIN_NEG_LOG10_P:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Umbral 1e-{threshold} más permisivo que el cargado en la base "
                f"(1e-{LOADED_MIN_NEG_LOG10_P}); el resultado estaría truncado."
            ),
        )
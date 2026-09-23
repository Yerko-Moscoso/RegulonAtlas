"""
Parámetros compartidos de la red regulatoria (un único lugar para cambiarlos).

Los usan src/api/routers/metrics.py y src/api/routers/graphs.py, de modo que
la red que se dibuja, la que se mide y la que se valida sean la misma.
"""
from fastapi import HTTPException

# Umbral que define la red, en -log10(p).
NETWORK_NEG_LOG10_P = 5.0

# En MariaDB solo se cargaron hits con p <= 1e-5 (el resto está en .tsv.gz).
# Un umbral más permisivo daría resultados truncados.
LOADED_MIN_NEG_LOG10_P = 5.0

# Definición de arista: par DISTINTO (TF, gen) por genoma. Varios sitios FIMO
# del mismo TF en el mismo gen son una sola arista, y varios motivos del mismo
# TF (p. ej. PRODORIC + RegPrecise) se agrupan por tf_name.
# Requiere los parámetros :accs (lista, bindparam expanding) y :threshold.
# PENDIENTE: filtrar por elegibilidad del TF en el genoma (transfer_map).
EDGES_SQL = """
    SELECT DISTINCT gen.accession, m.tf_name AS tf, fh.gene_id
    FROM fimo_hits fh
    JOIN genomes gen ON fh.genome_id = gen.genome_id
    JOIN motifs m ON fh.motif_id = m.motif_id
    WHERE gen.accession IN :accs
      AND fh.neg_log10_p >= :threshold
      AND m.tf_name IS NOT NULL
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
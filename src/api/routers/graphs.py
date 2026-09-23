from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text, bindparam
from src.database.connection import get_db
from src.api.network_params import NETWORK_NEG_LOG10_P, EDGES_SQL, check_threshold

router = APIRouter(prefix="/graphs", tags=["Graphs"])

# Máximo de aristas enviadas al navegador (las de mejor p-value). La red
# completa se mide en /metrics/topology; aquí solo se dibuja un subgrafo.
MAX_EDGES = 800


@router.get("/{genome_acc}")
async def get_network_graph(
    genome_acc: str,
    threshold: float = NETWORK_NEG_LOG10_P,  # en -log10(p), igual que /metrics
    max_edges: int = MAX_EDGES,
    db: Session = Depends(get_db),
):
    """
    Subgrafo TF -> gen para Cytoscape: las `max_edges` aristas más fuertes de
    la misma red que miden /metrics/topology y /metrics/validation.
    """
    check_threshold(threshold)
    try:
        # Una arista por par (TF, gen), con su mejor p-value y los motivos
        # (PWM) que la sustentan. Antes se devolvían hits crudos, por lo que
        # un mismo par podía aparecer varias veces.
        rows = db.execute(
            text("""
                SELECT m.tf_name AS tf,
                       g.locus_tag,
                       MAX(fh.neg_log10_p) AS best,
                       GROUP_CONCAT(DISTINCT m.motif_key ORDER BY m.motif_key) AS motifs
                FROM fimo_hits fh
                JOIN genomes gen ON fh.genome_id = gen.genome_id
                JOIN genes g ON fh.gene_id = g.gene_id
                JOIN motifs m ON fh.motif_id = m.motif_id
                WHERE gen.accession = :genome_acc
                  AND fh.neg_log10_p >= :threshold
                  AND m.tf_name IS NOT NULL
                GROUP BY m.tf_name, g.locus_tag
                ORDER BY best DESC
                LIMIT :max_edges
            """),
            {"genome_acc": genome_acc, "threshold": threshold, "max_edges": max_edges},
        ).fetchall()

        if not rows:
            raise HTTPException(
                status_code=404, detail=f"No se encontraron interacciones para {genome_acc}"
            )

        total_edges = db.execute(
            text(f"SELECT COUNT(*) FROM ({EDGES_SQL}) AS e").bindparams(
                bindparam("accs", expanding=True)
            ),
            {"accs": [genome_acc], "threshold": threshold},
        ).scalar()

        tf_motifs = {}
        targets = set()
        edges = []
        for tf, locus_tag, best, motifs in rows:
            tf_motifs.setdefault(tf, set()).update((motifs or "").split(","))
            targets.add(locus_tag)
            edges.append({
                "data": {
                    "source": tf,
                    "target": locus_tag,
                    "weight": float(best),
                }
            })

        # El tipo de nodo sale de la consulta (lado TF o lado blanco), no de
        # adivinar por prefijos del nombre.
        nodes = [
            {
                "data": {
                    "id": tf,
                    "label": tf,
                    "node_type": "TF",
                    "motifs": sorted(m for m in motif_set if m),
                }
            }
            for tf, motif_set in tf_motifs.items()
        ]
        nodes += [
            {"data": {"id": t, "label": t, "node_type": "Gene"}}
            for t in targets
            if t not in tf_motifs
        ]

        return {
            "graph_id": genome_acc,
            "neg_log10_p_threshold": threshold,
            "shown_edges": len(edges),
            "total_edges": total_edges,
            "elements": {"nodes": nodes, "edges": edges},
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
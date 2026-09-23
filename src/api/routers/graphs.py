from fastapi import APIRouter, HTTPException

from src.api import results

router = APIRouter(prefix="/graphs", tags=["Graphs"])


@router.get("/{genome_acc}")
async def get_network_graph(genome_acc: str, max_edges: int | None = None):
    """
    Subgrafo TF -> gen para Cytoscape: las `max_edges` aristas de mejor p-value
    de la misma red que miden /metrics/topology y /metrics/validation.
    """
    params = results.params()
    thr = params["network_neg_log10_p"]
    limit = max_edges or params["graph_max_edges"]

    df = results.edges(genome_acc)
    net = df[df["neg_log10_p"] >= thr]
    if net.empty:
        raise HTTPException(status_code=404, detail=f"No hay interacciones para {genome_acc}.")

    # Motivos de cada TF sobre la red completa, no solo sobre lo dibujado.
    tf_motifs = (net.dropna(subset=["motifs"]).groupby("tf")["motifs"]
                    .apply(lambda s: sorted({m for v in s for m in v.split(",") if m})))
    shown = net.sort_values("neg_log10_p", ascending=False, kind="mergesort").head(limit)

    nodes, seen_genes = [], set()
    for tf in sorted(shown["tf"].unique()):
        nodes.append({"data": {"id": f"tf:{tf}", "label": tf, "node_type": "TF",
                               "motifs": tf_motifs.get(tf, [])}})
    edges = []
    for r in shown.itertuples(index=False):
        gid = f"gene:{r.target_locus_tag}"
        if gid not in seen_genes:
            seen_genes.add(gid)
            label = r.target_gene_name if isinstance(r.target_gene_name, str) and r.target_gene_name else r.target_locus_tag
            nodes.append({"data": {"id": gid, "label": label, "node_type": "Gene",
                                   "locus_tag": r.target_locus_tag}})
        edges.append({"data": {"source": f"tf:{r.tf}", "target": gid, "weight": float(r.neg_log10_p),
                               "evidence": r.evidence}})

    return {
        "graph_id": genome_acc,
        "neg_log10_p_threshold": thr,
        "shown_edges": len(edges),
        "total_edges": int(len(net)),
        "elements": {"nodes": nodes, "edges": edges},
    }

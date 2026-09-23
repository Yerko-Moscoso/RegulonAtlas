from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from src.database.connection import get_db
import math

router = APIRouter(prefix="/graphs", tags=["Graphs"])

@router.get("/{genome_acc}")
async def get_network_graph(
    genome_acc: str, 
    threshold: float = 1e-4,
    db: Session = Depends(get_db)
):
    """
    Retorna la topología de red consultando directamente MariaDB (Esquema v3).
    """
    try:
        min_weight = -math.log10(threshold) if threshold > 0 else 0
        
        # Consulta SQL optimizada: JOIN cuádruple con límite de seguridad integrado
        query = text("""
            SELECT 
                m.motif_key, 
                g.locus_tag, 
                fh.neg_log10_p
            FROM fimo_hits fh
            JOIN genomes gen ON fh.genome_id = gen.genome_id
            JOIN genes g ON fh.gene_id = g.gene_id
            JOIN motifs m ON fh.motif_id = m.motif_id
            WHERE gen.accession = :genome_acc 
              AND fh.neg_log10_p >= :min_weight
            ORDER BY fh.neg_log10_p DESC
            LIMIT 800
        """)

        results = db.execute(query, {
            "genome_acc": genome_acc, 
            "min_weight": min_weight
        }).fetchall()

        if not results:
            raise HTTPException(status_code=404, detail=f"No se encontraron interacciones para {genome_acc}")

        active_nodes = set()
        cytoscape_edges = []
        
        for row in results:
            source_id = str(row[0])
            target_id = str(row[1])
            weight = float(row[2])
            
            active_nodes.add(source_id)
            active_nodes.add(target_id)
            
            cytoscape_edges.append({
                "data": {
                    "source": source_id,
                    "target": target_id,
                    "weight": weight,
                    "is_leader": True
                }
            })

        cytoscape_nodes = []
        for node_id in active_nodes:
            cytoscape_nodes.append({
                "data": {
                    "id": node_id,
                    "label": node_id,
                    "node_type": "TF" if any(prefix in node_id for prefix in ["TF", "MX", "RG", "LexA", "Fur"]) else "Gene"
                }
            })

        return {
            "graph_id": genome_acc,
            "elements": {"nodes": cytoscape_nodes, "edges": cytoscape_edges}
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
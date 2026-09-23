from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
import pandas as pd
from src.database.connection import get_db

router = APIRouter(prefix="/metrics", tags=["Metrics"])

@router.get("/validation/{genome_acc}")
async def get_validation_curve(genome_acc: str, db: Session = Depends(get_db)):
    try:
        # 1. Extraer predicciones desde MariaDB
        pred_query = text("""
            SELECT 
                m.tf_name AS tf_name_translated, 
                g.locus_tag AS target_gene, 
                fh.neg_log10_p AS neg_log10_pvalue
            FROM fimo_hits fh
            JOIN genomes gen ON fh.genome_id = gen.genome_id
            JOIN genes g ON fh.gene_id = g.gene_id
            JOIN motifs m ON fh.motif_id = m.motif_id
            WHERE gen.accession = :genome_acc
        """)
        df_pred = pd.read_sql(pred_query, db.bind, params={"genome_acc": genome_acc})
        
        if df_pred.empty:
            raise HTTPException(status_code=404, detail="Sin predicciones para este genoma.")
            
        # 2. Extraer nombre del organismo para buscar su Gold Standard
        org_query = text("SELECT ncbi_organism FROM genomes WHERE accession = :genome_acc")
        org_name = db.execute(org_query, {"genome_acc": genome_acc}).scalar() or ""
        keyword = org_name.split()[0] if org_name else ""
        
        # 3. Buscar interacciones curadas
        try:
            gs_query = text("SELECT tf_name, locus_tag FROM curated_regulons WHERE genome_name LIKE :keyword")
            df_gs = pd.read_sql(gs_query, db.bind, params={"keyword": f"%{keyword}%"})
        except Exception:
            raise HTTPException(status_code=404, detail="Gold Standard no disponible.")

        if df_gs.empty:
            raise HTTPException(status_code=404, detail="Sin métricas para este genoma.")

        # Limpieza estándar
        df_gs["tf_name"] = df_gs["tf_name"].str.upper().str.replace(r'[^A-Z0-9]', '', regex=True)
        df_gs["locus_tag"] = df_gs["locus_tag"].str.upper().str.replace(r'(?i)^gene[-_]', '', regex=True).replace(r'[^A-Z0-9]', '', regex=True)
        gold_standard_edges = set(zip(df_gs["tf_name"], df_gs["locus_tag"]))

        df_pred["tf_name_translated"] = df_pred["tf_name_translated"].str.upper().str.replace(r'[^A-Z0-9]', '', regex=True)
        df_pred["target_gene"] = df_pred["target_gene"].str.upper().str.replace(r'(?i)^gene[-_]', '', regex=True).replace(r'[^A-Z0-9]', '', regex=True)

        # 4. Calcular métricas en distintos umbrales
        thresholds = [4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0]
        results = []

        for thresh in thresholds:
            df_filtered = df_pred[df_pred["neg_log10_pvalue"] >= thresh]
            predicted_edges = set(zip(df_filtered["tf_name_translated"], df_filtered["target_gene"]))

            tp = len(predicted_edges.intersection(gold_standard_edges))
            fp = len(predicted_edges - gold_standard_edges)
            fn = len(gold_standard_edges - predicted_edges)

            precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
            recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0

            results.append({
                "genome_acc": genome_acc,
                "organism": org_name,
                "neg_log10_pvalue_threshold": thresh,
                "p_value_equivalent": f"1e-{thresh}",
                "true_positives": tp,
                "false_positives": fp,
                "false_negatives": fn,
                "precision": round(precision, 6),
                "recall": round(recall, 6)
            })

        return results
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/topology/{genome_acc}")
async def get_topology_metrics(genome_acc: str, hub_degree_threshold: int = 20, db: Session = Depends(get_db)):
    """
    5 métricas topológicas básicas definidas en el alcance del MVP
    (nodos, aristas, densidad, grado medio, hubs), calculadas directamente
    en SQL sobre fimo_hits. No requiere NetworkX ni cargar el grafo completo:
    "escanear una vez, filtrar después" también aplica aquí.
    """
    try:
        # Cálculo topológico directo en SQL
        query = text("""
            SELECT 
                COUNT(DISTINCT fh.gene_id) + COUNT(DISTINCT fh.motif_id) AS nodos,
                COUNT(*) AS aristas
            FROM fimo_hits fh
            JOIN genomes gen ON fh.genome_id = gen.genome_id
            WHERE gen.accession = :genome_acc AND fh.neg_log10_p >= 4.0
        """)
        result = db.execute(query, {"genome_acc": genome_acc}).fetchone()
        
        if not result or result[0] == 0:
            raise HTTPException(status_code=404, detail="Sin métricas topológicas.")
            
        nodos, aristas = result[0], result[1]
        densidad = aristas / (nodos * (nodos - 1)) if nodos > 1 else 0

        # Hubs: TFs (motifs) cuyo grado de salida (genes distintos regulados)
        # supera el umbral. Misma tabla, misma condición de p-value que arriba,
        # una sola consulta adicional agrupada por motif_id.
        hubs_query = text("""
            SELECT COUNT(*) FROM (
                SELECT fh.motif_id, COUNT(DISTINCT fh.gene_id) AS grado
                FROM fimo_hits fh
                JOIN genomes gen ON fh.genome_id = gen.genome_id
                WHERE gen.accession = :genome_acc AND fh.neg_log10_p >= 4.0
                GROUP BY fh.motif_id
                HAVING COUNT(DISTINCT fh.gene_id) > :umbral
            ) AS hub_tfs
        """)
        hubs = db.execute(
            hubs_query, {"genome_acc": genome_acc, "umbral": hub_degree_threshold}
        ).scalar() or 0

        return {
            "genome_acc": genome_acc,
            "nodos": nodos,
            "aristas": aristas,
            "densidad": round(densidad, 6),
            "grado_medio": round(aristas / nodos, 4) if nodos > 0 else 0,
            "hubs": hubs,
            "hub_degree_threshold": hub_degree_threshold
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
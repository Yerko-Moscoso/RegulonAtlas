from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text, bindparam
import pandas as pd
from src.database.connection import get_db
from src.api.network_params import (
    NETWORK_NEG_LOG10_P,
    LOADED_MIN_NEG_LOG10_P,
    EDGES_SQL,
    check_threshold,
)

router = APIRouter(prefix="/metrics", tags=["Metrics"])

VALIDATION_THRESHOLDS = [5.0, 5.5, 6.0, 6.5, 7.0]
GOLD_STANDARD_LABEL = "RegPrecise 3.2 (curated_regulons)"

# Caché en memoria: fimo_hits no cambia mientras el servidor corre, así que
# cada resultado se calcula una sola vez. Se vacía al reiniciar uvicorn (o
# cuando --reload recarga el código). Si se recargan datos en MariaDB,
# reiniciar el backend.
_cache: dict = {}


def _expanding(sql: str):
    return text(sql).bindparams(bindparam("accs", expanding=True))


# ---------------------------------------------------------------------------
# Topología
# ---------------------------------------------------------------------------
def _compute_topology(db: Session, accessions, threshold: float, hub: int) -> dict:
    """Métricas de varios genomas con 3 consultas en total (no 2 por genoma)."""
    key = lambda acc: ("topology", acc, threshold, hub)
    missing = [a for a in accessions if key(a) not in _cache]

    if missing:
        params = {"accs": missing, "threshold": threshold}

        # Grado de salida de cada TF, por genoma.
        degrees = db.execute(
            _expanding(f"""
                SELECT e.accession, e.tf, COUNT(*) AS deg
                FROM ({EDGES_SQL}) AS e
                GROUP BY e.accession, e.tf
            """),
            params,
        ).fetchall()

        targets = dict(
            db.execute(
                _expanding(f"""
                    SELECT e.accession, COUNT(DISTINCT e.gene_id)
                    FROM ({EDGES_SQL}) AS e
                    GROUP BY e.accession
                """),
                params,
            ).fetchall()
        )

        names = dict(
            db.execute(
                _expanding(
                    "SELECT accession, ncbi_organism FROM genomes WHERE accession IN :accs"
                ),
                {"accs": missing},
            ).fetchall()
        )

        stats = {}
        for acc, _tf, deg in degrees:
            s = stats.setdefault(acc, {"aristas": 0, "n_tfs": 0, "hubs": 0})
            s["aristas"] += int(deg)
            s["n_tfs"] += 1
            if deg > hub:
                s["hubs"] += 1

        for acc in missing:
            s = stats.get(acc)
            if not s:
                _cache[key(acc)] = None  # sin aristas a este umbral
                continue
            n_targets = int(targets.get(acc, 0))
            # Limitación conocida: un TF que además es gen blanco cuenta como
            # dos nodos (se resuelve al mapear cada TF a su propio gen).
            nodos = s["n_tfs"] + n_targets
            aristas = s["aristas"]
            _cache[key(acc)] = {
                "genome_acc": acc,
                "organism": names.get(acc, acc),
                "neg_log10_p_threshold": threshold,
                "nodos": nodos,
                "n_tfs": s["n_tfs"],
                "n_targets": n_targets,
                "aristas": aristas,
                "densidad": round(aristas / (nodos * (nodos - 1)), 6) if nodos > 1 else 0,
                "grado_medio": round(aristas / nodos, 4) if nodos > 0 else 0,
                "hubs": s["hubs"],
                "hub_degree_threshold": hub,
            }

    return {a: _cache[key(a)] for a in accessions if _cache.get(key(a))}


@router.get("/topology-summary")
async def get_topology_summary(
    accessions: list[str] = Query(...),
    hub_degree_threshold: int = 20,
    threshold: float = NETWORK_NEG_LOG10_P,
    db: Session = Depends(get_db),
):
    """5 métricas básicas de varios genomas en una sola llamada (Dashboard)."""
    check_threshold(threshold)
    try:
        res = _compute_topology(db, accessions, threshold, hub_degree_threshold)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return [res[a] for a in accessions if a in res]


@router.get("/topology/{genome_acc}")
async def get_topology_metrics(
    genome_acc: str,
    hub_degree_threshold: int = 20,
    threshold: float = NETWORK_NEG_LOG10_P,
    db: Session = Depends(get_db),
):
    """5 métricas topológicas básicas (nodos, aristas, densidad, grado medio, hubs)."""
    check_threshold(threshold)
    try:
        res = _compute_topology(db, [genome_acc], threshold, hub_degree_threshold)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    if genome_acc not in res:
        raise HTTPException(status_code=404, detail="Sin métricas topológicas.")
    return res[genome_acc]


# ---------------------------------------------------------------------------
# Validación
# ---------------------------------------------------------------------------
def _norm_tf(s):
    return s.str.upper().str.replace(r"[^A-Z0-9]", "", regex=True)


def _norm_locus(s):
    return (
        s.str.upper()
        .str.replace(r"^GENE[-_]", "", regex=True)
        .str.replace(r"[^A-Z0-9]", "", regex=True)
    )


def _compute_validation(db: Session, genome_acc: str) -> list:
    # 1. Predicciones: pares (TF, locus_tag) con su mejor p-value.
    df_pred = pd.read_sql(
        text("""
            SELECT m.tf_name AS tf, g.locus_tag AS target,
                   MAX(fh.neg_log10_p) AS neg_log10_p
            FROM fimo_hits fh
            JOIN genomes gen ON fh.genome_id = gen.genome_id
            JOIN genes g ON fh.gene_id = g.gene_id
            JOIN motifs m ON fh.motif_id = m.motif_id
            WHERE gen.accession = :genome_acc
              AND fh.neg_log10_p >= :min_threshold
              AND m.tf_name IS NOT NULL
            GROUP BY m.tf_name, g.locus_tag
        """),
        db.bind,
        params={"genome_acc": genome_acc, "min_threshold": LOADED_MIN_NEG_LOG10_P},
    )
    if df_pred.empty:
        raise HTTPException(status_code=404, detail="Sin predicciones para este genoma.")

    org_name = db.execute(
        text("SELECT ncbi_organism FROM genomes WHERE accession = :genome_acc"),
        {"genome_acc": genome_acc},
    ).scalar() or ""

    # 2. Gold standard SOLO de este genoma, vía regprecise_genome_map.
    df_gs = pd.read_sql(
        text("""
            SELECT DISTINCT cr.tf_name, cr.locus_tag
            FROM curated_regulons cr
            JOIN regprecise_genome_map rm ON cr.genome_name = rm.genome_name
            WHERE rm.accession = :genome_acc
        """),
        db.bind,
        params={"genome_acc": genome_acc},
    )
    if df_gs.empty:
        raise HTTPException(status_code=404, detail="Sin gold standard para este genoma.")

    gold = set(zip(_norm_tf(df_gs["tf_name"]), _norm_locus(df_gs["locus_tag"])))
    df_pred["tf"] = _norm_tf(df_pred["tf"])
    df_pred["target"] = _norm_locus(df_pred["target"])

    results = []
    for thresh in VALIDATION_THRESHOLDS:
        sel = df_pred[df_pred["neg_log10_p"] >= thresh]
        predicted = set(zip(sel["tf"], sel["target"]))
        tp = len(predicted & gold)
        fp = len(predicted - gold)
        fn = len(gold - predicted)
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        results.append({
            "genome_acc": genome_acc,
            "organism": org_name,
            "gold_standard": GOLD_STANDARD_LABEL,
            "neg_log10_pvalue_threshold": thresh,
            "p_value_equivalent": f"1e-{thresh}",
            "true_positives": tp,
            "false_positives": fp,
            "false_negatives": fn,
            "precision": round(precision, 6),
            "recall": round(recall, 6),
        })
    return results


@router.get("/validation/{genome_acc}")
async def get_validation_curve(genome_acc: str, db: Session = Depends(get_db)):
    key = ("validation", genome_acc)
    if key in _cache:
        return _cache[key]
    try:
        results = _compute_validation(db, genome_acc)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    _cache[key] = results
    return results
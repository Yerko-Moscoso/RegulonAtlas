from typing import List

from fastapi import APIRouter, HTTPException, Query

from src.api import results

router = APIRouter(prefix="/metrics", tags=["Metrics"])


@router.get("/topology-summary")
async def get_topology_summary(accessions: List[str] = Query(...)):
    """5 métricas básicas de varios genomas en una llamada (Dashboard)."""
    topo = results.topology()
    return [topo[a] for a in accessions if a in topo]


@router.get("/topology/{genome_acc}")
async def get_topology_metrics(genome_acc: str):
    """Métricas de la red completa, distribución de grados y ranking de TF."""
    topo = results.topology()
    if genome_acc not in topo:
        raise HTTPException(status_code=404, detail="Sin métricas topológicas para este genoma.")
    return topo[genome_acc]


@router.get("/validation/{genome_acc}")
async def get_validation_curve(genome_acc: str, variant: str = "with_operons"):
    """Curva precisión/recall por umbral. variant: with_operons | direct_only."""
    entry = results.validation().get(genome_acc)
    if not entry or entry["status"] == "no_gold_standard":
        raise HTTPException(status_code=404, detail="Sin gold standard para este genoma.")
    if variant not in entry["variants"]:
        raise HTTPException(status_code=400, detail=f"Variante desconocida: {variant}")
    return [{**row, "status": entry["status"]} for row in entry["variants"][variant]]

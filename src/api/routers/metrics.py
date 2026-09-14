from fastapi import APIRouter, HTTPException
from pathlib import Path
import pandas as pd

router = APIRouter(prefix="/metrics", tags=["Metrics"])
VALIDATION_FILE = Path("data/processed/validation_metrics.tsv")
TOPOLOGY_FILE = Path("data/processed/network_metrics.tsv")

@router.get("/validation/{genome_acc}")
async def get_validation_curve(genome_acc: str):
    """Retorna los puntos de la curva Precisión vs Recall."""
    if not VALIDATION_FILE.exists():
        raise HTTPException(status_code=404, detail="Archivo de validación no encontrado.")
        
    df = pd.read_csv(VALIDATION_FILE, sep="\t")
    df_genome = df[df["genome_acc"] == genome_acc]
    
    if df_genome.empty:
        raise HTTPException(status_code=404, detail="Sin métricas para este genoma.")
        
    return df_genome.to_dict(orient="records")

@router.get("/topology/{genome_acc}")
async def get_topology_metrics(genome_acc: str):
    """Retorna el vector de métricas estructurales (nodos, aristas, hubs)."""
    if not TOPOLOGY_FILE.exists():
        raise HTTPException(status_code=404, detail="Archivo de topología no encontrado.")
        
    df = pd.read_csv(TOPOLOGY_FILE, sep="\t")
    df_genome = df[df["genome_acc"] == genome_acc]
    
    if df_genome.empty:
        raise HTTPException(status_code=404, detail="Sin métricas topológicas.")
        
    return df_genome.to_dict(orient="records")[0]
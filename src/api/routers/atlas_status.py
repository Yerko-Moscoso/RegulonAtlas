"""Estado del pipeline del atlas (solo lectura, semana 13).

Junta los manifest.json de la caché y de cada resultado (src/atlas_status.py): commit, árbol limpio, fecha,
archivos y si cada resultado está al día con su entrada. Lo usan las vistas Data Provenance y Pipeline.
"""
from fastapi import APIRouter

from src.atlas_status import pipeline_status

router = APIRouter(prefix="/atlas", tags=["atlas-status"])


@router.get("/status")
def status():
    """Pipeline steps with their manifest, git traceability and whether each result is up to date."""
    return pipeline_status()

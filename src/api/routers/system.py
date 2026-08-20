from fastapi import APIRouter
from src.api.schemas.common import HealthResponse
from src.api.config import get_settings

router = APIRouter(tags=["System"])
settings = get_settings()


@router.get("/health", response_model=HealthResponse)
async def health_check():
    return {
        "status": "healthy",
        "version": settings.VERSION,
        "environment": "development"
    }
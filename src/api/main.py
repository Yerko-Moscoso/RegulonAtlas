from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse
from src.api.config import get_settings
from src.api.routers import system, graphs, metrics, genomes, motifs, fingerprints

settings = get_settings()

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    default_response_class=ORJSONResponse,
    docs_url="/docs",
    redoc_url="/redoc"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(system.router, prefix=settings.API_V1_STR)
app.include_router(graphs.router, prefix=settings.API_V1_STR)
app.include_router(metrics.router, prefix=settings.API_V1_STR)
app.include_router(genomes.router, prefix=settings.API_V1_STR)
app.include_router(motifs.router, prefix=settings.API_V1_STR)
app.include_router(fingerprints.router, prefix=settings.API_V1_STR)

@app.get("/")
async def root():
    return {
        "message": f"Backend Operativo - {settings.PROJECT_NAME}",
        "docs": "/docs",
        "api_v1": settings.API_V1_STR
    }
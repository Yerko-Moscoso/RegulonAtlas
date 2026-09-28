import os
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Cargar variables de entorno
env_path = Path(__file__).resolve().parent.parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

def get_engine():
    """Crea la conexión a MariaDB."""
    user = str(os.getenv("DB_USER", "ymoscoso")).strip()
    password = os.getenv("DB_PASSWORD")
    if not password:
        raise RuntimeError("Falta la variable de entorno DB_PASSWORD (ver .env.example).")
    host = str(os.getenv("DB_HOST", "127.0.0.1")).strip()
    port = str(os.getenv("DB_PORT", "3306")).strip()
    database = str(os.getenv("DB_NAME", "regulon_atlas")).strip()

    # URL de conexión para MySQL/MariaDB
    database_url = f"mysql+pymysql://{user}:{password}@{host}:{port}/{database}?charset=utf8mb4"
    
    engine = create_engine(
        database_url,
        pool_recycle=3600,      # Renueva conexiones cada hora
        pool_pre_ping=True,     # Verifica que la conexión esté viva
        echo=False              # Cambiar a True para ver el SQL generado en consola
    )
    return engine

# Creador de sesiones para inyectar en FastAPI después
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=get_engine())

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
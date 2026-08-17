import json
import logging
from datetime import datetime, timezone
from pathlib import Path
import requests

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)

BASE_URL = "https://prodoric.de/api"
RAW_DATA_DIR = Path("data/raw/prodoric")


def fetch_prodoric_organisms():
    """Descarga la lista de organismos disponibles en PRODORIC."""
    RAW_DATA_DIR.mkdir(parents=True, exist_ok=True)
    
    url = f"{BASE_URL}/organisms"
    logging.info(f"Consultando organismos en: {url}")
    
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        data = response.json()
        
        # Envoltorio con metadatos de procedencia
        snapshot = {
            "source": "PRODORIC",
            "endpoint": url,
            "retrieved_at_utc": datetime.now(timezone.utc).isoformat(),
            "data": data
        }
        
        output_file = RAW_DATA_DIR / "organisms_index.json"
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(snapshot, f, indent=2, ensure_ascii=False)
            
        logging.info(f"Índice guardado exitosamente en: {output_file}")
        return data
        
    except requests.exceptions.RequestException as e:
        logging.error(f"Error al conectar con la API de PRODORIC: {e}")
        return None


if __name__ == "__main__":
    fetch_prodoric_organisms()

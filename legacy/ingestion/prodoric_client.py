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
RAW_PRODORIC_DIR = Path("data/raw/prodoric")
MATRICES_DIR = RAW_PRODORIC_DIR / "matrices"


def fetch_prodoric_data():
    RAW_PRODORIC_DIR.mkdir(parents=True, exist_ok=True)
    MATRICES_DIR.mkdir(parents=True, exist_ok=True)

    logging.info("Descargando catálogo completo de matrices desde PRODORIC...")
    response = requests.get(f"{BASE_URL}/matrix", timeout=30)
    response.raise_for_status()
    matrix_list = response.json()

    # 1. Guardar el catálogo crudo completo con metadatos de procedencia
    snapshot = {
        "source": "PRODORIC",
        "endpoint": f"{BASE_URL}/matrix",
        "retrieved_at_utc": datetime.now(timezone.utc).isoformat(),
        "total_matrices": len(matrix_list),
        "data": matrix_list
    }
    
    index_file = RAW_PRODORIC_DIR / "matrices_complete.json"
    with open(index_file, "w", encoding="utf-8") as f:
        json.dump(snapshot, f, indent=2, ensure_ascii=False)

    logging.info(f"Catálogo completo guardado en: {index_file}")

    # 2. Guardar cada matriz individualmente como MX00000X.json
    saved_count = 0
    for item in matrix_list:
        mx_id = item.get("mx")
        if mx_id is None:
            continue
        
        acc = f"MX{int(mx_id):06d}"
        matrix_file = MATRICES_DIR / f"{acc}.json"
        
        with open(matrix_file, "w", encoding="utf-8") as f:
            json.dump(item, f, indent=2, ensure_ascii=False)
        saved_count += 1

    logging.info(f"Se exportaron exitosamente {saved_count} archivos de matrices a {MATRICES_DIR}")


if __name__ == "__main__":
    fetch_prodoric_data()
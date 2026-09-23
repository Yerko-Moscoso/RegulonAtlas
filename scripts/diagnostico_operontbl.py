from pathlib import Path
from bs4 import BeautifulSoup

PAGES_DIR = Path("data/raw/regprecise/pages")

# Buscar específicamente el archivo de regulon_id 5160 (el que sabemos que
# SÍ tiene tabla de genes real, porque ya lo inspeccionamos manualmente)
candidatos = list(PAGES_DIR.glob("*regulon_id_5160_*.html"))
print(f"Archivos encontrados para regulon_id_5160: {candidatos}")

if not candidatos:
    print("!! No se encontró el archivo. Verifica el nombre real con:")
    print("   ls data/raw/regprecise/pages/ | grep regulon_id_5160")
else:
    p = candidatos[0]
    print(f"Usando archivo: {p}")
    print(f"Tamaño del archivo: {p.stat().st_size} bytes")

    with open(p, "r", encoding="utf-8", errors="ignore") as f:
        contenido = f.read()

    print(f"Longitud del contenido leído: {len(contenido)} caracteres")
    print(f"¿Contiene 'operontbl'?: {'operontbl' in contenido}")
    print(f"¿Contiene 'showinfo'?: {'showinfo' in contenido}")

    soup = BeautifulSoup(contenido, "lxml")

    title = soup.find("title")
    print(f"Título encontrado: {title.text.strip() if title else 'NINGUNO'}")

    tabla = soup.find("table", id="operontbl")
    print(f"¿Tabla operontbl encontrada por BeautifulSoup?: {tabla is not None}")

    if tabla:
        filas = tabla.find_all("tr")
        print(f"Total de <tr> dentro de la tabla: {len(filas)}")
        for i, fila in enumerate(filas[:8]):
            celdas = fila.find_all("td")
            textos = [c.get_text(strip=True)[:25] for c in celdas]
            print(f"  Fila {i}: {len(celdas)} celdas -> {textos}")
#!/usr/bin/env python
"""Descarga de RegulonDB para la validación de E. coli K-12 (excepción E5 del congelamiento).

Baja por la API GraphQL pública la red regulador -> gen y los identificadores de genes, y guarda en
data/raw/regulondb/ los archivos y un manifest.json (versión, fecha, licencia y cita, sha256).

Licencia: RegulonDB es libre para uso académico y no comercial, y no permite integrarlo en otras bases
de datos sin consentimiento escrito de CCG-UNAM. Por eso estos archivos NO se versionan y el dashboard
solo muestra cifras agregadas, nunca las interacciones.

Uso (desde ~/proyecto): PYTHONPATH=. python scripts/download_regulondb.py
"""
import hashlib
import json
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

URL = "https://regulondb.ccg.unam.mx/graphql"
OUT = Path("data/raw/regulondb")
FILES = ["NetworkRegulatorGene", "GeneProductAllIdentifiersSet"]
FIELDS = "fileName fileFormat license citation version rdbVersion creationDate columnsDetails content"


def fetch(name):
    body = json.dumps({"query": f'{{getDataOfFile(fileName:"{name}"){{{FIELDS}}}}}'}).encode()
    req = urllib.request.Request(URL, data=body, headers={"Content-Type": "application/json",
                                                          "User-Agent": "RegulonAtlas-thesis"})
    with urllib.request.urlopen(req, timeout=180) as r:
        payload = json.load(r)
    if payload.get("errors"):
        sys.exit(f"RegulonDB devolvió errores para {name}: {payload['errors']}")
    return payload["data"]["getDataOfFile"]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    meta = {"source": URL, "downloaded_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "files": {}}
    for name in FILES:
        d = fetch(name)
        content = d.pop("content")
        if not content or not content.strip():
            sys.exit(f"{name}: contenido vacío")
        path = OUT / f"{name}.tsv"
        path.write_text(content)
        meta["files"][name] = {**d, "path": str(path), "lines": len(content.splitlines()),
                               "sha256": hashlib.sha256(content.encode()).hexdigest()}
        print(f"{name}: {len(content.splitlines()):,} líneas, RegulonDB {d['rdbVersion']}")
    (OUT / "manifest.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()

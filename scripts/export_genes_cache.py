#!/usr/bin/env python
"""Exporta la tabla genes completa (2.644 genomas) a data/cache/atlas/genes_all.parquet.

Necesaria para las métricas propias de la semana 11: identificar el operón que
codifica a cada TF (aristas TF -> TF) y expandir operones a genes.

Uso (desde ~/proyecto; tarda unos minutos, mejor con nohup):
    nohup env PYTHONPATH=. python scripts/export_genes_cache.py > data/cache/genes_export.log 2>&1 &
"""
import json
import time
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from sqlalchemy import text

from src.database.connection import get_engine

OUT = Path("data/cache/atlas/genes_all.parquet")
QUERY = "SELECT gene_id, genome_id, locus_tag, gene_name, operon_id FROM genes ORDER BY gene_id"
CHUNK = 500_000

SCHEMA = pa.schema([
    ("gene_id", pa.int64()),
    ("genome_id", pa.int64()),
    ("locus_tag", pa.string()),
    ("gene_name", pa.string()),
    ("operon_id", pa.int64()),
])


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    tmp = OUT.with_suffix(".parquet.tmp")
    engine = get_engine()
    t0 = time.time()
    n = 0
    with engine.connect() as conn:
        expected = conn.execute(text("SELECT COUNT(*) FROM genes")).scalar()
        print(f"genes en la base: {expected:,}", flush=True)
        writer = pq.ParquetWriter(tmp, SCHEMA)
        for chunk in pd.read_sql(text(QUERY), conn, chunksize=CHUNK):
            chunk["operon_id"] = chunk["operon_id"].astype("Int64")
            for c in ("locus_tag", "gene_name"):
                chunk[c] = chunk[c].astype("string")
            writer.write_table(pa.Table.from_pandas(chunk, schema=SCHEMA, preserve_index=False))
            n += len(chunk)
            print(f"  {n:,} filas ({time.time() - t0:.0f} s)", flush=True)
        writer.close()

    if n != expected:
        tmp.unlink(missing_ok=True)
        raise SystemExit(f"ERROR: se exportaron {n:,} filas y la base tiene {expected:,}.")
    tmp.replace(OUT)

    # Registrar el archivo en el manifest de la caché
    manifest_path = OUT.parent / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    manifest.setdefault("tables", {})["genes_all"] = {
        "rows": n,
        "exported_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
    print(f"OK: {n:,} filas en {OUT} ({time.time() - t0:.0f} s)")


if __name__ == "__main__":
    main()
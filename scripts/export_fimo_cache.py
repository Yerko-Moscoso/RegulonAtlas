#!/usr/bin/env python
"""Exporta fimo_hits y transfer_map SOLO de los genomas validables (semana 12, línea base).

La línea base del pipeline propio (src/networks/atlas_baseline.py) es una red de prueba:
se construye y se valida solo en los genomas con regulones curados de RegPrecise (312),
no en todo el atlas. Exportar los 54,6 M hits completos no hace falta (decisión del
usuario, 19-10-2026).

Los genomas validables se calculan desde la caché con la misma proyección del gold
standard que la validación (src/validation/atlas.py), así que coinciden exactamente.
Las consultas usan los índices idx_fh_genome e idx_tm_genome, en lotes de genomas,
y se comparan con COUNT(*) por lote antes de aceptar el archivo.

Salidas en data/cache/atlas/:
    fimo_hits_validation.parquet    motif_id, genome_id, gene_id, hit_start, strand, score, neg_log10_p
    transfer_map_validation.parquet motif_id, genome_id, rule, tier
    validation_genomes.tsv          genome_id, accession de los genomas exportados

Uso (desde ~/proyecto; minutos, mejor con nohup):
    nohup make cache-fimo > logs/export_fimo_cache.log 2>&1 &
"""
import json
import time
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from sqlalchemy import bindparam, text

from src.database.connection import get_engine
from src.atlas_common import load
from src.validation.atlas import build_gold_regprecise

OUT = Path("data/cache/atlas")
BATCH = 10  # genomas por consulta

TABLES = {
    "fimo_hits_validation": {
        "sql": "SELECT motif_id, genome_id, gene_id, hit_start, strand, score, neg_log10_p "
               "FROM fimo_hits WHERE genome_id IN :ids",
        "count": "SELECT COUNT(*) FROM fimo_hits WHERE genome_id IN :ids",
        "schema": pa.schema([("motif_id", pa.int32()), ("genome_id", pa.int32()), ("gene_id", pa.int64()),
                             ("hit_start", pa.int32()), ("strand", pa.string()), ("score", pa.float32()),
                             ("neg_log10_p", pa.float32())]),
    },
    "transfer_map_validation": {
        "sql": "SELECT motif_id, genome_id, rule, tier FROM transfer_map WHERE genome_id IN :ids",
        "count": "SELECT COUNT(*) FROM transfer_map WHERE genome_id IN :ids",
        "schema": pa.schema([("motif_id", pa.int32()), ("genome_id", pa.int32()), ("rule", pa.string()),
                             ("tier", pa.string())]),
    },
}


def validable_genomes():
    genomes = load("genomes", ["genome_id", "accession", "ncbi_organism", "gtdb_family", "selection"])
    gold, _, _, stats = build_gold_regprecise(genomes)
    ids = sorted(int(g) for g in gold["genome_id"].unique())
    assert len(ids) == stats["validable_genomes"]
    return genomes[genomes["genome_id"].astype("int64").isin(ids)][["genome_id", "accession"]], ids


def export(conn, name, spec, ids, t0):
    path = OUT / f"{name}.parquet"
    tmp = path.with_suffix(".parquet.tmp")
    q = text(spec["sql"]).bindparams(bindparam("ids", expanding=True))
    c = text(spec["count"]).bindparams(bindparam("ids", expanding=True))
    schema = spec["schema"]
    writer = pq.ParquetWriter(tmp, schema)
    n = expected = 0
    for i in range(0, len(ids), BATCH):
        batch = ids[i:i + BATCH]
        expected += conn.execute(c, {"ids": batch}).scalar()
        df = pd.read_sql(q, conn, params={"ids": batch})
        for f in schema:
            df[f.name] = df[f.name].astype("string") if pa.types.is_string(f.type) else df[f.name]
        writer.write_table(pa.Table.from_pandas(df, schema=schema, preserve_index=False))
        n += len(df)
        print(f"  {name}: {min(i + BATCH, len(ids))}/{len(ids)} genomas, {n:,} filas "
              f"({time.time() - t0:.0f} s)", flush=True)
    writer.close()
    if n != expected:
        tmp.unlink(missing_ok=True)
        raise SystemExit(f"ERROR: {name}: se exportaron {n:,} filas y la base tiene {expected:,}.")
    tmp.replace(path)
    return n


def main():
    t0 = time.time()
    gtable, ids = validable_genomes()
    gtable.to_csv(OUT / "validation_genomes.tsv", sep="\t", index=False)
    print(f"Genomas validables: {len(ids)}", flush=True)
    engine = get_engine()
    rows = {}
    with engine.connect() as conn:
        for name, spec in TABLES.items():
            rows[name] = export(conn, name, spec, ids, t0)

    manifest_path = OUT / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    for name, n in rows.items():
        manifest.setdefault("tables", {})[name] = {"rows": n, "genomes": len(ids), "exported_at": now,
                                                   "scope": "validable genomes (RegPrecise gold)"}
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
    print(f"OK: {rows} ({time.time() - t0:.0f} s)")


if __name__ == "__main__":
    main()

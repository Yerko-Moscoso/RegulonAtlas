"""Endpoints de las redes reales del atlas, leídas desde data/cache/atlas (make cache-atlas)."""
import json
from functools import lru_cache
from pathlib import Path

import pandas as pd
from fastapi import APIRouter, HTTPException, Query

CACHE = Path(__file__).resolve().parents[3] / "data" / "cache" / "atlas"
router = APIRouter(prefix="/atlas", tags=["atlas"])


# ---------------------------------------------------------------- utilidades

@lru_cache
def _tabla(nombre: str) -> pd.DataFrame:
    """Carga un parquet una sola vez y lo mantiene en memoria."""
    ruta = CACHE / f"{nombre}.parquet"
    if not ruta.exists():
        raise HTTPException(503, f"Missing {ruta.name}; run 'make cache-atlas'.")
    return pd.read_parquet(ruta)


def _manifest() -> dict:
    """Lee manifest.json de la caché; si falta, 503 como _tabla (hallazgo H2, semana 14: antes respondía 500)."""
    ruta = CACHE / "manifest.json"
    if not ruta.exists():
        raise HTTPException(503, f"Missing {ruta.name}; run 'make cache-atlas'.")
    return json.loads(ruta.read_text())


def _json(df: pd.DataFrame) -> list[dict]:
    """DataFrame -> JSON seguro: NaN -> null, fechas ISO, tipos numpy -> nativos."""
    return json.loads(df.to_json(orient="records", date_format="iso", force_ascii=False))


def _v(x):
    """Valor escalar seguro para JSON (NaN -> None, numpy -> nativo)."""
    if pd.isna(x):
        return None
    return x.item() if hasattr(x, "item") else x


def _red(network_id: int) -> pd.Series:
    redes = _tabla("networks")
    fila = redes[redes.network_id == network_id]
    if fila.empty:
        raise HTTPException(404, f"Network {network_id} not found")
    return fila.iloc[0]


def _genoma(accession: str) -> pd.Series:
    genomas = _tabla("genomes")
    fila = genomas[genomas.accession == accession]
    if fila.empty:
        raise HTTPException(404, f"Genome {accession} not found")
    return fila.iloc[0]


@lru_cache
def _aristas_por_genoma(network_id: int) -> pd.DataFrame:
    """Número de filas de edges por genoma en una red (se calcula una vez)."""
    e = _tabla(f"edges_net{network_id}")
    return e.groupby("genome_id").size().rename("n_edges").reset_index()


# ----------------------------------------------------------------- endpoints

@router.get("/networks")
def listar_redes():
    """Las 5 redes materializadas, con sus parámetros y número de aristas."""
    manifest = _manifest()
    salida = []
    for r in _json(_tabla("networks")):
        if isinstance(r.get("params"), str):
            r["params"] = json.loads(r["params"])
        # "source" es una nota libre del pipeline externo sin definición verificable: solo se entregan los filtros
        r["params"].pop("source", None)
        r["n_edges"] = manifest["tablas"].get(f"edges_net{r['network_id']}")
        salida.append(r)
    return salida


@router.get("/networks/{network_id}/genomes")
def genomas_de_red(network_id: int):
    """Todos los genomas, con su número de aristas en la red (0 si no tiene), por nombre."""
    _red(network_id)
    genomas = _tabla("genomes")[["genome_id", "accession", "ncbi_organism",
                                 "selection", "gtdb_family"]]
    df = genomas.merge(_aristas_por_genoma(network_id), on="genome_id", how="left")
    df["n_edges"] = df.n_edges.fillna(0).astype(int)
    return _json(df.sort_values("ncbi_organism"))


@router.get("/networks/{network_id}/metrics")
def metricas(network_id: int, accession: str | None = None):
    """Métricas de network_metrics (pipeline externo) por genoma en una red."""
    _red(network_id)
    nm = _tabla("network_metrics")
    nm = nm[nm.network_id == network_id]
    genomas = _tabla("genomes")[["genome_id", "accession", "ncbi_organism",
                                 "gtdb_phylum", "gtdb_family", "gtdb_genus"]]
    df = nm.merge(genomas, on="genome_id", how="left")
    if accession:
        df = df[df.accession == accession]
    return _json(df)


@router.get("/networks/{network_id}/graph/{accession}")
def grafo(network_id: int, accession: str,
          min_confidence: float = Query(0.0, ge=0, le=1),
          max_edges: int = Query(500, ge=1, le=5000)):
    """Subgrafo TF -> operón de un genoma, en formato Cytoscape.

    Un TF puede tener varios motivos (PRODORIC y RegPrecise) y su nombre puede
    variar en mayúsculas entre fuentes, así que se agrupa por nombre normalizado
    y por operón, conservando la arista de mayor confidence.
    """
    red = _red(network_id)
    genoma = _genoma(accession)

    e = _tabla(f"edges_net{network_id}")
    e = e[e.genome_id == int(genoma.genome_id)]
    e = e.merge(_tabla("motifs")[["motif_id", "motif_key"]], on="motif_id", how="left")
    e = e.assign(tf_key=e.tf_name.str.casefold())

    ordenar = dict(by="confidence", ascending=False, na_position="last")
    total_pares = len(e.drop_duplicates(["tf_key", "target_operon"]))

    if min_confidence > 0:
        e = e[e.confidence.fillna(0) >= min_confidence]

    # Motivos de cada TF en este genoma (antes de colapsar aristas)
    motivos = e.groupby("tf_key").motif_key.apply(lambda s: sorted(s.dropna().unique().tolist()))

    pares = e.sort_values(**ordenar).drop_duplicates(["tf_key", "target_operon"])
    filtradas = len(pares)
    pares = pares.head(max_edges)

    nodos_tf = [
        {"data": {"id": f"tf:{r.tf_key}", "label": r.tf_name, "node_type": "TF",
                  "family": _v(r.tf_family), "motifs": motivos.get(r.tf_key, [])}}
        for r in pares.drop_duplicates("tf_key").itertuples()
    ]
    nodos_op = [
        {"data": {"id": f"op:{r.target_operon}",
                  "label": _v(r.best_gene_name) or r.best_locus,
                  "node_type": "Operon", "operon_label": r.operon_label,
                  "n_genes": int(r.n_genes), "lead_locus": r.best_locus}}
        for r in pares.drop_duplicates("target_operon").itertuples()
    ]
    aristas = [
        {"data": {"id": f"tf:{r.tf_key}->op:{r.target_operon}",
                  "source": f"tf:{r.tf_key}", "target": f"op:{r.target_operon}",
                  "weight": round(float(r.confidence), 4) if not pd.isna(r.confidence) else 0.0,
                  "neg_log10_p": round(float(r.best_neg_log10_p), 2),
                  "footprint": _v(r.footprint_enrichment), "tier": r.tier,
                  "n_sites": int(r.n_sites)}}
        for r in pares.itertuples()
    ]

    return {
        "network": red["name"],
        "network_id": network_id,
        "p_threshold": float(red.p_threshold),
        "tier_ceiling": red.tier_ceiling,
        "accession": accession,
        "organism": genoma.ncbi_organism,
        "min_confidence": min_confidence,
        "total_edges": total_pares,     # pares TF-operón del genoma en esta red
        "filtered_edges": filtradas,    # tras aplicar min_confidence
        "shown_edges": len(aristas),    # tras aplicar max_edges
        "elements": {"nodes": nodos_tf + nodos_op, "edges": aristas},
    }


@router.get("/provenance")
def procedencia():
    """Fuentes de datos (tabla provenance) y registro de la exportación a caché."""
    manifest = _manifest()
    return {"cache": manifest, "sources": _json(_tabla("provenance"))}
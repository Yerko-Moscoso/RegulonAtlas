from typing import List, Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text, bindparam
from src.database.connection import get_db
from src.database.models import Genome
from src.api.schemas.database_schemas import PaginatedGenomes, GenomeItem
from src.api.network_params import NETWORK_NEG_LOG10_P
from src.api.routers.metrics import _compute_topology, _cache

router = APIRouter(prefix="/genomes", tags=["Genomes"])

HUB_DEGREE_THRESHOLD = 20


def _expanding(sql: str, *names: str):
    return text(sql).bindparams(*(bindparam(n, expanding=True) for n in names))


def _genome_summaries(db: Session, accessions: List[str]) -> dict:
    """
    Ficha completa de cada genoma: taxonomía GTDB, tamaño, genes, operones,
    TF y aristas de la red (mismo cálculo y caché que /metrics/topology) e
    interacciones curadas. Pocas consultas agrupadas, no una por genoma.
    """
    key = lambda acc: ("genome_summary", acc)
    missing = [a for a in accessions if key(a) not in _cache]

    if missing:
        base = db.execute(
            _expanding("""
                SELECT genome_id, accession, ncbi_organism, gtdb_family, gtdb_genus,
                       gtdb_species, completeness, contamination, assembly_level, selection
                FROM genomes WHERE accession IN :accs
            """, "accs"),
            {"accs": missing},
        ).mappings().all()
        ids = [r["genome_id"] for r in base]

        genes, sizes, curated = {}, {}, {}
        if ids:
            genes = {
                r[0]: (int(r[1]), int(r[2]))
                for r in db.execute(
                    _expanding("""
                        SELECT genome_id, COUNT(*), COUNT(DISTINCT operon_id)
                        FROM genes WHERE genome_id IN :ids
                        GROUP BY genome_id
                    """, "ids"),
                    {"ids": ids},
                ).fetchall()
            }
            # No hay columna de tamaño: se aproxima con el fin del último gen
            # anotado en cada contig (subestima solo unos pocos kb).
            sizes = {
                r[0]: float(r[1])
                for r in db.execute(
                    _expanding("""
                        SELECT c.genome_id, SUM(c.max_end) FROM (
                            SELECT genome_id, contig, MAX(end_pos) AS max_end
                            FROM genes WHERE genome_id IN :ids
                            GROUP BY genome_id, contig
                        ) AS c GROUP BY c.genome_id
                    """, "ids"),
                    {"ids": ids},
                ).fetchall()
            }
            curated = {
                r[0]: int(r[1])
                for r in db.execute(
                    _expanding("""
                        SELECT rm.accession, COUNT(DISTINCT cr.tf_name, cr.locus_tag)
                        FROM curated_regulons cr
                        JOIN regprecise_genome_map rm ON cr.genome_name = rm.genome_name
                        WHERE rm.accession IN :accs
                        GROUP BY rm.accession
                    """, "accs"),
                    {"accs": missing},
                ).fetchall()
            }

        topo = _compute_topology(db, missing, NETWORK_NEG_LOG10_P, HUB_DEGREE_THRESHOLD)

        for r in base:
            acc, gid = r["accession"], r["genome_id"]
            n_genes, n_operons = genes.get(gid, (None, None))
            t = topo.get(acc)
            _cache[key(acc)] = {
                **dict(r),
                "genome_size_mb": round(sizes[gid] / 1e6, 2) if gid in sizes else None,
                "n_genes": n_genes,
                "n_operons": n_operons,
                "n_tfs": t["n_tfs"] if t else 0,
                "predicted_edges": t["aristas"] if t else 0,
                "curated_interactions": curated.get(acc, 0),
                "network_threshold": NETWORK_NEG_LOG10_P,
            }

    return {a: _cache[key(a)] for a in accessions if key(a) in _cache}


@router.get("/", response_model=PaginatedGenomes)
async def get_genomes(
    skip: int = Query(0, ge=0, description="Registros a omitir"),
    limit: int = Query(100, ge=0, le=5000, description="Límite de registros por página"),
    search: str = Query(None, description="Buscar por nombre de organismo o accession"),
    accessions: Optional[List[str]] = Query(
        None, description="Devuelve solo estos genomas, con su ficha completa"
    ),
    db: Session = Depends(get_db),
):
    """Lista los genomas del Atlas (solo lectura)."""
    if accessions:
        summaries = _genome_summaries(db, accessions)
        items = [summaries[a] for a in accessions if a in summaries]
        return {"total": len(items), "items": items}

    query = db.query(Genome)
    if search:
        term = f"%{search}%"
        query = query.filter(
            Genome.ncbi_organism.ilike(term) | Genome.accession.ilike(term)
        )
    total = query.count()
    rows = query.offset(skip).limit(limit).all()
    items = [
        {
            "genome_id": g.genome_id,
            "accession": g.accession,
            "ncbi_organism": g.ncbi_organism,
            "completeness": g.completeness,
            "contamination": g.contamination,
            "assembly_level": g.assembly_level,
        }
        for g in rows
    ]
    return {"total": total, "items": items}


@router.get("/{accession}", response_model=GenomeItem)
async def get_genome(accession: str, db: Session = Depends(get_db)):
    """Ficha completa de un genoma."""
    summaries = _genome_summaries(db, [accession])
    if accession not in summaries:
        raise HTTPException(status_code=404, detail=f"Genoma {accession} no encontrado.")
    return summaries[accession]
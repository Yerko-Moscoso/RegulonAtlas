#!/usr/bin/env python3
"""
build_transfer_map.py - Mapa de elegibilidad motivo -> genoma
(etapa "detección de ortólogos del TF" del pipeline, OE2).

Un hit de FIMO solo se considera parte de la red si el TF del motivo tiene
evidencia de estar presente en el genoma. Este script calcula esa evidencia
con reglas explícitas. Cada par (motivo, genoma) recibe la PRIMERA regla que
cumple, en este orden:

  source_genome  El genoma es el organismo de origen del motivo.
  ortholog       El genoma tiene un gen del mismo grupo ortólogo eggNOG (og)
                 que el TF en su organismo de origen y con el mismo nombre.
  ortholog_og    Mismo grupo ortólogo, nombre distinto o ausente (puede
                 incluir parálogos en familias grandes: LacI, MerR, ...).
  name_match     Mismo nombre de gen (gene_name o preferred_name), sin
                 evidencia de grupo ortólogo.

tier = distancia taxonómica GTDB al organismo de origen más cercano:
  same_genome, same_species, same_genus, same_family, same_order,
  same_class, same_phylum, cross_phylum, unknown (origen no resuelto).

Organismo de origen de cada motivo:
  RegPrecise  RG<n> se interpreta como el regulog n; sus genomas salen de
              curated_regulons + regprecise_genome_map.
  Resto       source_taxon contra regprecise_genome_map o ncbi_organism.

Entradas (MariaDB, SOLO LECTURA): motifs, genomes, genes, annotations,
curated_regulons, regprecise_genome_map.

Salidas:
  <out-dir>/transfer_map.tsv               motif_id, motif_key, tf_name,
                                           genome_id, accession, rule, tier
  <out-dir>/transfer_map.provenance.json   parámetros, conteos, controles
  Opcional: tabla MariaDB (--load-table), nunca sobre 'transfer_map'.

Uso (desde la raíz del proyecto):
  python -m src.pipeline.build_transfer_map --accessions-file config/mvp_genomes.txt
  python -m src.pipeline.build_transfer_map                      # todos los genomas
  python -m src.pipeline.build_transfer_map --accessions-file config/mvp_genomes.txt \\
         --load-table transfer_map_v2 --strict
"""
from __future__ import annotations

import argparse
import hashlib
import json
import logging
import re
import subprocess
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
from sqlalchemy import bindparam, text

from src.database.connection import get_engine

SCRIPT_VERSION = "2.0.0"
RULES = ["source_genome", "ortholog", "ortholog_og", "name_match"]
RANKS = [
    ("gtdb_species", "same_species"),
    ("gtdb_genus", "same_genus"),
    ("gtdb_family", "same_family"),
    ("gtdb_order", "same_order"),
    ("gtdb_class", "same_class"),
    ("gtdb_phylum", "same_phylum"),
]
REFERENCE_ACCESSION = "GCF_000005845.2"
PROTECTED_TABLES = {"transfer_map"}  # la tabla original no se sobrescribe
GENE_CHUNK = 100                     # genomas por consulta al cargar genes

# Palabras que no identifican un organismo al comparar nombres de taxón.
_TAXON_STOPWORDS = {"STR", "SUBSTR", "SUBSP", "SEROVAR", "SV", "STRAIN", "PV", "BV", "BIOVAR"}

log = logging.getLogger("build_transfer_map")


# ---------------------------------------------------------------------------
# Normalización
# ---------------------------------------------------------------------------
def norm_name(value) -> str:
    """Nombre de gen/TF comparable: mayúsculas, solo A-Z0-9 ('cueR' -> 'CUER')."""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    return re.sub(r"[^A-Z0-9]", "", str(value).upper())


def tf_aliases(tf_name) -> set[str]:
    """Separa nombres compuestos: 'GalR/GalS' -> {'GALR', 'GALS'}."""
    if tf_name is None or (isinstance(tf_name, float) and pd.isna(tf_name)):
        return set()
    parts = re.split(r"[/,;|]|\bAND\b", str(tf_name).upper())
    return {norm_name(p) for p in parts} - {""}


def taxon_tokens(name) -> set[str]:
    """'Escherichia coli str. K-12 substr. MG1655' -> {ESCHERICHIA, COLI, K12, MG1655}."""
    if not name or (isinstance(name, float) and pd.isna(name)):
        return set()
    raw = str(name).upper().replace("-", "")
    return {t for t in re.split(r"[^A-Z0-9]+", raw) if t and t not in _TAXON_STOPWORDS}


def expanding(sql: str, *names: str):
    return text(sql).bindparams(*(bindparam(n, expanding=True) for n in names))


# ---------------------------------------------------------------------------
# Carga de datos (solo lectura)
# ---------------------------------------------------------------------------
def load_genomes(engine) -> pd.DataFrame:
    cols = ", ".join(r for r, _ in RANKS)
    return pd.read_sql(
        text(f"SELECT genome_id, accession, ncbi_organism, {cols} FROM genomes"), engine
    )


def load_motifs(engine) -> pd.DataFrame:
    return pd.read_sql(
        text("SELECT motif_id, motif_key, source, tf_name, source_taxon FROM motifs ORDER BY motif_id"),
        engine,
    )


def load_regprecise_maps(engine):
    """regulog_id -> {accession} y genome_name de RegPrecise -> accession."""
    rows = pd.read_sql(
        text("""
            SELECT DISTINCT cr.regulog_id, rm.accession
            FROM curated_regulons cr
            JOIN regprecise_genome_map rm ON cr.genome_name = rm.genome_name
            WHERE rm.accession IS NOT NULL
        """),
        engine,
    )
    regulog_accs = defaultdict(set)
    for rid, acc in rows.itertuples(index=False):
        regulog_accs[int(rid)].add(acc)

    names = pd.read_sql(
        text("SELECT genome_name, accession FROM regprecise_genome_map WHERE accession IS NOT NULL"),
        engine,
    )
    return regulog_accs, dict(names.itertuples(index=False))


def load_reference_curated_tfs(engine, accession: str) -> set[str]:
    rows = pd.read_sql(
        text("""
            SELECT DISTINCT cr.tf_name
            FROM curated_regulons cr
            JOIN regprecise_genome_map rm ON cr.genome_name = rm.genome_name
            WHERE rm.accession = :acc
        """),
        engine,
        params={"acc": accession},
    )
    return set(rows["tf_name"])


def load_gene_indexes(engine, genome_ids: set[int], source_ids: set[int]):
    """
    Índices invertidos sobre los genes codificantes de los genomas pedidos:
      alias_idx[name]      -> genomas con un gen de ese nombre
      og_idx[og]           -> genomas con un gen de ese grupo ortólogo
      pair_idx[(og, name)] -> genomas con un gen de ese OG y ese nombre
      name_ogs[name]       -> OGs vistos para ese nombre (anclaje de respaldo)
    y, solo para genomas de origen, los pares (og, nombre) y nombres presentes.
    """
    alias_idx, og_idx, pair_idx = defaultdict(set), defaultdict(set), defaultdict(set)
    name_ogs = defaultdict(set)
    src_pairs, src_names = defaultdict(set), defaultdict(set)
    stats = Counter()

    sql = expanding(
        """
        SELECT g.genome_id, g.gene_name, ann.preferred_name, ann.og
        FROM genes g
        LEFT JOIN annotations ann ON ann.gene_id = g.gene_id
        WHERE g.genome_id IN :ids AND g.protein_id IS NOT NULL
        """,
        "ids",
    )
    ids = sorted(genome_ids)
    with engine.connect() as conn:
        for i in range(0, len(ids), GENE_CHUNK):
            part = ids[i : i + GENE_CHUNK]
            for gid, gene_name, pref, og in conn.execute(sql, {"ids": part}):
                stats["genes"] += 1
                og = og if og and og != "-" else None
                names = {norm_name(gene_name), norm_name(pref)} - {""}
                if og:
                    stats["genes_with_og"] += 1
                    og_idx[og].add(gid)
                if pref and pref != "-":
                    stats["genes_with_preferred_name"] += 1
                for n in names:
                    alias_idx[n].add(gid)
                    if og:
                        pair_idx[(og, n)].add(gid)
                        name_ogs[n].add(og)
                if gid in source_ids:
                    src_names[gid] |= names
                    if og:
                        src_pairs[gid] |= {(og, n) for n in names}
            log.info("Genes cargados: %s genomas de %s", min(i + GENE_CHUNK, len(ids)), len(ids))

    return alias_idx, og_idx, pair_idx, name_ogs, src_pairs, src_names, stats


# ---------------------------------------------------------------------------
# Organismo de origen de cada motivo
# ---------------------------------------------------------------------------
def build_source_resolver(genomes: pd.DataFrame, regulog_accs, rp_name_acc):
    genome_tokens = [
        (acc, taxon_tokens(org)) for acc, org in genomes[["accession", "ncbi_organism"]].itertuples(index=False)
    ]
    cache: dict[str, set[str]] = {}

    def by_taxon(source_taxon) -> set[str]:
        if not source_taxon or (isinstance(source_taxon, float) and pd.isna(source_taxon)):
            return set()
        if source_taxon in cache:
            return cache[source_taxon]
        if source_taxon in rp_name_acc:
            found = {rp_name_acc[source_taxon]}
        else:
            toks = taxon_tokens(source_taxon)
            # Se exige al menos género + especie para no asociar por un solo token.
            found = {acc for acc, gt in genome_tokens if len(toks) >= 2 and toks <= gt}
        cache[source_taxon] = found
        return found

    def resolve(motif_key: str, source: str, source_taxon) -> tuple[set[str], str]:
        if str(source).lower() == "regprecise":
            m = re.match(r"^RG_?(\d+)$", str(motif_key))
            if m and int(m.group(1)) in regulog_accs:
                return set(regulog_accs[int(m.group(1))]), "regulog"
        found = by_taxon(source_taxon)
        return (found, "source_taxon") if found else (set(), "unresolved")

    return resolve


# ---------------------------------------------------------------------------
# Cálculo del mapa
# ---------------------------------------------------------------------------
def compute_transfer_map(motifs, genomes, targets, motif_sources, idx, ranks, gid2acc):
    alias_idx, og_idx, pair_idx, name_ogs, src_pairs, src_names, _ = idx
    rows = []
    diag = Counter()
    tf_not_in_source = []

    for m in motifs.itertuples(index=False):
        aliases = tf_aliases(m.tf_name)
        if not aliases:
            diag["motifs_without_tf_name"] += 1
            continue
        sources = motif_sources[m.motif_id]

        # OG del TF en su(s) organismo(s) de origen.
        src_ogs = {og for s in sources for (og, n) in src_pairs.get(s, ()) if n in aliases}
        if sources and not any(aliases & src_names.get(s, set()) for s in sources):
            diag["motifs_tf_not_found_in_source"] += 1
            if len(tf_not_in_source) < 30:
                tf_not_in_source.append(
                    {"motif_key": m.motif_key, "tf_name": m.tf_name, "source_taxon": m.source_taxon}
                )
        # Respaldo: si el TF no tiene OG en su origen, OGs de genes homónimos.
        anchor_ogs = src_ogs or {og for a in aliases for og in name_ogs.get(a, ())}
        diag["anchor_" + ("source" if src_ogs else "name" if anchor_ogs else "none")] += 1

        g_ortholog = set().union(*(pair_idx.get((og, a), set()) for og in anchor_ogs for a in aliases)) if anchor_ogs else set()
        g_og = set().union(*(og_idx.get(og, set()) for og in src_ogs)) if src_ogs else set()
        g_name = set().union(*(alias_idx.get(a, set()) for a in aliases))

        src_rank_values = {
            rank: {ranks[s][rank] for s in sources if s in ranks and ranks[s][rank]} for rank, _ in RANKS
        }

        def tier(t: int) -> str:
            if not sources:
                return "unknown"
            if t in sources:
                return "same_genome"
            for rank, label in RANKS:
                if ranks[t][rank] and ranks[t][rank] in src_rank_values[rank]:
                    return label
            return "cross_phylum"

        candidates = (sources | g_ortholog | g_og | g_name) & targets
        for t in candidates:
            if t in sources:
                rule = "source_genome"
            elif t in g_ortholog:
                rule = "ortholog"
            elif t in g_og:
                rule = "ortholog_og"
            else:
                rule = "name_match"
            rows.append((m.motif_id, m.motif_key, m.tf_name, t, gid2acc[t], rule, tier(t)))

    df = pd.DataFrame(
        rows, columns=["motif_id", "motif_key", "tf_name", "genome_id", "accession", "rule", "tier"]
    ).sort_values(["motif_id", "genome_id"], kind="mergesort", ignore_index=True)
    return df, diag, tf_not_in_source


# ---------------------------------------------------------------------------
# Controles de calidad y procedencia
# ---------------------------------------------------------------------------
def reference_check(df: pd.DataFrame, curated_tfs: set[str], ref_gid: int, rules: list[str]) -> list[str]:
    """TF curados del genoma de referencia sin ningún motivo elegible (con las reglas dadas)."""
    eligible = df[(df["genome_id"] == ref_gid) & (df["rule"].isin(rules))]
    covered = set().union(*(tf_aliases(t) for t in eligible["tf_name"])) if len(eligible) else set()
    return sorted(t for t in curated_tfs if not (tf_aliases(t) & covered))


def git_info() -> dict:
    def run(*cmd):
        try:
            return subprocess.run(cmd, capture_output=True, text=True, check=True).stdout.strip()
        except Exception:
            return None

    return {"commit": run("git", "rev-parse", "HEAD"), "dirty": bool(run("git", "status", "--porcelain"))}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def load_table(engine, df: pd.DataFrame, table: str, force: bool) -> None:
    if table in PROTECTED_TABLES and not force:
        raise SystemExit(f"'{table}' es la tabla original; usa otro nombre o --force.")
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", table):
        raise SystemExit(f"Nombre de tabla inválido: {table}")
    out = df[["motif_id", "genome_id", "rule", "tier"]]
    log.info("Cargando %s filas en %s ...", f"{len(out):,}", table)
    out.to_sql(table, engine, if_exists="replace", index=False, chunksize=50_000)
    with engine.begin() as conn:
        conn.execute(text(f"ALTER TABLE {table} ADD PRIMARY KEY (motif_id, genome_id)"))
        conn.execute(text(f"CREATE INDEX idx_{table}_genome ON {table} (genome_id)"))


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def parse_args(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--accessions-file", type=Path,
                   help="Genomas objetivo, un accession por línea (# = comentario). Por defecto: todos.")
    p.add_argument("--out-dir", type=Path, default=Path("data/processed/transfer_map"))
    p.add_argument("--load-table", help="Además, cargar el resultado en esta tabla de MariaDB.")
    p.add_argument("--force", action="store_true", help="Permite --load-table transfer_map.")
    p.add_argument("--reference", default=REFERENCE_ACCESSION,
                   help="Genoma de referencia para el control de TF curados.")
    p.add_argument("--check-rules", default="source_genome,ortholog",
                   help="Reglas que la red usará; el control de referencia se evalúa con ellas.")
    p.add_argument("--strict", action="store_true",
                   help="Termina con error si algún TF curado de la referencia queda sin motivo elegible.")
    p.add_argument("--dry-run", action="store_true", help="Calcula y reporta, sin escribir archivos.")
    return p.parse_args(argv)


def read_accessions(path: Path) -> list[str]:
    lines = [l.split("#", 1)[0].strip() for l in path.read_text().splitlines()]
    return [l for l in lines if l]


def main(argv=None) -> int:
    args = parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    started = datetime.now(timezone.utc)
    engine = get_engine()

    genomes = load_genomes(engine)
    motifs = load_motifs(engine)
    regulog_accs, rp_name_acc = load_regprecise_maps(engine)
    acc2gid = dict(zip(genomes["accession"], genomes["genome_id"]))
    gid2acc = {v: k for k, v in acc2gid.items()}
    log.info("Genomas en la base: %s | motivos: %s", f"{len(genomes):,}", f"{len(motifs):,}")

    if args.accessions_file:
        wanted = read_accessions(args.accessions_file)
        unknown = [a for a in wanted if a not in acc2gid]
        if unknown:
            log.error("Accessions que no están en genomes: %s", unknown)
            return 2
        targets = {acc2gid[a] for a in wanted}
    else:
        targets = set(gid2acc)
    log.info("Genomas objetivo: %s", len(targets))

    resolve = build_source_resolver(genomes, regulog_accs, rp_name_acc)
    motif_sources, resolution = {}, Counter()
    for m in motifs.itertuples(index=False):
        accs, method = resolve(m.motif_key, m.source, m.source_taxon)
        motif_sources[m.motif_id] = {acc2gid[a] for a in accs if a in acc2gid}
        resolution[f"{m.source}:{method}"] += 1
    source_ids = set().union(*motif_sources.values())
    log.info("Resolución del origen de los motivos: %s", dict(resolution))

    idx = load_gene_indexes(engine, targets | source_ids, source_ids)
    ranks = genomes.set_index("genome_id")[[r for r, _ in RANKS]].to_dict("index")

    df, diag, tf_not_in_source = compute_transfer_map(
        motifs, genomes, targets, motif_sources, idx, ranks, gid2acc
    )

    check_rules = [r.strip() for r in args.check_rules.split(",") if r.strip()]
    ref_missing = None
    if args.reference in acc2gid and acc2gid[args.reference] in targets:
        curated = load_reference_curated_tfs(engine, args.reference)
        ref_missing = reference_check(df, curated, acc2gid[args.reference], check_rules)

    summary = {
        "pairs": int(len(df)),
        "by_rule": {r: int(n) for r, n in df["rule"].value_counts().reindex(RULES, fill_value=0).items()},
        "by_tier": {t: int(n) for t, n in df["tier"].value_counts().items()},
    }
    log.info("Pares elegibles: %s", f"{summary['pairs']:,}")
    log.info("Por regla: %s", summary["by_rule"])
    log.info("Por tier: %s", summary["by_tier"])
    log.info("Diagnóstico: %s", dict(diag))
    if ref_missing is not None:
        if ref_missing:
            log.warning("TF curados de %s SIN motivo elegible (%s): %s",
                        args.reference, ",".join(check_rules), ref_missing)
        else:
            log.info("Control de referencia OK: todos los TF curados de %s tienen motivo elegible.",
                     args.reference)

    if args.dry_run:
        log.info("--dry-run: no se escriben archivos.")
        return 1 if (args.strict and ref_missing) else 0

    args.out_dir.mkdir(parents=True, exist_ok=True)
    tsv = args.out_dir / "transfer_map.tsv"
    df.to_csv(tsv, sep="\t", index=False)

    provenance = {
        "script": "src/pipeline/build_transfer_map.py",
        "script_version": SCRIPT_VERSION,
        "git": git_info(),
        "started_utc": started.isoformat(),
        "finished_utc": datetime.now(timezone.utc).isoformat(),
        "arguments": {k: (str(v) if isinstance(v, Path) else v) for k, v in vars(args).items()},
        "target_accessions": sorted(gid2acc[t] for t in targets) if args.accessions_file else "all",
        "inputs": {
            "database_tables": ["motifs", "genomes", "genes", "annotations",
                                "curated_regulons", "regprecise_genome_map"],
            "genomes_in_db": int(len(genomes)),
            "motifs": int(len(motifs)),
            "genes_loaded": dict(idx[-1]),
        },
        "rules_priority": RULES,
        "source_resolution": dict(resolution),
        "diagnostics": dict(diag),
        "motifs_tf_not_found_in_source_examples": tf_not_in_source,
        "reference_check": {
            "reference": args.reference,
            "rules": check_rules,
            "curated_tfs_without_eligible_motif": ref_missing,
        },
        "summary": summary,
        "output": {"file": str(tsv), "sha256": sha256(tsv)},
    }
    prov_path = args.out_dir / "transfer_map.provenance.json"
    prov_path.write_text(json.dumps(provenance, indent=2, ensure_ascii=False, default=str))
    log.info("Escrito: %s", tsv)
    log.info("Escrito: %s", prov_path)

    if args.load_table:
        load_table(engine, df, args.load_table, args.force)
        log.info("Tabla %s cargada.", args.load_table)

    return 1 if (args.strict and ref_missing) else 0


if __name__ == "__main__":
    sys.exit(main())
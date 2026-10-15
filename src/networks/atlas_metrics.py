#!/usr/bin/env python
"""Métricas topológicas propias de las 5 redes del atlas (semana 11, OE4).

Reemplaza a network_metrics (externo, no reproducible desde edges) por métricas
calculadas con una definición de grafo documentada. Lee solo la caché
data/cache/atlas/ y escribe en data/results/metrics/.

Definición del grafo (igual que la validación y la API):
  - Nodos TF: nombre normalizado (minúsculas). Varios motivos del mismo TF son un nodo.
  - Nodos diana: operones (las aristas apuntan a operones, D10).
  - Arista: un par (TF, operón) por genoma; se conserva la de mayor confidence.
  - Grafo dirigido bipartito TF -> operón, uno por (red, genoma).

Métricas jerárquicas (n_tf_tf_edges, n_autoreg): solo se pueden aproximar
ubicando el gen del TF por nombre (genes.gene_name), lo que funciona en ~20 % de
los TF. Se informan como cota inferior junto a tf_resolved_rate y NO deben usarse
para comparar genomas.

Uso (desde ~/proyecto):
    PYTHONPATH=. python src/networks/atlas_metrics.py
"""
import argparse
import json
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import networkx as nx
import numpy as np
import pandas as pd
import pyarrow.parquet as pq

CACHE = Path("data/cache/atlas")
OUT_DEFAULT = Path("data/results/metrics")
NETWORKS = {1: "validated", 2: "high-precision", 3: "balanced", 4: "permissive", 5: "no-footprint"}
KEY = ["genome_id", "tf", "operon_id"]
ATLAS_SELECTIONS = {"representative", "forced", "replacement"}

METRIC_GROUPS = {
    "size": ["n_tf", "n_targets", "n_edges", "n_target_genes"],
    "normalized": ["density", "edges_per_tf", "frac_multi_reg", "frac_genome_targeted", "frac_largest"],
    "degree": ["mean_out_degree", "median_out_degree", "max_out_degree", "mean_in_degree",
               "max_in_degree", "out_degree_entropy", "out_degree_gini", "hub_share"],
    "structure": ["n_components"],
    "name_resolved_lower_bound": ["tf_resolved_rate", "n_tf_tf_edges", "n_autoreg"],
}
EXTERNAL_COMPARABLE = ["n_tf", "n_targets", "n_edges", "density"]


# ---------------------------------------------------------------- utilidades
def load(name, cols=None):
    path = CACHE / f"{name}.parquet"
    if not path.exists():
        hint = "scripts/export_genes_cache.py" if name == "genes_all" else "make cache-atlas"
        sys.exit(f"Falta {path}. Ejecuta {hint} primero.")
    if cols:
        have = set(pq.read_schema(path).names)
        missing = [c for c in cols if c not in have]
        if missing:
            sys.exit(f"{path.name}: faltan columnas {missing}. Disponibles: {sorted(have)}")
    return pd.read_parquet(path, columns=cols)


def norm(s):
    return s.astype("string").str.strip().str.lower().replace("", pd.NA)


def git_commit():
    try:
        out = subprocess.run(["git", "rev-parse", "--short", "HEAD"],
                             capture_output=True, text=True, check=True)
        return out.stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return None


def git_dirty():
    """True si hay archivos versionados con cambios sin commit: en ese caso git_commit
    no describe el código que generó los resultados."""
    try:
        out = subprocess.run(["git", "status", "--porcelain", "--untracked-files=no"],
                             capture_output=True, text=True, check=True)
        return bool(out.stdout.strip())
    except (OSError, subprocess.CalledProcessError):
        return None


def norm_entropy(values):
    """Entropía de Shannon de la distribución de grado, normalizada a [0, 1]."""
    v = np.asarray(values, dtype=float)
    v = v[v > 0]
    if len(v) < 2:
        return float("nan")
    p = v / v.sum()
    return float(-(p * np.log(p)).sum() / np.log(len(v)))


def gini(values):
    v = np.sort(np.asarray(values, dtype=float))
    n = len(v)
    if n < 2 or v.sum() == 0:
        return float("nan")
    i = np.arange(1, n + 1)
    return float((2 * (i * v).sum()) / (n * v.sum()) - (n + 1) / n)


# ---------------------------------------------------------------- datos
def load_pairs(net_id):
    e = load(f"edges_net{net_id}", ["genome_id", "tf_name", "target_operon", "confidence"])
    e = e.rename(columns={"target_operon": "operon_id"})
    e["genome_id"] = e["genome_id"].astype("int64")
    e["operon_id"] = e["operon_id"].astype("int64")
    e["tf"] = norm(e["tf_name"])
    e = e.dropna(subset=["tf"]).sort_values("confidence", ascending=False, kind="mergesort")
    return e.drop_duplicates(KEY)[KEY].reset_index(drop=True), len(e)


def load_genes():
    g = load("genes_all", ["genome_id", "gene_name", "operon_id"])
    g["genome_id"] = g["genome_id"].astype("int64")
    genes_per_genome = g.groupby("genome_id").size()
    op = g.dropna(subset=["operon_id"])
    operon_size = op.groupby(op["operon_id"].astype("int64")).size()
    named = op.assign(tf=norm(op["gene_name"]), tf_operon=op["operon_id"].astype("int64"))
    named = named.dropna(subset=["tf"])[["genome_id", "tf", "tf_operon"]].drop_duplicates()
    return genes_per_genome, operon_size, named


# ---------------------------------------------------------------- métricas
def genome_metrics(p, n_genes, operon_size, tf_ops):
    """p: pares (tf, operon_id) de un genoma. tf_ops: dict tf -> set de operones (por nombre)."""
    G = nx.DiGraph()
    G.add_edges_from(zip("TF:" + p["tf"].astype(str), p["operon_id"]))
    tf_nodes = [n for n in G if isinstance(n, str)]
    op_nodes = [n for n in G if not isinstance(n, str)]
    out_deg = np.array([G.out_degree(n) for n in tf_nodes])
    in_deg = np.array([G.in_degree(n) for n in op_nodes])
    n_tf, n_t, n_e = len(tf_nodes), len(op_nodes), G.number_of_edges()

    wcc = [len(c) for c in nx.weakly_connected_components(G)]
    target_genes = int(operon_size.reindex(op_nodes).fillna(0).sum())

    # Cota inferior por nombre de gen
    tf_set = set(p["tf"])
    resolved = {t: tf_ops[t] for t in tf_set if t in tf_ops}
    tf_operons = set().union(*resolved.values()) if resolved else set()
    n_tf_tf = int(p["operon_id"].isin(tf_operons).sum())
    n_autoreg = int(sum(op in resolved.get(t, ()) for t, op in zip(p["tf"], p["operon_id"])))

    return {
        "n_tf": n_tf,
        "n_targets": n_t,
        "n_edges": n_e,
        "n_target_genes": target_genes,
        "density": n_e / (n_tf * n_t),
        "edges_per_tf": n_e / n_tf,
        "frac_multi_reg": float((in_deg >= 2).mean()),
        "frac_genome_targeted": target_genes / n_genes if n_genes else float("nan"),
        "frac_largest": max(wcc) / G.number_of_nodes(),
        "mean_out_degree": float(out_deg.mean()),
        "median_out_degree": float(np.median(out_deg)),
        "max_out_degree": int(out_deg.max()),
        "mean_in_degree": float(in_deg.mean()),
        "max_in_degree": int(in_deg.max()),
        "out_degree_entropy": norm_entropy(out_deg),
        "out_degree_gini": gini(out_deg),
        "hub_share": float(out_deg.max() / n_e),
        "n_components": len(wcc),
        "tf_resolved_rate": len(resolved) / n_tf,
        "n_tf_tf_edges": n_tf_tf,
        "n_autoreg": n_autoreg,
    }


def network_metrics(net_id, genomes, genes_per_genome, operon_size, named):
    pairs, n_raw = load_pairs(net_id)
    gtf = pairs[["genome_id", "tf"]].drop_duplicates().merge(named, on=["genome_id", "tf"])
    tf_ops_by_genome = {
        gid: df.groupby("tf")["tf_operon"].agg(set).to_dict() for gid, df in gtf.groupby("genome_id")
    }
    rows = []
    t0 = time.time()
    groups = pairs.groupby("genome_id")
    for i, (gid, p) in enumerate(groups, 1):
        m = genome_metrics(p, int(genes_per_genome.get(gid, 0)), operon_size,
                           tf_ops_by_genome.get(gid, {}))
        rows.append({"network_id": net_id, "genome_id": gid, **m})
        if i % 500 == 0:
            print(f"    {i:,}/{groups.ngroups:,} genomas ({time.time() - t0:.0f} s)", flush=True)

    df = pd.DataFrame(rows)
    # Todos los genomas, con 0 aristas si no aparecen en la red
    full = genomes[["genome_id"]].merge(df, on="genome_id", how="left")
    full["network_id"] = net_id
    for c in ("n_tf", "n_targets", "n_edges", "n_target_genes"):
        full[c] = full[c].fillna(0).astype("int64")
    full.insert(2, "has_edges", full["n_edges"] > 0)
    full["n_genes"] = full["genome_id"].map(genes_per_genome).fillna(0).astype("int64")
    print(f"  {NETWORKS[net_id]}: {len(pairs):,} pares TF-operón ({n_raw:,} aristas), "
          f"{int(full['has_edges'].sum()):,} genomas con aristas ({time.time() - t0:.0f} s)")
    return full


def compare_external(own):
    ext = load("network_metrics")
    cols = [c for c in EXTERNAL_COMPARABLE if c in ext.columns]
    ext = ext[["network_id", "genome_id"] + cols]
    m = own[own["has_edges"]].merge(ext, on=["network_id", "genome_id"], suffixes=("_own", "_ext"))
    rows = []
    for net_id, g in m.groupby("network_id"):
        for c in cols:
            a, b = g[f"{c}_own"].astype(float), g[f"{c}_ext"].astype(float)
            ok = a.notna() & b.notna() & (b != 0)
            rows.append({
                "network_id": net_id, "network": NETWORKS[net_id], "metric": c,
                "genomes_compared": int(ok.sum()),
                "median_ratio_own_ext": float((a[ok] / b[ok]).median()) if ok.any() else None,
                "spearman": float(a[ok].rank().corr(b[ok].rank())) if ok.sum() > 2 else None,
                "exact_match_rate": float((a[ok] == b[ok]).mean()) if ok.any() else None,
            })
    return pd.DataFrame(rows)


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description="Métricas topológicas propias del atlas")
    ap.add_argument("--networks", type=int, nargs="+", default=list(NETWORKS))
    ap.add_argument("--out", type=Path, default=OUT_DEFAULT)
    args = ap.parse_args()
    dirty = git_dirty()
    if dirty:
        print("AVISO: hay cambios sin commit; el manifest registrará git_dirty=true. "
              "Haz commit y vuelve a ejecutar para que los resultados sean trazables.")
    args.out.mkdir(parents=True, exist_ok=True)

    genomes = load("genomes", ["genome_id", "accession", "ncbi_organism", "selection",
                               "gtdb_phylum", "gtdb_class", "gtdb_order", "gtdb_family", "gtdb_genus"])
    genomes["genome_id"] = genomes["genome_id"].astype("int64")
    print("Cargando genes…")
    genes_per_genome, operon_size, named = load_genes()

    frames = []
    for net_id in args.networks:
        print(f"Red {net_id} ({NETWORKS[net_id]})")
        frames.append(network_metrics(net_id, genomes, genes_per_genome, operon_size, named))
    own = pd.concat(frames, ignore_index=True)
    own.insert(1, "network", own["network_id"].map(NETWORKS))
    own = own.merge(genomes, on="genome_id", how="left")
    # selection puede llevar una nota tras la categoría, p. ej.
    # "replacement (GCF_050942165.1 suppressed in RefSeq 2026)": se compara la primera palabra.
    own["in_atlas"] = own["selection"].str.split().str[0].isin(ATLAS_SELECTIONS)

    own.to_csv(args.out / "atlas_metrics.tsv", sep="\t", index=False)
    own.to_parquet(args.out / "atlas_metrics.parquet", index=False)

    comp = compare_external(own)
    comp.to_csv(args.out / "metrics_vs_external.tsv", sep="\t", index=False)
    print("\n== Propias vs network_metrics (genomas con aristas en ambas) ==")
    print(comp.to_string(index=False, float_format=lambda x: f"{x:.3f}"))

    print("\n== Medianas en el atlas (genomas con aristas) ==")
    show = ["n_tf", "n_targets", "n_edges", "density", "frac_multi_reg",
            "frac_genome_targeted", "out_degree_gini", "tf_resolved_rate"]
    atlas = own[own["in_atlas"] & own["has_edges"]]
    print(atlas.groupby("network")[show].median().to_string(float_format=lambda x: f"{x:.3f}"))

    ecoli = own[(own["accession"] == "GCF_000005845.2") & (own["network_id"] == 3)]
    if len(ecoli):
        print("\nE. coli K-12, balanced:")
        print(ecoli[["n_tf", "n_targets", "n_edges", "density", "frac_multi_reg",
                     "n_components", "tf_resolved_rate", "n_tf_tf_edges", "n_autoreg"]].to_string(index=False))

    cache_manifest = CACHE / "manifest.json"
    manifest = {
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "git_commit": git_commit(),
        "git_dirty": dirty,
        "cache_manifest": json.loads(cache_manifest.read_text()) if cache_manifest.exists() else None,
        "graph_definition": {
            "nodes": "TF (normalized name) and operon",
            "edges": "one per (genome, TF, operon); max confidence kept",
            "type": "directed bipartite TF -> operon, one graph per (network, genome)",
            "components": "weakly connected components (NetworkX)",
            "density": "n_edges / (n_tf * n_targets)",
            "out_degree_entropy": "Shannon entropy of TF out-degrees normalized by log(n_tf)",
            "hub_share": "edges of the TF with the highest out-degree / n_edges",
            "frac_genome_targeted": "genes in target operons / genes in the genome",
            "name_resolved_lower_bound": "TF genes located by gene_name (~20 % of TFs); "
                                         "not used for comparisons between genomes",
        },
        "metric_groups": METRIC_GROUPS,
        "networks": args.networks,
        "files": ["atlas_metrics.tsv", "atlas_metrics.parquet", "metrics_vs_external.tsv"],
    }
    (args.out / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
    print(f"\nResultados en {args.out}/")


if __name__ == "__main__":
    main()
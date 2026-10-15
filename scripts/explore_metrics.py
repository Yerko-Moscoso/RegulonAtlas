#!/usr/bin/env python
"""Exploración previa de las métricas propias (semana 11).

Responde dos preguntas antes de escribir el módulo de métricas:
  1. ¿Cuántos TF de cada red se pueden ubicar en su genoma emparejando el nombre
     del TF con genes.gene_name? Eso decide si se pueden calcular métricas
     jerárquicas (autorregulación, FFL, cascadas), que necesitan aristas TF -> TF.
  2. ¿Qué definición de grafo reproduce network_metrics? Se prueba con E. coli
     K-12 en balanced (network_metrics: 68 TF, 310 dianas, 919 aristas).

Uso (desde ~/proyecto, después de scripts/export_genes_cache.py):
    PYTHONPATH=. python scripts/explore_metrics.py
Salidas:
    data/audit/metrics_tf_resolution.tsv      (resolución de TF por red y genoma)
    data/audit/metrics_definition_test.tsv    (definiciones candidatas vs network_metrics)
"""
import sys
from pathlib import Path

import pandas as pd
import pyarrow.parquet as pq

CACHE = Path("data/cache/atlas")
OUT = Path("data/audit")
NETWORKS = {1: "validated", 2: "high-precision", 3: "balanced", 4: "permissive", 5: "no-footprint"}
TEST_GENOMES = ["GCF_000005845.2", "GCF_000006945.2", "GCF_000009045.1", "GCF_000006765.1"]
KEY = ["genome_id", "tf", "operon_id"]


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


def load_pairs(net_id):
    e = load(f"edges_net{net_id}", ["genome_id", "tf_name", "target_operon", "confidence"])
    e = e.rename(columns={"target_operon": "operon_id"})
    e["tf"] = norm(e["tf_name"])
    e = e.sort_values("confidence", ascending=False, kind="mergesort")
    return e.drop_duplicates(KEY)[KEY].reset_index(drop=True), len(e)


def tf_genes(genes):
    """(genome_id, tf) -> operones que contienen un gen con ese nombre."""
    g = genes.dropna(subset=["name"])
    return g.rename(columns={"name": "tf", "operon_id": "tf_operon"})[["genome_id", "tf", "tf_operon", "gene_id"]]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    genomes = load("genomes", ["genome_id", "accession", "ncbi_organism", "selection"])
    genes = load("genes_all", ["gene_id", "genome_id", "gene_name", "operon_id"])
    genes["name"] = norm(genes["gene_name"])
    print(f"genes: {len(genes):,} ({genes['name'].notna().mean():.1%} con gene_name)")
    tfg = tf_genes(genes)
    metrics = load("network_metrics")

    # ------------------------------------------------ 1. resolución de TF por nombre
    res_rows = []
    print("\n== TF ubicables en su genoma por nombre de gen ==")
    print(f"{'red':15s} {'(genoma,TF)':>12s} {'1 gen':>8s} {'>1 gen':>8s} {'sin gen':>8s}"
          f" {'pares TF->TF':>13s}")
    for net_id, name in NETWORKS.items():
        pairs, _ = load_pairs(net_id)
        gtf = pairs[["genome_id", "tf"]].drop_duplicates()
        hits = gtf.merge(tfg, on=["genome_id", "tf"], how="left")
        n_genes = hits.groupby(["genome_id", "tf"])["gene_id"].nunique()
        one, many, none = (n_genes == 1).sum(), (n_genes > 1).sum(), (n_genes == 0).sum()
        # Aristas TF -> TF posibles: el operón diana contiene el gen de algún TF de la red
        tf_ops = hits.dropna(subset=["tf_operon"])[["genome_id", "tf_operon"]].drop_duplicates()
        tf_ops["tf_operon"] = tf_ops["tf_operon"].astype("int64")
        tt = pairs.merge(tf_ops.rename(columns={"tf_operon": "operon_id"}), on=["genome_id", "operon_id"])
        print(f"{name:15s} {len(gtf):12,} {one / len(gtf):8.1%} {many / len(gtf):8.1%} "
              f"{none / len(gtf):8.1%} {len(tt):13,}")
        per_g = n_genes.gt(0).groupby("genome_id").mean().rename("tf_resolved_rate").reset_index()
        per_g.insert(0, "network_id", net_id)
        res_rows.append(per_g)
    res = pd.concat(res_rows).merge(genomes, on="genome_id", how="left")
    res.to_csv(OUT / "metrics_tf_resolution.tsv", sep="\t", index=False)
    atlas = res[res["selection"].str.split().str[0].isin(["representative", "forced", "replacement"])]
    print("\nMediana de TF ubicables por genoma del atlas:")
    print(atlas.groupby("network_id")["tf_resolved_rate"].median().rename(index=NETWORKS).to_string())

    # ------------------------------------------------ 2. ¿qué definición reproduce network_metrics?
    print("\n== Definiciones candidatas vs network_metrics (balanced) ==")
    pairs, _ = load_pairs(3)
    edges_raw = load("edges_net3", ["genome_id", "tf_name", "motif_id", "target_operon", "best_gene_id"])
    op_genes = genes[["genome_id", "operon_id", "gene_id"]].dropna(subset=["operon_id"])
    op_genes["operon_id"] = op_genes["operon_id"].astype("int64")
    rows = []
    for acc in TEST_GENOMES:
        gid = genomes.loc[genomes["accession"] == acc, "genome_id"]
        if gid.empty:
            continue
        gid = int(gid.iloc[0])
        p = pairs[pairs["genome_id"] == gid]
        raw = edges_raw[edges_raw["genome_id"] == gid]
        resolved = set(tfg.loc[tfg["genome_id"] == gid, "tf"]) & set(p["tf"])
        p_res = p[p["tf"].isin(resolved)]
        gene_edges = p.merge(op_genes[op_genes["genome_id"] == gid], on=["genome_id", "operon_id"])
        gene_edges_res = gene_edges[gene_edges["tf"].isin(resolved)]
        best_gene = raw.assign(tf=norm(raw["tf_name"])).drop_duplicates(["tf", "best_gene_id"])
        nm = metrics[(metrics["network_id"] == 3) & (metrics["genome_id"] == gid)]
        candidates = {
            "network_metrics (externo)": (nm["n_tf"].sum(), nm["n_targets"].sum(), nm["n_edges"].sum())
            if len(nm) else (None, None, None),
            "edges crudas (filas)": (raw["tf_name"].nunique(), raw["target_operon"].nunique(), len(raw)),
            "TF->operón (propio)": (p["tf"].nunique(), p["operon_id"].nunique(), len(p)),
            "TF->operón, TF ubicados": (p_res["tf"].nunique(), p_res["operon_id"].nunique(), len(p_res)),
            "TF->gen (operón expandido)": (gene_edges["tf"].nunique(), gene_edges["gene_id"].nunique(),
                                           len(gene_edges)),
            "TF->gen, TF ubicados": (gene_edges_res["tf"].nunique(), gene_edges_res["gene_id"].nunique(),
                                     len(gene_edges_res)),
            "TF->mejor gen": (best_gene["tf"].nunique(), best_gene["best_gene_id"].nunique(), len(best_gene)),
        }
        org = genomes.loc[genomes["genome_id"] == gid, "ncbi_organism"].iloc[0]
        print(f"\n{acc} {org}")
        print(f"  {'definición':30s} {'TF':>6s} {'dianas':>8s} {'aristas':>8s}")
        for label, (a, b, c) in candidates.items():
            print(f"  {label:30s} {a if a is not None else '—':>6} {b if b is not None else '—':>8} "
                  f"{c if c is not None else '—':>8}")
            rows.append({"accession": acc, "definition": label, "n_tf": a, "n_targets": b, "n_edges": c})
    pd.DataFrame(rows).to_csv(OUT / "metrics_definition_test.tsv", sep="\t", index=False)
    print(f"\nArchivos en {OUT}/metrics_*")


if __name__ == "__main__":
    main()
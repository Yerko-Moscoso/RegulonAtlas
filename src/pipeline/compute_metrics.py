#!/usr/bin/env python3
"""
Etapa 3 - Métricas topológicas (NetworkX) y ficha de cada genoma.

Red analizada: aristas con neg_log10_p >= params["network_neg_log10_p"].
Nodos: TF y genes blanco (un TF que además es gen blanco cuenta como dos
nodos; limitación conocida hasta mapear cada TF a su propio gen).

Las 5 métricas básicas del MVP:
  nodos, aristas, densidad (E / N(N-1), grafo dirigido),
  grado medio (E / N) y hubs (TF con grado de salida > hub_degree_threshold).
Además: distribución de grados y ranking de TF por número de blancos, sobre la
red completa (no sobre el subgrafo que dibuja el dashboard).

Salidas en <results>/metrics/:
  topology.json   {accession: métricas + distribución + ranking}
  topology.tsv    una fila por genoma (para el informe)
  genomes.json    ficha: taxonomía, tamaño, genes, operones, TF, aristas, curadas

Uso: python -m src.pipeline.compute_metrics [--params ...]
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from collections import Counter

import networkx as nx
import pandas as pd

from src.pipeline.common import (cache_dir, load_params, now_utc, read_accessions,
                                 results_dir, setup_logging, write_provenance)

log = logging.getLogger("compute_metrics")
TOP_TFS = 15


def topology(edges: pd.DataFrame, hub_threshold: int) -> dict:
    g = nx.DiGraph()
    g.add_edges_from(zip("TF:" + edges["tf"], "GENE:" + edges["target_locus_tag"].astype(str)))
    n, e = g.number_of_nodes(), g.number_of_edges()
    tfs = [v for v in g if v.startswith("TF:")]
    out_deg = {v[3:]: g.out_degree(v) for v in tfs}
    degree_hist = Counter(d for _, d in g.degree())
    return {
        "nodos": n,
        "n_tfs": len(tfs),
        "n_targets": n - len(tfs),
        "aristas": e,
        "aristas_directas": int((edges["evidence"] == "direct").sum()),
        "aristas_por_operon": int((edges["evidence"] == "operon").sum()),
        "densidad": round(nx.density(g), 6) if n > 1 else 0.0,
        "grado_medio": round(e / n, 4) if n else 0.0,
        "hubs": sum(1 for d in out_deg.values() if d > hub_threshold),
        "hub_degree_threshold": hub_threshold,
        "degree_distribution": [{"degree": d, "count": c} for d, c in sorted(degree_hist.items())],
        "top_tfs": [{"tf": t, "targets": d}
                    for t, d in sorted(out_deg.items(), key=lambda x: (-x[1], x[0]))[:TOP_TFS]],
    }


def _clean(value):
    """NaN -> None y tipos numpy -> Python, para que el JSON sea válido en el navegador."""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    return value.item() if hasattr(value, "item") else value


def _json(obj) -> str:
    return json.dumps(obj, indent=2, ensure_ascii=False, default=_clean)


def genome_summary(row: pd.Series, genes: pd.DataFrame, curated: pd.DataFrame) -> dict:
    size = genes.groupby("contig")["end_pos"].max().sum() if len(genes) else None
    cur = curated[["tf_name", "locus_tag"]].drop_duplicates()
    return {
        "genome_id": int(row["genome_id"]),
        "accession": row["accession"],
        "ncbi_organism": _clean(row["ncbi_organism"]),
        "completeness": None if pd.isna(row["completeness"]) else float(row["completeness"]),
        "contamination": None if pd.isna(row["contamination"]) else float(row["contamination"]),
        "assembly_level": _clean(row["assembly_level"]),
        "gtdb_family": _clean(row["gtdb_family"]),
        "gtdb_genus": _clean(row["gtdb_genus"]),
        "gtdb_species": _clean(row["gtdb_species"]),
        "selection": _clean(row["selection"]),
        # Aproximación: fin del último gen anotado por contig.
        "genome_size_mb": round(float(size) / 1e6, 2) if size else None,
        "n_genes": int(len(genes)),
        "n_operons": int(genes["operon_id"].nunique()),
        "curated_interactions": int(len(cur)),
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--params")
    args = ap.parse_args(argv)
    setup_logging()
    started = now_utc()
    params = load_params(args.params)
    cache, res = cache_dir(params), results_dir(params)
    out = res / "metrics"
    out.mkdir(parents=True, exist_ok=True)

    genomes = pd.read_csv(cache / "genomes.tsv", sep="\t").set_index("accession", drop=False)
    genes = pd.read_csv(cache / "genes.tsv.gz", sep="\t", dtype={"gene_name": str, "locus_tag": str})
    curated = pd.read_csv(cache / "curated_regulons.tsv", sep="\t")
    thr, hub = params["network_neg_log10_p"], params["hub_degree_threshold"]

    inputs = {"genomes": cache / "genomes.tsv", "genes": cache / "genes.tsv.gz",
              "curated_regulons": cache / "curated_regulons.tsv"}
    topo_all, summaries, rows = {}, {}, []
    for acc in read_accessions(params["accessions_file"]):
        path = res / "networks" / f"{acc}.edges.tsv"
        inputs[f"edges:{acc}"] = path
        edges = pd.read_csv(path, sep="\t", dtype={"target_locus_tag": str})
        edges = edges[edges["neg_log10_p"] >= thr]

        t = {"genome_acc": acc, "organism": _clean(genomes.loc[acc, "ncbi_organism"]),
             "neg_log10_p_threshold": thr, **topology(edges, hub)}
        topo_all[acc] = t
        s = genome_summary(genomes.loc[acc], genes[genes["genome_id"] == genomes.loc[acc, "genome_id"]],
                           curated[curated["accession"] == acc])
        s.update({"n_tfs": t["n_tfs"], "predicted_edges": t["aristas"], "network_threshold": thr})
        summaries[acc] = s
        rows.append({k: v for k, v in t.items() if k not in ("degree_distribution", "top_tfs")})
        log.info("%s: nodos=%s aristas=%s (operón: %s) hubs=%s",
                 acc, t["nodos"], t["aristas"], t["aristas_por_operon"], t["hubs"])

    outputs = {"topology_json": out / "topology.json", "topology_tsv": out / "topology.tsv",
               "genomes_json": out / "genomes.json"}
    outputs["topology_json"].write_text(_json(topo_all))
    pd.DataFrame(rows).to_csv(outputs["topology_tsv"], sep="\t", index=False)
    outputs["genomes_json"].write_text(_json(summaries))
    write_provenance(out / "metrics.provenance.json", "compute_metrics", params, inputs, outputs, started)
    return 0


if __name__ == "__main__":
    sys.exit(main())

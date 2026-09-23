#!/usr/bin/env python3
"""
Etapa 5 - Informe breve del MVP (Markdown), generado desde los resultados.

Reúne parámetros, procedencia del caché, detección de ortólogos, métricas
topológicas y validación, para que los números del informe sean siempre los
mismos que produjo el pipeline.

Salida: <results>/report.md
Uso:    python -m src.pipeline.report [--params ...]
"""
from __future__ import annotations

import argparse
import json
import sys

import pandas as pd

from src.pipeline.common import (cache_dir, load_params, now_utc, read_accessions,
                                 results_dir, setup_logging)


def md_table(df: pd.DataFrame) -> str:
    cols = list(df.columns)
    lines = ["| " + " | ".join(cols) + " |", "|" + "|".join("---" for _ in cols) + "|"]
    for _, r in df.iterrows():
        lines.append("| " + " | ".join("" if pd.isna(v) else str(v) for v in r) + " |")
    return "\n".join(lines)


def pct(x) -> str:
    return f"{100 * x:.1f}%"


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--params")
    args = ap.parse_args(argv)
    setup_logging()
    params = load_params(args.params)
    cache, res = cache_dir(params), results_dir(params)

    manifest = json.loads((cache / "cache_manifest.json").read_text())
    tmap = json.loads((res / "transfer_map" / "transfer_map.provenance.json").read_text())
    nets = json.loads((res / "networks" / "networks.provenance.json").read_text())
    topo = json.loads((res / "metrics" / "topology.json").read_text())
    genomes = json.loads((res / "metrics" / "genomes.json").read_text())
    val = json.loads((res / "validation" / "validation.json").read_text())
    accs = read_accessions(params["accessions_file"])
    thr = params["network_neg_log10_p"]

    s = []
    s.append(f"# Informe MVP: redes regulatorias predichas ({params['subset_name']})\n")
    s.append(f"Generado: {now_utc():%Y-%m-%d %H:%M UTC} · commit `{(nets['git']['commit'] or 'sin git')[:10]}`"
             f"{' (con cambios sin commit)' if nets['git']['dirty'] else ''}\n")

    s.append("## 1. Datos y parámetros\n")
    s.append(f"- Subconjunto: {len(accs)} genomas. {params['description']}.")
    s.append(f"- Caché exportado el {manifest['finished_utc'][:10]} desde MariaDB "
             f"({manifest['database']['server_version']}, acceso de solo lectura); "
             f"{manifest['row_counts']['fimo_hits']:,} hits FIMO con p ≤ 1e-{params['min_neg_log10_p']:g}.")
    s.append(f"- Umbral de la red: p ≤ 1e-{thr:g}. Reglas de elegibilidad: {', '.join(params['eligible_rules'])}. "
             f"Propagación por operones: {'sí' if params['propagate_operons'] else 'no'}.")
    s.append(f"- Gold standard: {params['gold_standard']}.\n")

    s.append("## 2. Detección de ortólogos del TF\n")
    summ = tmap["summary"]
    s.append(f"Pares motivo–genoma evaluados como elegibles: {summ['pairs']:,}; "
             f"usados por la red: {summ['pairs_used_by_network']:,}.\n")
    s.append(md_table(pd.DataFrame([summ["by_rule"]])) + "\n")
    miss = tmap["reference_check"]["curated_tfs_without_eligible_motif"]
    s.append(f"TF curados de la referencia sin motivo elegible: {', '.join(miss) if miss else 'ninguno'}.\n")

    s.append("## 3. Redes y métricas topológicas\n")
    rows = []
    for a in accs:
        t, g = topo[a], genomes[a]
        rows.append({"Organismo": g["ncbi_organism"], "Accession": a, "Genoma (Mb)": g["genome_size_mb"],
                     "Genes": g["n_genes"], "TF": t["n_tfs"], "Blancos": t["n_targets"],
                     "Aristas": f"{t['aristas']:,}", "Por operón": f"{t['aristas_por_operon']:,}",
                     "Densidad": f"{t['densidad']:.4f}", "Grado medio": f"{t['grado_medio']:.2f}",
                     f"Hubs (>{t['hub_degree_threshold']})": t["hubs"]})
    s.append(md_table(pd.DataFrame(rows)) + "\n")
    s.append("Grado medio = aristas / nodos. Nodos = TF + genes blanco.\n")

    s.append(f"## 4. Validación (p ≤ 1e-{thr:g})\n")
    rows = []
    for a in accs:
        v = val[a]
        if v["status"] == "no_gold_standard":
            continue
        for variant in ("with_operons", "direct_only"):
            r = next(x for x in v["variants"][variant] if x["neg_log10_pvalue_threshold"] == thr)
            rows.append({"Organismo": r["organism"], "Variante": variant, "Estado": v["status"],
                         "TP": r["true_positives"], "FP": f"{r['false_positives']:,}",
                         "FN": r["false_negatives"], "Precisión": pct(r["precision"]),
                         "Recall": pct(r["recall"]), "F1": pct(r["f1"])})
    s.append(md_table(pd.DataFrame(rows)) + "\n")
    s.append("`no_overlap`: el genoma tiene regulones curados, pero sus locus tags (anteriores a la "
             "reanotación PGAP de RefSeq) no coinciden con los del genoma; TP = 0 no es un resultado biológico.\n")

    ref = params["reference_accession"]
    if val.get(ref, {}).get("variants"):
        s.append(f"### Curva de la referencia ({genomes[ref]['ncbi_organism']})\n")
        curve = pd.DataFrame(val[ref]["variants"]["with_operons"])
        curve = curve.assign(p=curve["p_value_equivalent"], Precisión=curve["precision"].map(pct),
                             Recall=curve["recall"].map(pct), F1=curve["f1"].map(pct))
        s.append(md_table(curve[["p", "true_positives", "false_positives", "false_negatives",
                                 "Precisión", "Recall", "F1"]]) + "\n")

    s.append("## 5. Reproducibilidad\n")
    s.append("```\nmake cache   # una vez, requiere acceso de lectura a MariaDB\n"
             "make mvp     # regenera todo desde el caché: ortólogos, redes, métricas, validación e informe\n```\n")
    s.append("Cada etapa deja un `*.provenance.json` con parámetros, commit y sha256 de entradas y salidas.\n")

    path = res / "report.md"
    path.write_text("\n".join(s))
    print(f"Informe escrito en {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

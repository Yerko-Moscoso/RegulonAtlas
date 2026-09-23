#!/usr/bin/env python3
"""
Etapa 4 - Validación contra regulones curados.

Para cada genoma con interacciones curadas (params["gold_standard"]) y cada
umbral de params["validation_thresholds"]:

  TP  pares (TF, gen) predichos que están en los regulones curados
  FP  pares predichos que no están
  FN  pares curados que la predicción no encontró
  precisión = TP/(TP+FP), recall = TP/(TP+FN), F1

Se evalúan dos variantes para medir el aporte de la propagación por operones:
  with_operons  la red completa
  direct_only   solo aristas con un sitio frente al propio gen

status por genoma:
  ok                  hay coincidencias con el gold standard
  no_overlap          hay curadas y predicciones, pero TP = 0 en todos los
                      umbrales: típico de locus tags reanotados por PGAP que no
                      coinciden con los de RegPrecise (no es un resultado biológico)
  no_gold_standard    el genoma no tiene interacciones curadas

Salidas en <results>/validation/: validation.json y validation.tsv
Uso: python -m src.pipeline.validate [--params ...]
"""
from __future__ import annotations

import argparse
import json
import logging
import sys

import pandas as pd

from src.pipeline.common import (cache_dir, load_params, norm_locus, norm_name, now_utc,
                                 read_accessions, results_dir, setup_logging, write_provenance)

log = logging.getLogger("validate")
VARIANTS = {"with_operons": None, "direct_only": "direct"}


def curve(edges: pd.DataFrame, gold: set, thresholds: list[float], meta: dict) -> list[dict]:
    rows = []
    for thr in thresholds:
        sel = edges[edges["neg_log10_p"] >= thr]
        predicted = set(zip(sel["tf_n"], sel["locus_n"]))
        tp, fp, fn = len(predicted & gold), len(predicted - gold), len(gold - predicted)
        p = tp / (tp + fp) if tp + fp else 0.0
        r = tp / (tp + fn) if tp + fn else 0.0
        rows.append({
            **meta,
            "neg_log10_pvalue_threshold": thr,
            "p_value_equivalent": f"1e-{thr:g}",
            "true_positives": tp, "false_positives": fp, "false_negatives": fn,
            "precision": round(p, 6), "recall": round(r, 6),
            "f1": round(2 * p * r / (p + r), 6) if p + r else 0.0,
        })
    return rows


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--params")
    args = ap.parse_args(argv)
    setup_logging()
    started = now_utc()
    params = load_params(args.params)
    cache, res = cache_dir(params), results_dir(params)
    out = res / "validation"
    out.mkdir(parents=True, exist_ok=True)

    genomes = pd.read_csv(cache / "genomes.tsv", sep="\t").set_index("accession")
    curated = pd.read_csv(cache / "curated_regulons.tsv", sep="\t")
    inputs = {"curated_regulons": cache / "curated_regulons.tsv", "genomes": cache / "genomes.tsv"}

    result, flat = {}, []
    for acc in read_accessions(params["accessions_file"]):
        path = res / "networks" / f"{acc}.edges.tsv"
        inputs[f"edges:{acc}"] = path
        edges = pd.read_csv(path, sep="\t", dtype={"target_locus_tag": str})
        edges["tf_n"] = edges["tf"].map(norm_name)
        edges["locus_n"] = edges["target_locus_tag"].map(norm_locus)

        cur = curated[curated["accession"] == acc]
        gold = set(zip(cur["tf_name"].map(norm_name), cur["locus_tag"].map(norm_locus)))
        meta = {"genome_acc": acc, "organism": genomes.loc[acc, "ncbi_organism"],
                "gold_standard": params["gold_standard"], "gold_standard_pairs": len(gold)}

        entry = {"status": "no_gold_standard", "variants": {}}
        if gold:
            for variant, evidence in VARIANTS.items():
                e = edges if evidence is None else edges[edges["evidence"] == evidence]
                rows = curve(e, gold, params["validation_thresholds"], {**meta, "variant": variant})
                entry["variants"][variant] = rows
                flat.extend(rows)
            any_tp = any(r["true_positives"] > 0 for rows in entry["variants"].values() for r in rows)
            entry["status"] = "ok" if any_tp else "no_overlap"
        result[acc] = entry

        first = entry["variants"].get("with_operons", [{}])[0]
        log.info("%s [%s] p<=1e-%s TP=%s FP=%s FN=%s P=%.3f R=%.3f", acc, entry["status"],
                 first.get("neg_log10_pvalue_threshold"), first.get("true_positives"),
                 first.get("false_positives"), first.get("false_negatives"),
                 first.get("precision", 0), first.get("recall", 0))

    outputs = {"validation_json": out / "validation.json", "validation_tsv": out / "validation.tsv"}
    outputs["validation_json"].write_text(json.dumps(result, indent=2, ensure_ascii=False))
    pd.DataFrame(flat).to_csv(outputs["validation_tsv"], sep="\t", index=False)
    write_provenance(out / "validation.provenance.json", "validate", params, inputs, outputs, started,
                     extra={"status": {a: e["status"] for a, e in result.items()}})
    return 0


if __name__ == "__main__":
    sys.exit(main())

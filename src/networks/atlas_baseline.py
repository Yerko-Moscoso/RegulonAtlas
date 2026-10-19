#!/usr/bin/env python
"""Línea base del pipeline propio desde fimo_hits (semana 12, parte B).

Red de PRUEBA, solo en los 312 genomas validables (scripts/export_fimo_cache.py): sirve para
medir cuánto aportan los filtros del pipeline externo, no para el dashboard del atlas.

Variantes:
  scan            todos los hits FIMO con p <= umbral
  order_ceiling   tier de transferencia hasta same_order (el techo de validated y no-footprint)
  class_ceiling   tier de transferencia hasta same_class (el techo de balanced)
Umbrales: p <= 1e-5, 1e-6, 1e-7, 1e-8. Sin footprinting ni calibración de confidence.
Contrastes con el mismo umbral y tier que una red externa:
  order_ceiling 1e-7 -> no-footprint : aporte del método externo (convergent-empirical), sin footprinting
  no-footprint      -> validated     : aporte del footprinting (semana 10)
  class_ceiling 1e-6 -> balanced     : método + footprinting

No hay variante "solo elegibles": en la base, todos los hits de los genomas validables
tienen su par (motivo, genoma) en transfer_map, que solo guarda pares elegibles (D13). El
módulo lo comprueba y lo registra en el manifest (hits_in_transfer_map).

Grafo y validación iguales a la semana 10 (src/validation/atlas.py): el hit apunta al operón
de su gen (genes_validation.operon_id), TF por nombre normalizado, un par por
(genoma, TF, operón) con el mejor -log10 p; modos all e independent; universos genome_tf y
genome; recall sobre todo el gold standard proyectado.

Uso (desde ~/proyecto, después de make cache-fimo):
    PYTHONPATH=. python src/networks/atlas_baseline.py
Salidas en data/results/baseline/:
    summary.tsv       P/R/F1 por variante, umbral, modo y universo, más tamaño de la red
    vs_networks.tsv   la línea base junto a las 5 redes externas (mismo gold, misma definición)
    reproduction.tsv  cada red externa frente a la línea base con SU umbral y SU techo de tier
                      (tabla networks): ¿qué fracción de pares comparten? Mide qué queda del
                      pipeline externo que no es umbral + tier (el footprinting).
    reproduction_edges.tsv  la misma pregunta a nivel de arista (genoma, motivo, operón):
                      no-footprint desde los hits (incluido n_sites) y cada red con footprinting
                      desde una red "madre" que contiene a todas sus candidatas, con la regla
                      p <= umbral, tier <= techo y footprint_enrichment >= mínimo (networks.params).
    manifest.json
"""
import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

from src.networks.atlas_metrics import load_pairs
from src.validation.atlas import (KEY, NETWORKS, build_gold_regprecise, evaluable, f1, git_commit, git_dirty, load,
                                  load_motifs, norm_tf, safe_div)

CACHE = Path("data/cache/atlas")
VALIDATION = Path("data/results/validation/regprecise/summary.tsv")
OUT_DEFAULT = Path("data/results/baseline")
THRESHOLDS = [5, 6, 7, 8]  # -log10 p
MODES = ["all", "independent"]
UNIVERSES = ["genome_tf", "genome"]
# Orden de los tiers de más cercano a más lejano (igual que en edges); el techo de balanced es same_class.
TIERS = ["within_genus", "same_genus", "within_family", "same_family", "within_order", "same_order",
         "within_class", "same_class", "within_phylum", "same_phylum", "cross_phylum"]
CEILINGS = {"order_ceiling": TIERS[:TIERS.index("same_order") + 1],
            "class_ceiling": TIERS[:TIERS.index("same_class") + 1]}
VARIANTS = ["scan", "order_ceiling", "class_ceiling"]


def load_hits(motifs, membership):
    path = CACHE / "fimo_hits_validation.parquet"
    if not path.exists():
        sys.exit(f"Falta {path}. Ejecuta make cache-fimo primero.")
    h = pd.read_parquet(path, columns=["motif_id", "genome_id", "gene_id", "neg_log10_p"])
    h = h[h["neg_log10_p"] >= min(THRESHOLDS)]
    genes = load("genes_validation", ["gene_id", "operon_id"]).dropna(subset=["operon_id"])
    h = h.merge(genes.astype({"gene_id": "int64", "operon_id": "int64"}), on="gene_id", how="inner")
    tf = load("motifs", ["motif_id", "tf_name"])
    h = h.merge(tf, on="motif_id").merge(motifs, on="motif_id", how="left")
    h["genome_id"] = h["genome_id"].astype("int64")
    h["tf"] = norm_tf(h["tf_name"])
    h = h.dropna(subset=["tf"])
    tm = pd.read_parquet(CACHE / "transfer_map_validation.parquet", columns=["motif_id", "genome_id", "tier"])
    tm["genome_id"] = tm["genome_id"].astype("int64")
    h = h.merge(tm, on=["motif_id", "genome_id"], how="left")  # tier NaN = no elegible
    mem = membership.assign(self_regulog=True)
    mem["regulog_id"] = mem["regulog_id"].astype("Int64")
    h = h.merge(mem, on=["regulog_id", "genome_id"], how="left")
    h["self_regulog"] = h["self_regulog"].fillna(False).astype(bool)
    return h


def variant_hits(h, variant):
    if variant == "scan":
        return h
    return h[h["tier"].isin(CEILINGS[variant])]


def collapse(h):
    """Un par por (genoma, TF, operón) con el mejor -log10 p."""
    h = h.sort_values("neg_log10_p", ascending=False, kind="mergesort")
    return h.drop_duplicates(KEY)[KEY + ["neg_log10_p"]].reset_index(drop=True)


EDGE_KEY = ["genome_id", "motif_id", "operon_id"]
# red objetivo -> red madre que contiene a todas sus aristas candidatas (mismo o menor umbral, mayor techo de
# tier, menor footprint mínimo). permissive (footprint >= 1) no tiene madre: no hay aristas con footprint < 1.
FOOTPRINT_PARENT = {1: 5, 2: 5, 3: 4}


def network_edges(net_id, validable):
    e = load(f"edges_net{net_id}", ["genome_id", "motif_id", "target_operon", "best_neg_log10_p", "tier",
                                    "footprint_enrichment", "n_sites"])
    e = e.rename(columns={"target_operon": "operon_id"})
    e[EDGE_KEY] = e[EDGE_KEY].astype("int64")
    return e[e["genome_id"].isin(validable)]


def compare_edges(a, b):
    ai, bi = pd.MultiIndex.from_frame(a[EDGE_KEY]), pd.MultiIndex.from_frame(b[EDGE_KEY])
    shared = int(ai.isin(bi).sum())
    return len(ai), len(bi), shared, bool(shared == len(ai) == len(bi))


def edge_reproduction(h_all, nets, validable):
    """Reproducción a nivel de arista (genoma, motivo, operón)."""
    params = {int(r["network_id"]): (r["name"], -np.log10(r["p_threshold"]), r["tier_ceiling"],
                                     json.loads(r["params"]).get("footprint_enrichment_min", 0))
              for _, r in nets.iterrows()}
    rows = []
    # no-footprint desde los hits: mismo umbral y techo de tier, sin footprinting
    name, thr, ceil, _ = params[5]
    tiers = TIERS[:TIERS.index(ceil) + 1]
    hits = h_all[(h_all["neg_log10_p"] >= thr - 1e-9) & h_all["tier"].isin(tiers)]
    from_hits = hits.groupby(EDGE_KEY).size().rename("n_hits").reset_index()
    target = network_edges(5, validable)
    n_net, n_rule, shared, exact = compare_edges(target, from_hits)
    sites = target.merge(from_hits, on=EDGE_KEY)
    rows.append({"network": name, "source": "fimo_hits", "rule": f"p <= 1e-{thr:.0f}, tier <= {ceil}",
                 "network_edges": n_net, "rule_edges": n_rule, "shared_edges": shared, "exact": exact,
                 "n_sites_match": float((sites["n_sites"] == sites["n_hits"]).mean())})
    # redes con footprinting desde su red madre
    for net_id, parent in FOOTPRINT_PARENT.items():
        name, thr, ceil, fp_min = params[net_id]
        tiers = TIERS[:TIERS.index(ceil) + 1]
        e = network_edges(parent, validable)
        rule = e[(e["best_neg_log10_p"] >= thr - 1e-6) & e["tier"].isin(tiers) & (e["footprint_enrichment"] >= fp_min)]
        n_net, n_rule, shared, exact = compare_edges(network_edges(net_id, validable), rule)
        rows.append({"network": name, "source": params[parent][0],
                     "rule": f"p <= 1e-{thr:.0f}, tier <= {ceil}, footprint >= {fp_min}",
                     "network_edges": n_net, "rule_edges": n_rule, "shared_edges": shared, "exact": exact,
                     "n_sites_match": np.nan})
    name, _, _, fp_min = params[4]
    rows.append({"network": name, "source": None, "rule": f"footprint >= {fp_min}: no parent network with "
                 "footprint < 1, not checkable", "network_edges": len(network_edges(4, validable)),
                 "rule_edges": np.nan, "shared_edges": np.nan, "exact": None, "n_sites_match": np.nan})
    return pd.DataFrame(rows)


def summarize(variant, thr, mode, universe, pairs, ev, gold):
    tp = int(ev["is_gold"].sum())
    fp = int(len(ev) - tp)
    p, r = safe_div(tp, tp + fp), safe_div(tp, len(gold))
    per_genome = pairs.groupby("genome_id").size()
    return {"variant": variant, "p_threshold": float(10 ** -thr), "neg_log10_p": thr, "mode": mode,
            "universe": universe, "pairs_total": int(len(pairs)), "pairs_evaluable": int(len(ev)),
            "genomes_with_pairs": int(per_genome.size), "median_pairs_per_genome": float(per_genome.median()),
            "TP": tp, "FP": fp, "FN": int(len(gold) - tp), "precision": p, "recall": r, "f1": f1(p, r)}


def main():
    ap = argparse.ArgumentParser(description="Línea base del pipeline propio desde fimo_hits")
    ap.add_argument("--out", type=Path, default=OUT_DEFAULT)
    args = ap.parse_args()
    dirty = git_dirty()
    if dirty:
        print("AVISO: hay cambios sin commit; el manifest registrará git_dirty=true. "
              "Haz commit y vuelve a ejecutar para que los resultados sean trazables.")
    args.out.mkdir(parents=True, exist_ok=True)

    genomes = load("genomes", ["genome_id", "accession", "ncbi_organism", "gtdb_family", "selection"])
    gold, membership, _, gstats = build_gold_regprecise(genomes)
    h = load_hits(load_motifs(), membership)
    print(f"Hits con p <= 1e-{min(THRESHOLDS)} en operones: {len(h):,} en {h['genome_id'].nunique()} genomas; "
          f"gold: {gstats['gold_tf_operon_pairs']:,} pares en {gstats['validable_genomes']} genomas")
    in_tm = float(h["tier"].notna().mean())
    print(f"Hits con su par (motivo, genoma) en transfer_map: {in_tm:.4%}")
    print("Tiers de transfer_map en los hits:", h["tier"].value_counts(dropna=False).to_dict())
    validable = set(gold["genome_id"].unique())

    rows = []
    for variant in VARIANTS:
        hv = variant_hits(h, variant)
        for thr in THRESHOLDS:
            ht = hv[hv["neg_log10_p"] >= thr]
            for mode in MODES:
                sub = ht if mode == "all" else ht[~ht["self_regulog"]]
                pairs = collapse(sub)
                for universe in UNIVERSES:
                    ev = evaluable(pairs, gold, universe)
                    s = summarize(variant, thr, mode, universe, pairs, ev, gold)
                    rows.append(s)
                    if universe == "genome_tf":
                        print(f"  {variant:15s} 1e-{thr} {mode:11s} pares={s['pairs_total']:>10,} "
                              f"P={s['precision']:.3f} R={s['recall']:.3f} F1={s['f1']:.3f}", flush=True)
    summary = pd.DataFrame(rows)
    summary.to_csv(args.out / "summary.tsv", sep="\t", index=False)

    # Reproducción de cada red externa con su umbral y su techo de tier
    nets = load("networks", ["network_id", "name", "p_threshold", "tier_ceiling", "params"])
    rep_rows = []
    for _, n in nets.iterrows():
        thr = -np.log10(n["p_threshold"])
        ceiling = TIERS[:TIERS.index(n["tier_ceiling"]) + 1]
        b = collapse(h[(h["neg_log10_p"] >= thr - 1e-9) & h["tier"].isin(ceiling)])
        e, _ = load_pairs(int(n["network_id"]))
        e = e[e["genome_id"].isin(validable)]
        bi, ei = pd.MultiIndex.from_frame(b[KEY]), pd.MultiIndex.from_frame(e[KEY])
        inter = int(ei.isin(bi).sum())
        fp_min = json.loads(n["params"]).get("footprint_enrichment_min") if isinstance(n["params"], str) else None
        rep_rows.append({"network_id": int(n["network_id"]), "network": n["name"],
                         "p_threshold": float(n["p_threshold"]), "tier_ceiling": n["tier_ceiling"],
                         "footprint_min": fp_min, "baseline_pairs": len(bi), "external_pairs": len(ei),
                         "shared_pairs": inter, "external_in_baseline": safe_div(inter, len(ei)),
                         "baseline_kept_by_external": safe_div(inter, len(bi)),
                         "jaccard": safe_div(inter, len(bi) + len(ei) - inter)})
    reproduction = pd.DataFrame(rep_rows)
    reproduction.to_csv(args.out / "reproduction.tsv", sep="\t", index=False)
    print("\n== Reproducción de las redes externas (mismo umbral y tier, genomas validables) ==")
    print(reproduction[["network", "p_threshold", "tier_ceiling", "baseline_pairs", "external_pairs",
                        "external_in_baseline", "baseline_kept_by_external", "jaccard"]]
          .to_string(index=False, float_format=lambda x: f"{x:.4g}"))

    # Reproducción a nivel de arista
    edges_rep = edge_reproduction(h, nets, validable)
    edges_rep.to_csv(args.out / "reproduction_edges.tsv", sep="\t", index=False)
    print("\n== Reproducción a nivel de arista (genoma, motivo, operón) ==")
    print(edges_rep.to_string(index=False))

    # Junto a las redes externas (misma validación; el gold ya se limita a los genomas validables)
    if VALIDATION.exists():
        v = pd.read_csv(VALIDATION, sep="\t")
        # pares de cada red externa en los MISMOS genomas validables (modo all)
        ext_pairs = {}
        for net_id in NETWORKS:
            p, _ = load_pairs(net_id)
            ext_pairs[net_id] = int(p["genome_id"].isin(validable).sum())
        ext = v.assign(source="external", variant=v["network"],
                       pairs_validable_genomes=v["network_id"].map(ext_pairs))
        ext.loc[ext["mode"] != "all", "pairs_validable_genomes"] = np.nan
        base = summary.assign(source="baseline",
                              variant=summary["variant"] + " p<=1e-" + summary["neg_log10_p"].astype(str),
                              pairs_validable_genomes=summary["pairs_total"])
        cols = ["source", "variant", "mode", "universe", "pairs_validable_genomes", "precision", "recall", "f1"]
        ext, base = ext[cols], base[cols]
        pd.concat([ext, base], ignore_index=True).to_csv(args.out / "vs_networks.tsv", sep="\t", index=False)

    manifest = {
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "git_commit": git_commit(),
        "git_dirty": dirty,
        "scope": f"{gstats['validable_genomes']} validable genomes (RegPrecise gold); test network, not the atlas",
        "definition": {
            "variants": {"scan": "all FIMO hits at the threshold",
                         **{k: f"transfer tier in {v}" for k, v in CEILINGS.items()}},
            "contrasts": {"order_ceiling p<=1e-7 vs no-footprint": "external method, no footprinting in either",
                          "no-footprint vs validated": "footprinting",
                          "class_ceiling p<=1e-6 vs balanced": "external method + footprinting"},
            "thresholds_neg_log10_p": THRESHOLDS,
            "pair": "one per (genome, TF normalized, operon of the hit gene); best -log10 p",
            "validation": "same as src/validation/atlas.py (modes all/independent, universes genome_tf/genome)",
            "not_included": ["phylogenetic footprinting", "confidence calibration", "convergent-empirical method"],
        },
        "hits_in_transfer_map": in_tm,
        "gold_stats": gstats,
        "files": ["summary.tsv", "vs_networks.tsv", "reproduction.tsv", "reproduction_edges.tsv"],
    }
    (args.out / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
    print(f"\nResultados en {args.out}/")


if __name__ == "__main__":
    main()

"""Pruebas unitarias de la validación contra RegPrecise (src/validation/atlas.py, OE5). Semana 14, bloque A.

Usan datos inventados pequeños, con el resultado calculado a mano en los comentarios. No leen data/:
corren también en un clon limpio. Detalle de cada caso en docs/pruebas_semana14.md.

Caso de juguete (TF ya normalizado, red 3 = balanced):

    gold standard               predicciones (pares)                     genome_tf   genome
    g1 lexa op10                g1 lexa op10  conf 0.90                  TP          TP
    g1 lexa op11                g1 lexa op12  conf 0.80                  FP          FP
    g1 fur  op20                g1 arca op40  conf 0.70 (arca sin gold)  fuera       FP
    g2 crp  op30                g1 fur  op20  conf 0.40                  TP          TP
    g4 lexa op50                g2 crp  op31  conf 0.60                  FP          FP
                                g3 lexa op10  conf 0.95 (g3 sin gold)    fuera       fuera
"""
import math

import pandas as pd
import pytest

import src.validation.atlas as va
from src.atlas_common import KEY


@pytest.fixture
def gold():
    return pd.DataFrame({"genome_id": [1, 1, 1, 2, 4],
                         "tf": ["lexa", "lexa", "fur", "crp", "lexa"],
                         "operon_id": [10, 11, 20, 30, 50]})


@pytest.fixture
def pairs():
    return pd.DataFrame({"genome_id": [1, 1, 1, 1, 2, 3],
                         "tf": ["lexa", "lexa", "arca", "fur", "crp", "lexa"],
                         "operon_id": [10, 12, 40, 20, 31, 10],
                         "confidence": [0.90, 0.80, 0.70, 0.40, 0.60, 0.95],
                         "tier": ["within_genus"] * 6,
                         "origin": ["regprecise_transfer"] * 6})


# ---------------------------------------------------------------- collapse
def test_collapse_keeps_most_confident_edge_per_pair():
    e = pd.DataFrame({"genome_id": [1, 1, 1], "tf": ["lexa", "lexa", "lexa"], "operon_id": [10, 10, 11],
                      "tier": ["same_class", "within_genus", "same_order"],
                      "origin": ["prodoric", "regprecise_transfer", "prodoric"],
                      "confidence": [0.3, 0.8, 0.5], "motif_id": [7, 8, 9]})
    out = va.collapse(e)
    assert len(out) == 2
    assert list(out.columns) == KEY + ["tier", "origin", "confidence"]
    best = out[out["operon_id"] == 10].iloc[0]
    assert best["confidence"] == 0.8 and best["tier"] == "within_genus"


def test_collapse_tie_keeps_first_row():
    """Con confidence empatada se conserva la primera fila (orden estable): el resultado es reproducible."""
    e = pd.DataFrame({"genome_id": [1, 1], "tf": ["lexa", "lexa"], "operon_id": [10, 10],
                      "tier": ["same_order", "same_class"], "origin": ["prodoric", "prodoric"],
                      "confidence": [0.5, 0.5]})
    assert va.collapse(e).iloc[0]["tier"] == "same_order"


# ---------------------------------------------------------------- evaluable
def test_evaluable_genome_tf_keeps_only_tfs_with_curated_regulon(pairs, gold):
    ev = va.evaluable(pairs, gold, "genome_tf")
    assert len(ev) == 4                                  # sin g1 arca (TF sin regulón) ni g3 (genoma sin gold)
    assert not ((ev["genome_id"] == 1) & (ev["tf"] == "arca")).any()
    assert 3 not in set(ev["genome_id"])
    assert int(ev["is_gold"].sum()) == 2                 # g1 lexa op10 y g1 fur op20
    assert ev["is_gold"].dtype == bool


def test_evaluable_genome_keeps_every_pair_of_validable_genomes(pairs, gold):
    ev = va.evaluable(pairs, gold, "genome")
    assert len(ev) == 5                                  # solo queda fuera g3
    assert ((ev["genome_id"] == 1) & (ev["tf"] == "arca")).sum() == 1
    assert int(ev["is_gold"].sum()) == 2


# ---------------------------------------------------------------- summarize
def test_summarize_genome_tf_counts_by_hand(pairs, gold):
    ev = va.evaluable(pairs, gold, "genome_tf")
    s = va.summarize(3, "all", "genome_tf", pairs, ev, gold)
    assert (s["TP"], s["FP"], s["FN"]) == (2, 2, 3)      # FN sobre TODO el gold (5), también g4 sin predicciones
    assert s["precision"] == pytest.approx(0.5)
    assert s["recall"] == pytest.approx(0.4)
    assert s["f1"] == pytest.approx(2 * 0.5 * 0.4 / 0.9)
    assert (s["pairs_total"], s["pairs_evaluable"], s["pairs_not_evaluable"]) == (6, 4, 2)
    assert s["genomes_evaluated"] == 2
    assert s["precision_macro_median"] == pytest.approx((2 / 3 + 0) / 2)   # g1 2/3, g2 0/1
    assert s["recall_macro_median"] == pytest.approx((2 / 3 + 0) / 2)
    assert s["network"] == "balanced" and s["d33_f1"] == 0.421


def test_summarize_genome_universe_counts_by_hand(pairs, gold):
    ev = va.evaluable(pairs, gold, "genome")
    s = va.summarize(3, "all", "genome", pairs, ev, gold)
    assert (s["TP"], s["FP"], s["FN"]) == (2, 3, 3)      # g1 arca pasa a ser FP
    assert s["precision"] == pytest.approx(0.4)
    assert s["recall"] == pytest.approx(0.4)             # el recall no depende del universo
    assert s["f1"] == pytest.approx(0.4)


def test_safe_div_and_f1_without_predictions():
    """Una red sin pares evaluables da precisión y F1 vacías (NaN), no 0."""
    assert math.isnan(va.safe_div(0, 0))
    assert math.isnan(va.f1(float("nan"), 0.0))
    assert math.isnan(va.f1(0.0, 0.0))


# ---------------------------------------------------------------- curva P/R
def _curve(pairs, gold):
    ev = va.evaluable(pairs, gold, "genome_tf")
    return pd.DataFrame(va.pr_curve(3, "all", pairs, ev, len(gold))).set_index("min_confidence")


def test_pr_curve_at_zero_matches_summarize(pairs, gold):
    ev = va.evaluable(pairs, gold, "genome_tf")
    s = va.summarize(3, "all", "genome_tf", pairs, ev, gold)
    c0 = _curve(pairs, gold).loc[0.0]
    assert (c0["TP"], c0["FP"], c0["pairs_evaluable"], c0["pairs_total"]) == (2, 2, 4, 6)
    assert c0["precision"] == pytest.approx(s["precision"])
    assert c0["recall"] == pytest.approx(s["recall"])


def test_pr_curve_threshold_is_inclusive_and_counts_by_hand(pairs, gold):
    c = _curve(pairs, gold)
    # conf >= 0.5: evaluables 0.90 (TP), 0.80 (FP), 0.60 (FP); todos los pares: 0.95, 0.90, 0.80, 0.70, 0.60
    assert (c.loc[0.5, "pairs_evaluable"], c.loc[0.5, "TP"], c.loc[0.5, "pairs_total"]) == (3, 1, 5)
    # conf >= 0.9 incluye el par con conf exactamente 0.90
    assert (c.loc[0.9, "pairs_evaluable"], c.loc[0.9, "TP"]) == (1, 1)
    assert c.loc[0.9, "precision"] == pytest.approx(1.0)
    # conf >= 0.96: ningún par evaluable -> precisión vacía, no 0
    assert c.loc[0.96, "pairs_evaluable"] == 0 and math.isnan(c.loc[0.96, "precision"])


def test_pr_curve_is_monotone(pairs, gold):
    c = _curve(pairs, gold)
    assert len(c) == 101                                 # de 0 a 1 con paso 0,01
    for col in ["pairs_total", "pairs_evaluable", "TP", "recall"]:
        assert c[col].is_monotonic_decreasing, col
    assert (c["TP"] + c["FP"] == c["pairs_evaluable"]).all()


# ---------------------------------------------------------------- por genoma
def test_by_genome_includes_genomes_without_predictions(pairs, gold):
    ev = va.evaluable(pairs, gold, "genome_tf")
    genomes = pd.DataFrame({"genome_id": [1, 2, 3, 4], "accession": ["A1", "A2", "A3", "A4"],
                            "ncbi_organism": ["o1", "o2", "o3", "o4"], "gtdb_family": ["f"] * 4})
    g = va.by_genome(3, "all", ev, gold, genomes).set_index("genome_id")
    assert sorted(g.index) == [1, 2, 4]                  # los genomas del gold; g3 no
    assert tuple(g.loc[1, ["n_gold", "pairs_evaluable", "TP", "FP", "FN"]]) == (3, 3, 2, 1, 1)
    assert tuple(g.loc[2, ["n_gold", "pairs_evaluable", "TP", "FP", "FN"]]) == (1, 1, 0, 1, 1)
    # g4: gold sin predicciones -> TP 0, FN = n_gold, recall 0 y precisión vacía (no 0)
    assert tuple(g.loc[4, ["n_gold", "pairs_evaluable", "TP", "FP", "FN"]]) == (1, 0, 0, 0, 1)
    assert g.loc[4, "recall"] == 0 and math.isnan(g.loc[4, "precision"])
    assert g.loc[1, "accession"] == "A1"


# ---------------------------------------------------------------- gold standard
def _fake_cache(name, cols=None):
    tables = {
        "curated_regulons": pd.DataFrame({
            "regulog_id": [100, 100, 100, 101, 102, 103],
            "tf_name": ["LexA", "LexA", "lexA ", "Fur", "CRP", "ArcA"],
            "genome_name": ["Ecoli", "Ecoli", "Ecoli", "Ecoli", "Unknown sp", "Bsub"],
            # b0001: locus_tag; OLD_002: solo old_locus_tag; repetido; zzz999: sin gen; x1: sin genoma;
            # BSU001: el gen lleva el prefijo "gene-"
            "locus_tag": ["b0001", "OLD_002", "b0001", "zzz999", "x1", "BSU001"]}),
        "regprecise_genome_map": pd.DataFrame({"genome_name": ["Ecoli", "Bsub"], "accession": ["GCF_1", "GCF_2"]}),
        "genes_validation": pd.DataFrame({
            "genome_id": [1, 1, 2], "locus_tag": ["b0001", "b0002", "gene-BSU001"],
            "operon_id": [10, 11, 30], "old_locus_tag": [None, "OLD_002", None]}),
    }
    df = tables[name]
    return df[cols] if cols else df


def test_build_gold_regprecise_maps_locus_and_counts_rows(monkeypatch):
    monkeypatch.setattr(va, "load", _fake_cache)
    genomes = pd.DataFrame({"genome_id": [1, 2], "accession": ["GCF_1", "GCF_2"],
                            "ncbi_organism": ["E. coli", "B. subtilis"], "selection": ["representative"] * 2})
    gold, membership, mapping, stats = va.build_gold_regprecise(genomes)

    assert sorted(map(tuple, gold[KEY].values.tolist())) == [(1, "lexa", 10), (1, "lexa", 11), (2, "arca", 30)]
    assert gold["operon_id"].dtype == "int64"
    assert stats["curated_rows"] == 6
    assert stats["rows_without_genome"] == 1             # "Unknown sp"
    assert stats["rows_matched_locus_tag"] == 3          # b0001 (x2) y BSU001 (prefijo gene- quitado)
    assert stats["rows_matched_old_locus_tag"] == 1      # OLD_002
    assert stats["rows_unmatched_locus"] == 1            # zzz999
    assert (stats["validable_genomes"], stats["gold_genome_tf_pairs"], stats["gold_tf_operon_pairs"]) == (2, 2, 3)
    # pertenencia regulog -> genoma (para el modo independent): también el regulog sin locus emparejado
    assert sorted(map(tuple, membership.values.tolist())) == [(100, 1), (101, 1), (103, 2)]
    m = mapping.set_index("genome_id")
    assert tuple(m.loc[1, ["locus_tag", "old_locus_tag", "none", "n_curated"]]) == (2, 1, 1, 4)
    assert m.loc[1, "map_rate"] == pytest.approx(0.75)
    assert m.loc[2, "map_rate"] == pytest.approx(1.0)

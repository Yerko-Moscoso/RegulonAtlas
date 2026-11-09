"""Pruebas unitarias de la línea base, la comparación entre taxones y la robustez. Semana 14, bloque B.

Funciones de src/networks/atlas_baseline.py, atlas_comparison.py y atlas_robustness.py con datos inventados.
No leen data/: corren también en un clon limpio. Detalle de cada caso en docs/pruebas_semana14.md.
"""
import math

import numpy as np
import pandas as pd
import pytest
from scipy import stats

from src.atlas_common import KEY, TIERS
from src.networks import atlas_baseline as bl
from src.networks import atlas_comparison as cmp
from src.networks import atlas_robustness as rob


# ---------------------------------------------------------------- línea base
def test_baseline_collapse_keeps_best_p_value():
    h = pd.DataFrame({"genome_id": [1, 1, 1], "tf": ["lexa"] * 3, "operon_id": [10, 10, 11],
                      "neg_log10_p": [5.2, 7.9, 6.0], "motif_id": [1, 2, 3]})
    out = bl.collapse(h)
    assert list(out.columns) == KEY + ["neg_log10_p"]
    assert len(out) == 2
    assert out.set_index("operon_id").loc[10, "neg_log10_p"] == 7.9


def test_variant_hits_respects_tier_ceiling():
    h = pd.DataFrame({"tier": ["within_genus", "same_order", "within_class", "same_class", "cross_phylum"]})
    assert len(bl.variant_hits(h, "scan")) == 5                                   # sin filtro de tier
    assert list(bl.variant_hits(h, "order_ceiling")["tier"]) == ["within_genus", "same_order"]
    assert list(bl.variant_hits(h, "class_ceiling")["tier"]) == ["within_genus", "same_order",
                                                                  "within_class", "same_class"]


def test_ceilings_follow_tier_order():
    """Los techos son prefijos de TIERS (de más cercano a más lejano): order_ceiling está dentro de class_ceiling."""
    assert bl.CEILINGS["order_ceiling"][-1] == "same_order"
    assert bl.CEILINGS["class_ceiling"][-1] == "same_class"
    assert set(bl.CEILINGS["order_ceiling"]) < set(bl.CEILINGS["class_ceiling"]) < set(TIERS)


def test_compare_edges_exact_and_not_exact():
    a = pd.DataFrame({"genome_id": [1, 1, 2], "motif_id": [5, 6, 5], "operon_id": [10, 11, 10]})
    assert bl.compare_edges(a, a.iloc[::-1]) == (3, 3, 3, True)                   # el orden no importa
    b = pd.concat([a, pd.DataFrame({"genome_id": [3], "motif_id": [5], "operon_id": [12]})])
    assert bl.compare_edges(a, b) == (3, 4, 3, False)                             # b tiene una arista de más
    assert bl.compare_edges(a, a.iloc[:2]) == (3, 2, 2, False)                    # b tiene una de menos


# ---------------------------------------------------------------- comparación entre taxones
def test_epsilon_sq_matches_scipy_kruskal():
    values = pd.Series([1, 2, 3, 4, 10, 11, 12, 13, 20, 21, 22, 23], dtype=float)
    groups = pd.Series(["a"] * 4 + ["b"] * 4 + ["c"] * 4)
    h, p, eps = cmp.kruskal(values, groups)
    ref = stats.kruskal([1, 2, 3, 4], [10, 11, 12, 13], [20, 21, 22, 23])
    assert h == pytest.approx(ref.statistic) and p == pytest.approx(ref.pvalue)
    assert eps == pytest.approx((ref.statistic - 3 + 1) / (12 - 3))              # 0,872 en este caso


def test_kruskal_undefined_cases_return_nan():
    one_group = cmp.kruskal(pd.Series([1.0, 2.0, 3.0]), pd.Series(["a", "a", "a"]))
    constant = cmp.kruskal(pd.Series([5.0] * 6), pd.Series(["a"] * 3 + ["b"] * 3))
    assert all(math.isnan(x) for x in one_group + constant)
    assert math.isnan(cmp.epsilon_sq(4.0, 3, 3))                                  # n <= k


def test_kruskal_ignores_missing_values():
    values = pd.Series([1.0, 2.0, np.nan, 10.0, 11.0, np.nan])
    groups = pd.Series(["a", "a", "a", "b", "b", "b"])
    h, _, eps = cmp.kruskal(values, groups)
    assert h == pytest.approx(stats.kruskal([1, 2], [10, 11]).statistic)
    assert eps == pytest.approx(cmp.epsilon_sq(h, 4, 2))


def test_spearman_undefined_cases_return_nan():
    assert math.isnan(cmp.spearman(pd.Series([1, 2]), pd.Series([2, 1])))           # menos de 3 datos
    assert math.isnan(cmp.spearman(pd.Series([1, 2, 3]), pd.Series([4, 4, 4])))     # constante
    assert cmp.spearman(pd.Series([1, 2, 3, 4]), pd.Series([10, 20, 30, 40])) == pytest.approx(1.0)


@pytest.mark.parametrize("metric, rho, expected", [
    ("n_tf", 0.85, "high"),               # límite inferior incluido
    ("n_tf", 0.849, "moderate"),
    ("n_tf", 0.60, "moderate"),
    ("n_tf", 0.599, "low"),
    ("n_tf", float("nan"), "undefined"),
    ("density", 0.99, "different_definition"),   # la density externa usa otra definición
])
def test_agreement_thresholds(metric, rho, expected):
    assert cmp.agreement(metric, rho) == expected


# ---------------------------------------------------------------- robustez
def test_nesting_share_between_networks():
    big = pd.DataFrame({"genome_id": [1, 1, 1, 2], "tf": ["a", "a", "b", "a"], "operon_id": [1, 2, 3, 1]})
    sub = big.iloc[[0, 3]]
    out = rob.nesting({3: big, 1: sub}).set_index(["from_network_id", "to_network_id"])
    assert out.loc[(1, 3), "share_in_to"] == pytest.approx(1.0)      # validated contenida en balanced
    assert out.loc[(3, 1), "share_in_to"] == pytest.approx(0.5)      # 2 de los 4 pares de balanced
    assert out.loc[(3, 3), "share_in_to"] == pytest.approx(1.0)
    assert out.loc[(1, 3), "from_network"] == "validated" and out.loc[(1, 3), "pairs_from"] == 2


@pytest.mark.parametrize("rho, expected", [(0.90, "robust"), (0.70, "moderate"), (0.6999, "not_robust")])
def test_robustness_class_borders(rho, expected):
    assert rob.robustness_class(rho) == expected


def test_subsample_extreme_rates():
    p = pd.DataFrame({"tf": list("aabbc"), "confidence": [0.1, 0.9, 0.5, 0.3, 0.7]})
    rng = np.random.default_rng(0)
    assert len(rob.subsample(p, 0.0, "random", rng)) == 5            # sin eliminar nada
    assert rob.subsample(p, 1.0, "random", rng).empty               # eliminar todo
    assert rob.subsample(p, 0.95, "low_confidence", rng).empty      # round(5 * 0,05) = 0 aristas

"""Pruebas unitarias de funciones puras (no necesitan data/: corren también en un clon limpio).

Las pruebas de tests/test_api_*.py, en cambio, se omiten si faltan los resultados;
`make check` muestra cuántas se omitieron (pytest -rs).
"""
import numpy as np
import pandas as pd
import pytest

from src.atlas_common import is_atlas_selection, norm_locus, norm_tf
from src.networks.atlas_comparison import agreement, epsilon_sq
from src.networks.atlas_metrics import genome_metrics, gini, norm_entropy
from src.networks.atlas_robustness import robustness_class, subsample
from src.validation.atlas import f1, safe_div


# ---------------------------------------------------------------- normalización
def test_norm_tf():
    s = pd.Series([" LexA ", "lexa", "", None])
    out = norm_tf(s)
    assert out.iloc[0] == out.iloc[1] == "lexa"
    assert out.iloc[2:].isna().all()


def test_norm_locus_removes_gene_prefix():
    out = norm_locus(pd.Series(["gene-b0001", "GENE_b0002", "b0003 ", ""]))
    assert list(out.iloc[:3]) == ["B0001", "B0002", "B0003"]
    assert pd.isna(out.iloc[3])


def test_atlas_selection_uses_first_word():
    """Regresión del error C2 (semana 11): el genoma replacement lleva una nota en selection."""
    s = pd.Series(["representative", "forced", "replacement (GCF_050942165.1 suppressed in RefSeq 2026)",
                   "regprecise_source", "chromosome_level", None])
    assert list(is_atlas_selection(s)) == [True, True, True, False, False, False]


# ---------------------------------------------------------------- métricas
def test_gini_and_entropy():
    assert gini([5, 5, 5, 5]) == pytest.approx(0.0)
    assert gini([0, 0, 0, 10]) == pytest.approx(0.75)
    assert norm_entropy([3, 3, 3]) == pytest.approx(1.0)
    assert np.isnan(norm_entropy([4]))  # un solo TF: no definida


def test_genome_metrics_toy_graph():
    # TF a -> operones 1, 2, 3; TF b -> operón 3
    p = pd.DataFrame({"tf": ["a", "a", "a", "b"], "operon_id": [1, 2, 3, 3]})
    operon_size = pd.Series({1: 2, 2: 1, 3: 3})
    m = genome_metrics(p, n_genes=60, operon_size=operon_size, tf_ops={})
    assert (m["n_tf"], m["n_targets"], m["n_edges"]) == (2, 3, 4)
    assert m["density"] == pytest.approx(4 / 6)
    assert m["frac_multi_reg"] == pytest.approx(1 / 3)  # solo el operón 3 tiene dos TF
    assert m["n_target_genes"] == 6 and m["frac_genome_targeted"] == pytest.approx(0.1)
    assert m["max_out_degree"] == 3 and m["hub_share"] == pytest.approx(0.75)
    assert m["n_components"] == 1


# ---------------------------------------------------------------- comparación entre taxones
def test_epsilon_sq_and_agreement():
    assert epsilon_sq(h=10.0, n=100, k=5) == pytest.approx((10 - 5 + 1) / 95)
    assert np.isnan(epsilon_sq(h=1.0, n=3, k=3))
    assert agreement("n_edges", 0.9) == "high"
    assert agreement("n_edges", 0.7) == "moderate"
    assert agreement("n_edges", 0.2) == "low"
    assert agreement("density", 0.99) == "different_definition"
    assert agreement("n_tf", float("nan")) == "undefined"


# ---------------------------------------------------------------- robustez
@pytest.fixture
def pairs():
    return pd.DataFrame({"tf": ["a"] * 6 + ["b"] * 2 + ["c"] * 2,
                         "operon_id": range(10),
                         "confidence": np.linspace(0.1, 1.0, 10)})


@pytest.mark.parametrize("strategy", ["random", "degree_biased", "low_confidence"])
def test_subsample_removes_fixed_share(pairs, strategy):
    rng = np.random.default_rng(0)
    for rate, kept in [(0.1, 9), (0.5, 5), (0.75, 2)]:
        q = subsample(pairs, rate, strategy, rng)
        assert len(q) == kept  # por eso n_edges es "trivial" en las tres estrategias
        assert set(q["operon_id"]) <= set(pairs["operon_id"])


def test_low_confidence_keeps_the_most_confident(pairs):
    q = subsample(pairs, 0.5, "low_confidence", np.random.default_rng(0))
    assert sorted(q["confidence"]) == sorted(pairs["confidence"].nlargest(5))


def test_degree_biased_removes_hub_edges_first(pairs):
    rng = np.random.default_rng(1)
    hub_share = np.mean([(subsample(pairs, 0.5, "degree_biased", rng)["tf"] == "a").mean() for _ in range(200)])
    rnd_share = np.mean([(subsample(pairs, 0.5, "random", rng)["tf"] == "a").mean() for _ in range(200)])
    assert hub_share < rnd_share  # el TF con más dianas pierde más aristas


def test_robustness_class():
    assert robustness_class(0.95) == "robust"
    assert robustness_class(0.8) == "moderate"
    assert robustness_class(0.5) == "not_robust"
    assert robustness_class(float("nan")) == "undefined"


# ---------------------------------------------------------------- validación
def test_safe_div_and_f1():
    assert safe_div(1, 0) != safe_div(1, 0)  # NaN
    assert f1(0.612, 0.332) == pytest.approx(0.4305, abs=1e-4)
    assert np.isnan(f1(0.0, 0.0))

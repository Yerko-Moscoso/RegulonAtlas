"""Revisión previa de `make atlas` / `make all` (scripts/check_atlas_ready.sh).

Se prueba en un repositorio git temporal con una caché falsa (archivos vacíos de 1 byte), sin tocar el proyecto.
"""
import shutil
import subprocess
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "check_atlas_ready.sh"
CACHE_FILES = [
    "manifest.json", "networks.parquet", "genomes.parquet", "motifs.parquet", "curated_regulons.parquet",
    "regprecise_genome_map.parquet", "genes_validation.parquet", "network_metrics.parquet", "provenance.parquet",
    *[f"edges_net{i}.parquet" for i in range(1, 6)],
    "genes_all.parquet",
    "fimo_hits_validation.parquet", "transfer_map_validation.parquet", "validation_genomes.tsv",
]

pytestmark = pytest.mark.skipif(shutil.which("git") is None, reason="requiere git")


def _git(repo, *args):
    subprocess.run(["git", *args], cwd=repo, check=True, capture_output=True)


@pytest.fixture
def repo(tmp_path):
    _git(tmp_path, "init", "-q")
    (tmp_path / "codigo.py").write_text("x = 1\n")
    _git(tmp_path, "add", "codigo.py")
    _git(tmp_path, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "inicio")
    return tmp_path


def _cache(repo, skip=()):
    cache = repo / "data" / "cache" / "atlas"
    cache.mkdir(parents=True)
    for f in CACHE_FILES:
        if f not in skip:
            (cache / f).write_text("x")


def _run(repo):
    return subprocess.run(["bash", str(SCRIPT)], cwd=repo, capture_output=True, text=True)


def test_ok_with_full_cache_and_clean_tree(repo):
    _cache(repo)
    r = _run(repo)
    assert r.returncode == 0, r.stdout
    assert "se puede correr" in r.stdout


def test_stops_when_cache_is_missing(repo):
    r = _run(repo)
    assert r.returncode == 1
    for regla in ("cache-atlas", "cache-genes", "cache-fimo"):
        assert f"make {regla}" in r.stdout


def test_names_the_missing_file_and_its_rule(repo):
    _cache(repo, skip={"fimo_hits_validation.parquet"})
    r = _run(repo)
    assert r.returncode == 1
    assert "make cache-fimo" in r.stdout and "fimo_hits_validation.parquet" in r.stdout
    assert "make cache-atlas" not in r.stdout


def test_stops_with_uncommitted_changes(repo):
    _cache(repo)
    (repo / "codigo.py").write_text("x = 2\n")
    r = _run(repo)
    assert r.returncode == 1
    assert "cambios sin commit" in r.stdout and "codigo.py" in r.stdout


def test_untracked_files_do_not_block(repo):
    # data/ no se versiona: archivos nuevos sin seguimiento no cuentan como cambios.
    _cache(repo)
    (repo / "nuevo.txt").write_text("y")
    assert _run(repo).returncode == 0

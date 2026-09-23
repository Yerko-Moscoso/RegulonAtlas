"""
Organismo de origen de cada motivo (dónde se definió la PWM).

  RegPrecise  RG<n> es el regulog n; sus genomas salen de curated_regulons
              + regprecise_genome_map.
  Resto       source_taxon contra regprecise_genome_map o ncbi_organism.

Lo usan export_cache.py (para saber qué genomas de origen incluir en el
caché) y build_transfer_map.py (reglas source_genome y ortholog).
"""
from __future__ import annotations

import re
from collections import defaultdict

import pandas as pd

# Palabras que no identifican un organismo al comparar nombres de taxón.
_TAXON_STOPWORDS = {"STR", "SUBSTR", "SUBSP", "SEROVAR", "SV", "STRAIN", "PV", "BV", "BIOVAR"}


def taxon_tokens(name) -> set[str]:
    """'Escherichia coli str. K-12 substr. MG1655' -> {ESCHERICHIA, COLI, K12, MG1655}."""
    if name is None or (isinstance(name, float) and pd.isna(name)) or not str(name).strip():
        return set()
    raw = str(name).upper().replace("-", "")
    return {t for t in re.split(r"[^A-Z0-9]+", raw) if t and t not in _TAXON_STOPWORDS}


def regulog_accessions(regulogs: pd.DataFrame) -> dict[int, set[str]]:
    """DataFrame (regulog_id, accession) -> {regulog_id: {accession}}."""
    out = defaultdict(set)
    for rid, acc in regulogs[["regulog_id", "accession"]].itertuples(index=False):
        if pd.notna(acc):
            out[int(rid)].add(acc)
    return out


def build_source_resolver(genomes: pd.DataFrame, regulog_accs: dict, rp_name_acc: dict):
    genome_tokens = [
        (acc, taxon_tokens(org))
        for acc, org in genomes[["accession", "ncbi_organism"]].itertuples(index=False)
    ]
    cache: dict = {}

    def by_taxon(source_taxon) -> set[str]:
        if source_taxon is None or (isinstance(source_taxon, float) and pd.isna(source_taxon)):
            return set()
        if source_taxon in cache:
            return cache[source_taxon]
        if source_taxon in rp_name_acc:
            found = {rp_name_acc[source_taxon]}
        else:
            toks = taxon_tokens(source_taxon)
            # Al menos género + especie, para no asociar por un solo token.
            found = {acc for acc, gt in genome_tokens if len(toks) >= 2 and toks <= gt}
        cache[source_taxon] = found
        return found

    def resolve(motif_key, source, source_taxon) -> tuple[set[str], str]:
        if str(source).lower() == "regprecise":
            m = re.match(r"^RG_?(\d+)$", str(motif_key))
            if m and int(m.group(1)) in regulog_accs:
                return set(regulog_accs[int(m.group(1))]), "regulog"
        found = by_taxon(source_taxon)
        return (found, "source_taxon") if found else (set(), "unresolved")

    return resolve

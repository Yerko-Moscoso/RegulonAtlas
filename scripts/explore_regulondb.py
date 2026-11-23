#!/usr/bin/env python
"""Exploración previa a la validación con RegulonDB (excepción E5): tipos de regulador, mapeo y alias de TF.

Los alias de REGULONDB_ALIASES (src/validation/atlas.py) salen de esta salida: nombres de TF de las redes de E. coli
que no están en RegulonDB como regulador, pero sí como sinónimo del gen o producto de un regulador.

Uso (después de make regulondb): PYTHONPATH=. python scripts/explore_regulondb.py
"""
import pandas as pd

from src.atlas_common import NETWORKS, load, norm_tf

ECOLI_ID = 1869


def main():
    net = pd.read_csv("data/raw/regulondb/NetworkRegulatorGene.tsv", sep="\t", keep_default_na=False)
    net.columns = ["rid", "regulator", "regulator_gene", "gene_id", "gene", "function", "level"]
    ids = pd.read_csv("data/raw/regulondb/GeneProductAllIdentifiersSet.tsv", sep="\t", keep_default_na=False)
    ids.columns = ["gene_id", "name", "left", "right", "strand", "syn", "db", "pid", "pname", "psyn", "pdb"]
    print("Filas por tipo de regulador:\n", net["rid"].str[:11].value_counts().to_string())
    print("Filas por nivel de confianza:\n", net["level"].value_counts().to_string())
    tf = net[net["rid"].str.startswith("RDBECOLITFC")]
    atlas = set()
    for k in NETWORKS:
        e = load(f"edges_net{k}", ["genome_id", "tf_name"])
        atlas |= set(norm_tf(e.loc[e["genome_id"] == ECOLI_ID, "tf_name"]).dropna())
    regulators = set(tf["regulator"].str.lower())
    synonyms = {}
    for reg, genes in tf[["regulator", "regulator_gene"]].drop_duplicates().to_numpy():
        for g in str(genes).split(";"):
            for _, r in ids[ids["name"] == g].iterrows():
                for v in [r["name"], *r["syn"].split(","), *r["psyn"].split(",")]:
                    synonyms.setdefault(v.strip().lower(), set()).add(reg)
    print(f"TF del atlas en E. coli: {len(atlas)}; reguladores TF: {len(regulators)}; "
          f"mismo nombre: {len(atlas & regulators)}")
    print("Candidatos a alias (nombre del atlas -> regulador):")
    for name in sorted(atlas - regulators):
        parts = name.replace("/", "-").split("-")
        hits = set().union(*[synonyms.get(p, set()) for p in [name, *parts]])
        if hits:
            print(f"  {name} -> {sorted(hits)}")


if __name__ == "__main__":
    main()

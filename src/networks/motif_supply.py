"""Oferta de motivos por genoma: cuántos motivos tienen un genoma de origen en su mismo taxón.

Se movió desde scripts/explore_motif_origin.py (semana 11, sección 8.5 de metricas_semana11.md) para que el
análisis ajustado (src/networks/atlas_adjusted.py) use exactamente la misma definición.
"""
from pathlib import Path

import pandas as pd

CACHE = Path("data/cache/atlas")
LEVELS = ["gtdb_family", "gtdb_order", "gtdb_class", "gtdb_phylum"]


def source_genomes(motifs, genomes):
    """(motif_id, genome_id de origen) para todos los motivos."""
    cur = pd.read_parquet(CACHE / "curated_regulons.parquet", columns=["regulog_id", "genome_name"])
    gmap = pd.read_parquet(CACHE / "regprecise_genome_map.parquet", columns=["genome_name", "accession"])
    acc = genomes[["genome_id", "accession"]]

    rg = motifs[motifs["source"] == "regprecise"].copy()
    rg["regulog_id"] = rg["motif_key"].str.extract(r"RG(\d+)")[0].astype("int64")
    cur = cur.drop_duplicates().assign(regulog_id=lambda d: d["regulog_id"].astype("int64"))
    rg = (rg[["motif_id", "regulog_id"]].merge(cur, on="regulog_id")
          .merge(gmap, on="genome_name").merge(acc, on="accession"))[["motif_id", "genome_id"]]
    rg["how"] = "regulog"

    mx = motifs[motifs["source"] == "prodoric"][["motif_id", "source_taxon"]].copy()
    org = genomes[["genome_id", "ncbi_organism"]].dropna()
    org = org.assign(species=org["ncbi_organism"].str.split().str[:2].str.join(" "),
                     genus=org["ncbi_organism"].str.split().str[0])
    mx["species"] = mx["source_taxon"].str.split().str[:2].str.join(" ")
    mx["genus"] = mx["source_taxon"].str.split().str[0]
    by_sp = mx.merge(org[["genome_id", "species"]], on="species")[["motif_id", "genome_id"]].assign(how="species")
    rest = mx[~mx["motif_id"].isin(by_sp["motif_id"])]
    by_gen = rest.merge(org[["genome_id", "genus"]], on="genus")[["motif_id", "genome_id"]].assign(how="genus")
    return pd.concat([rg, by_sp, by_gen], ignore_index=True).drop_duplicates(["motif_id", "genome_id"])


def supply(src, genomes, atlas):
    """Motivos con al menos un genoma de origen en el mismo taxón que cada genoma del atlas."""
    tax = genomes.set_index("genome_id")[LEVELS]
    s = src.join(tax, on="genome_id")
    out = atlas[["genome_id"] + LEVELS].copy()
    for lv in LEVELS:
        per_taxon = s.dropna(subset=[lv]).groupby(lv)["motif_id"].nunique()
        out[f"supply_{lv.removeprefix('gtdb_')}"] = out[lv].map(per_taxon).fillna(0).astype("int64")
    return out

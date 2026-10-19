#!/usr/bin/env python
"""¿El tamaño de la red por taxón refleja el origen de los motivos? (semana 11, hipótesis H1)

En metricas_semana11.md (hallazgo 3) el taxón explica entre ~40 % (filo) y >70 % (familia)
del número de TF por genoma. Hipótesis: parte de ese efecto es metodológico. Los motivos
se transfieren por cercanía taxonómica (D13), así que los genomas cercanos a los organismos
de origen de los motivos (los modelos de PRODORIC y RegPrecise) reciben más TF.

Pasos:
  1. Ubicar los genomas de origen de cada motivo en la taxonomía GTDB:
     - RegPrecise (RGnnn): regulog nnn -> genomas del regulog (curated_regulons)
       -> accesión (regprecise_genome_map) -> genomes.
     - PRODORIC (MX...): source_taxon por especie (dos primeras palabras) contra
       genomes.ncbi_organism; si no, por género.
  2. Oferta de motivos de cada genoma del atlas: número de motivos con al menos un genoma
     de origen en su misma familia, orden, clase y filo GTDB.
  3. Por filo: mediana de TF frente a mediana de la oferta (Spearman).
  4. Regresión lineal (genomas del atlas con aristas), y = log1p(n_tf):
       filo solo  |  tamaño del genoma  |  tamaño + oferta  |  tamaño + oferta + filo
     El R² que el filo agrega al final es lo que la oferta y el tamaño no explican.

Uso (desde ~/proyecto, después de make metrics-atlas):
    PYTHONPATH=. python scripts/explore_motif_origin.py
Salidas:
    data/audit/motif_origin_sources.tsv      genomas de origen por motivo
    data/audit/motif_origin_supply.tsv       oferta por genoma del atlas
    data/audit/motif_origin_phylum.tsv       medianas por filo (balanced)
    data/audit/motif_origin_r2.tsv           R² de los modelos por red y variable
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import statsmodels.formula.api as smf
from scipy import stats

CACHE = Path("data/cache/atlas")
METRICS = Path("data/results/metrics/atlas_metrics.parquet")
OUT = Path("data/audit")
NETWORKS = {1: "validated", 2: "high-precision", 3: "balanced", 4: "permissive", 5: "no-footprint"}
LEVELS = ["gtdb_family", "gtdb_order", "gtdb_class", "gtdb_phylum"]
MIN_PHYLUM = 5


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


def r2_table(df, y):
    d = df.copy()
    big = d["gtdb_phylum"].map(d["gtdb_phylum"].value_counts()) >= MIN_PHYLUM
    d["phylum"] = d["gtdb_phylum"].where(big, "Other")
    d["y"] = np.log1p(d[y])
    d["log_genes"] = np.log(d["n_genes"])
    for c in ("supply_family", "supply_order", "supply_class"):
        d[f"l_{c}"] = np.log1p(d[c])
    supply_terms = "l_supply_family + l_supply_order + l_supply_class"
    models = {
        "phylum": "y ~ C(phylum)",
        "genome_size": "y ~ log_genes",
        "supply": f"y ~ {supply_terms}",
        "size_supply": f"y ~ log_genes + {supply_terms}",
        "size_supply_phylum": f"y ~ log_genes + {supply_terms} + C(phylum)",
    }
    r2 = {k: smf.ols(f, data=d).fit().rsquared for k, f in models.items()}
    r2["phylum_added"] = r2["size_supply_phylum"] - r2["size_supply"]
    r2["phylum_explained_share"] = 1 - r2["phylum_added"] / r2["phylum"] if r2["phylum"] > 0 else float("nan")
    r2["genomes"] = len(d)
    return r2


def main():
    if not METRICS.exists():
        sys.exit(f"Falta {METRICS}. Ejecuta make metrics-atlas primero.")
    OUT.mkdir(parents=True, exist_ok=True)
    motifs = pd.read_parquet(CACHE / "motifs.parquet", columns=["motif_id", "motif_key", "source", "source_taxon"])
    genomes = pd.read_parquet(CACHE / "genomes.parquet")
    genomes["genome_id"] = genomes["genome_id"].astype("int64")

    # 1. Origen de los motivos
    src = source_genomes(motifs, genomes)
    src.to_csv(OUT / "motif_origin_sources.tsv", sep="\t", index=False)
    located = motifs.merge(src.groupby("motif_id")["how"].first().rename("how"), on="motif_id", how="left")
    print("== 1. Motivos con genoma de origen ubicado en GTDB ==")
    print(located.groupby("source")["how"].apply(lambda h: f"{h.notna().mean():.1%} de {len(h)}").to_string())
    print(located["how"].value_counts(dropna=False).to_string())
    src_tax = src.merge(genomes[["genome_id", "gtdb_phylum"]], on="genome_id")
    print("\nMotivos por filo de origen (un motivo cuenta en cada filo de sus genomas de origen):")
    print(src_tax.groupby("gtdb_phylum")["motif_id"].nunique().sort_values(ascending=False).head(12).to_string())

    # 2. Oferta por genoma del atlas
    m = pd.read_parquet(METRICS)
    atlas_ids = m.loc[m["in_atlas"], "genome_id"].unique()
    atlas = genomes[genomes["genome_id"].isin(atlas_ids)]
    sup = supply(src, genomes, atlas)
    sup.to_csv(OUT / "motif_origin_supply.tsv", sep="\t", index=False)

    # 3. Por filo, balanced
    b = m[(m["network_id"] == 3) & m["in_atlas"] & m["has_edges"]].merge(
        sup.drop(columns=LEVELS), on="genome_id")
    ph = b.groupby("gtdb_phylum").agg(genomes=("genome_id", "size"), median_tf=("n_tf", "median"),
                                      median_supply_order=("supply_order", "median"),
                                      median_supply_phylum=("supply_phylum", "median"))
    ph = ph[ph["genomes"] >= MIN_PHYLUM].sort_values("median_tf", ascending=False)
    ph.to_csv(OUT / "motif_origin_phylum.tsv", sep="\t")
    print("\n== 3. balanced, por filo (>= 5 genomas) ==")
    print(ph.to_string())
    for c in ("median_supply_order", "median_supply_phylum"):
        print(f"Spearman mediana TF vs {c}: {stats.spearmanr(ph['median_tf'], ph[c]).statistic:.3f}")

    # Dentro de cada filo grande: ¿más oferta cercana -> más TF?
    print("\nSpearman n_tf vs supply_order dentro de cada filo (balanced):")
    for p, g in b.groupby("gtdb_phylum"):
        if len(g) >= 30:
            print(f"  {p:18s} n={len(g):4d}  rho={stats.spearmanr(g['n_tf'], g['supply_order']).statistic:.3f}")

    # 4. Regresiones
    rows = []
    for net_id in NETWORKS:
        d = m[(m["network_id"] == net_id) & m["in_atlas"] & m["has_edges"]].merge(
            sup.drop(columns=LEVELS), on="genome_id")
        for y in ("n_tf", "n_edges"):
            rows.append({"network_id": net_id, "network": NETWORKS[net_id], "y": y, **r2_table(d, y)})
    r2 = pd.DataFrame(rows)
    r2.to_csv(OUT / "motif_origin_r2.tsv", sep="\t", index=False)
    print("\n== 4. R² (y = log1p(n_tf)), genomas del atlas con aristas ==")
    show = ["network", "genomes", "phylum", "genome_size", "supply", "size_supply", "size_supply_phylum",
            "phylum_added", "phylum_explained_share"]
    print(r2[r2["y"] == "n_tf"][show].to_string(index=False, float_format=lambda x: f"{x:.3f}"))
    print("\n== 4b. R² (y = log1p(n_edges)) ==")
    print(r2[r2["y"] == "n_edges"][show].to_string(index=False, float_format=lambda x: f"{x:.3f}"))


if __name__ == "__main__":
    main()

import pandas as pd

df = pd.read_csv("data/processed/curated/prodoric/motifs_prodoric.tsv", sep="\t")

assert df["motif_key"].is_unique, "motif_key duplicado"
assert df[["motif_key", "source", "tf_name", "source_taxon", "length", "consensus"]].isna().sum().sum() == 0, "Campos obligatorios con NULL"
assert (df["length"] == df["consensus"].str.len()).all(), "length no coincide con el largo del consensus"

print(f"CHECKPOINT 3 PASADO: {len(df)} motivos válidos de {df['source_taxon'].nunique()} taxones en PRODORIC.")
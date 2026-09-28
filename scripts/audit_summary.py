import pandas as pd

df = pd.read_csv("data/audit/fimo_coverage.tsv", sep="\t")
df["con_hits"] = df.n_hits > 0

print(df.groupby("selection").agg(genomas=("genome_id", "size"),
                                  con_hits=("con_hits", "sum"),
                                  hits_total=("n_hits", "sum")))
print("\nTotal hits:", df.n_hits.sum())
print("min -log10(p):", df.min_nlp.min(), "| max hit_stop:", df.max_stop.max())
print("Hits por umbral: 1e-6 =", df.n_1e6.sum(),
      "| 1e-7 =", df.n_1e7.sum(), "| 1e-8 =", df.n_1e8.sum())
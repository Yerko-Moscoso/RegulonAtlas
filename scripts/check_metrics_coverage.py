"""Compara network_metrics con lo que realmente hay en edges (caché del atlas)."""
import pandas as pd

C = "data/cache/atlas/"
nm = pd.read_parquet(C + "network_metrics.parquet")
genomas = pd.read_parquet(C + "genomes.parquet").set_index("genome_id")

for nid in range(1, 6):
    e = pd.read_parquet(C + f"edges_net{nid}.parquet",
                        columns=["genome_id", "tf_name", "target_operon"])
    por_genoma = e.groupby("genome_id").size()
    con_metricas = set(nm[nm.network_id == nid].genome_id)
    sin = por_genoma[~por_genoma.index.isin(con_metricas)]

    print(f"Red {nid}: {len(por_genoma)} con aristas, {len(con_metricas)} con métricas, "
          f"{len(sin)} sin métricas")
    if len(sin):
        print("   selection:", genomas.loc[sin.index, "selection"].value_counts().to_dict())
        print(f"   aristas de los sin métricas: mediana {sin.median():.0f}, máx {sin.max()}")

# E. coli K-12 en balanced: qué cuenta network_metrics vs qué hay en edges
m = nm[(nm.network_id == 3) & (nm.genome_id == 1869)].iloc[0]
e = pd.read_parquet(C + "edges_net3.parquet")
e = e[e.genome_id == 1869]
print("\nE. coli K-12, red balanced")
print(f"  network_metrics: n_tf={m.n_tf}, n_targets={m.n_targets}, n_edges={m.n_edges}")
print(f"  edges: filas={len(e)}, TF únicos={e.tf_name.nunique()}, motivos={e.motif_id.nunique()}, "
      f"operones={e.target_operon.nunique()}, pares TF-operón={len(e.drop_duplicates(['tf_name', 'target_operon']))}")
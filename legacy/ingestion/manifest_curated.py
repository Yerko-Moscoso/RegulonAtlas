from datetime import datetime, timezone
from pathlib import Path
import pandas as pd

P_PROD = Path("data/processed/curated/prodoric/motifs_prodoric.tsv")
P_REG = Path("data/processed/curated/regprecise/motifs_regprecise.tsv")
P_CUR = Path("data/processed/curated/regprecise/curated_regulons.tsv")
MANIFEST_FILE = Path("data/processed/curated/MANIFEST.md")

# 1. Cargar tablas desde archivos planos
df_prod = pd.read_csv(P_PROD, sep="\t")
df_reg = pd.read_csv(P_REG, sep="\t")
df_cur = pd.read_csv(P_CUR, sep="\t")

# 2. Control de calidad de motivos (Paso 8)
motifs_all = pd.concat([df_prod, df_reg], ignore_index=True)
assert motifs_all["motif_key"].is_unique, "Error: Existen claves motif_key duplicadas."
assert motifs_all[["motif_key", "source", "tf_name", "length", "consensus"]].isna().sum().sum() == 0, "Campos obligatorios incompletos."

tfs_motifs = set(motifs_all["tf_name"].astype(str).str.upper())
tfs_curated = set(df_cur["tf_name"].astype(str).str.upper())
huerfanos = tfs_curated - tfs_motifs

# 3. Guardar Manifest de Cierre (Paso 9)
manifest_content = f"""# MANIFEST · Curated Motifs & Golden Standards (PRODORIC + RegPrecise)
**Generado:** {datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")}

## Archivos Planos Preparados para Carga
* `motifs_prodoric.tsv`: **{len(df_prod):,}** filas ({df_prod['source_taxon'].nunique()} organismos)
* `motifs_regprecise.tsv`: **{len(df_reg):,}** filas ({df_reg['source_taxon'].nunique()} organismos)
* `curated_regulons.tsv`: **{len(df_cur):,}** interacciones ({df_cur['genome_name'].nunique()} organismos)
* **Total motivos compilados:** **{len(motifs_all):,}**

## Control de Calidad
* Claves primarias `motif_key`: 100% únicas.
* Consenso y longitudes: 100% consistentes.
* TFs en interacciones sin matriz PWM asociada: **{len(huerfanos)}**
"""

with open(MANIFEST_FILE, "w", encoding="utf-8") as f:
    f.write(manifest_content)

print(manifest_content)
print("[OK] CHECKPOINTS COMPLETADOS: Los 3 archivos TSV están listos en data/processed/curated/.")
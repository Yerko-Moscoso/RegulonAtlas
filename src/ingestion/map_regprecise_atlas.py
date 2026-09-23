import re
from pathlib import Path
from bs4 import BeautifulSoup
import pandas as pd
from tqdm import tqdm
import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

RAW_DIR = Path("data/raw/regprecise")
PAGES_DIR = RAW_DIR / "pages"
REG_RAW_FILE = Path("data/processed/curated/regprecise/curated_regulons_raw.tsv")
MOTIFS_FILE = Path("data/processed/curated/regprecise/motifs_regprecise.tsv")

ATLAS_FILE = Path("data/gtdb/selected_genomes.tsv")
if not ATLAS_FILE.exists():
    ATLAS_FILE = Path("data/raw/genomes/selected_genomes.tsv")

QC_DIR = Path("data/processed/curated/_qc")
OUT_REGULONS = Path("data/processed/curated/regprecise/curated_regulons.tsv")

QC_DIR.mkdir(parents=True, exist_ok=True)

# 1. Mapeo directo: Archivo HTML -> (regulon_id, tf_name, organism)
regulon_meta = {}
html_files = list(PAGES_DIR.glob("*.html"))

for p in tqdm(html_files, desc="Extrayendo metadatos desde archivos HTML"):
    id_m = re.search(r"regulon_id_(\d+)_", p.name)
    if not id_m:
        continue
    
    rid = id_m.group(1)

    try:
        with open(p, "r", encoding="utf-8", errors="ignore") as f:
            soup = BeautifulSoup(f.read(), "html.parser")
        
        title = soup.find("title")
        if not title:
            continue
        
        t_text = title.text.strip()
        m = re.search(r"Regulon of\s+([A-Za-z0-9_().-]+)\s+in\s+([^.<>\n\r]+)", t_text)
        if m:
            regulon_meta[rid] = {
                "tf_name": m.group(1).strip(),
                "genome_name": m.group(2).strip()
            }
    except Exception:
        pass

print(f"[*] Regulones mapeados a su organismo real: {len(regulon_meta):,}")

# 2. Actualizar tablas de regulones y motivos
df_curated = pd.read_csv(REG_RAW_FILE, sep="\t", dtype=str)
df_motifs = pd.read_csv(MOTIFS_FILE, sep="\t", dtype=str)

for idx, row in df_curated.iterrows():
    rid = str(row["regulog_id"])
    if rid in regulon_meta:
        df_curated.at[idx, "genome_name"] = regulon_meta[rid]["genome_name"]
        df_curated.at[idx, "tf_name"] = regulon_meta[rid]["tf_name"]

for idx, row in df_motifs.iterrows():
    rid = str(row["motif_key"]).replace("RG_", "")
    if rid in regulon_meta:
        df_motifs.at[idx, "source_taxon"] = regulon_meta[rid]["genome_name"]
        df_motifs.at[idx, "tf_name"] = regulon_meta[rid]["tf_name"]

df_motifs.to_csv(MOTIFS_FILE, sep="\t", index=False)

load_dotenv()
engine = create_engine(
    f"mysql+pymysql://{os.getenv('DB_USER')}:{os.getenv('DB_PASSWORD')}"
    f"@{os.getenv('DB_HOST')}/{os.getenv('DB_NAME', 'regulon_atlas')}"
)

# 3. Cruce contra el mapeo RegPrecise -> Atlas ya resuelto en MariaDB
map_query = text("""
    SELECT rgm.genome_name, rgm.accession
    FROM regprecise_genome_map rgm
    JOIN genomes g ON g.accession = rgm.accession
""")
with engine.connect() as conn:
    genome_map = pd.read_sql(map_query, conn)

merged = df_curated.merge(genome_map, on="genome_name", how="left")
matched = merged[merged["accession"].notna()]
matched_count = len(matched)

unmatched = merged[merged["accession"].isna()][["genome_name"]].drop_duplicates()
unmatched.to_csv(QC_DIR / "regprecise_sin_match.tsv", sep="\t", index=False)

cols_to_save = ["regulog_id", "genome_name", "locus_tag", "tf_name", "gene_name", "accession"]
df_curated_final = merged[cols_to_save + ["genome_name"]] if "accession" not in df_curated.columns else merged
merged[["regulog_id", "genome_name", "locus_tag", "tf_name", "gene_name"]].to_csv(OUT_REGULONS, sep="\t", index=False)

print("\n" + "=" * 65)
print("          REPORTE CHECKPOINT 7 · MAPEO TAXONÓMICO")
print("=" * 65)
print(f"[*] Total interacciones procesadas:          {len(df_curated):,}")
print(f"[*] Organismos únicos recuperados:           {df_curated['genome_name'].nunique():,}")
print(f"[*] Interacciones vinculadas al Atlas:       {matched_count:,}")
print(f"[*] Archivo de regulones final:              {OUT_REGULONS}")
print("=" * 65 + "\n")
import re
from pathlib import Path
from bs4 import BeautifulSoup
import pandas as pd
from tqdm import tqdm

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
    # Extraer ID directamente del nombre de archivo
    id_m = re.search(r"regulon_id_(\d+)_", p.name)
    if not id_m:
        continue
    
    rid = id_m.group(1)

    try:
        with open(p, "r", encoding="utf-8", errors="ignore") as f:
            soup = BeautifulSoup(f.read(), "lxml")
        
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

# 3. Cruce taxonómico contra el Atlas (selected_genomes.tsv)
atlas = pd.read_csv(ATLAS_FILE, sep="\t") if ATLAS_FILE.exists() else pd.DataFrame()

def normalize_name(name):
    if pd.isna(name) or not name:
        return ""
    s = str(name).strip().lower()
    s = re.sub(r"^(str\.|strain|sp\.)\s*", "", s)
    s = re.sub(r"[\[\]()_,-]", " ", s)
    return re.sub(r"\s+", " ", s).strip()

matched_count = 0
if not atlas.empty and "ncbi_organism_name" in atlas.columns:
    atlas["clean_name"] = atlas["ncbi_organism_name"].apply(normalize_name)
    df_curated["clean_name"] = df_curated["genome_name"].apply(normalize_name)

    # Cruce por nombre normalizado
    merged = df_curated.merge(atlas[["accession", "clean_name"]], on="clean_name", how="left")
    
    # Respaldo por género y especie (primeras 2 palabras)
    unmatched_mask = merged["accession"].isna()
    atlas["genus_sp"] = atlas["clean_name"].apply(lambda x: " ".join(x.split()[:2]))
    df_curated["genus_sp"] = df_curated["clean_name"].apply(lambda x: " ".join(x.split()[:2]))

    merged_gsp = df_curated[unmatched_mask].merge(
        atlas[["accession", "genus_sp"]].drop_duplicates(subset=["genus_sp"]),
        on="genus_sp",
        how="left"
    )
    merged.loc[unmatched_mask, "accession"] = merged_gsp["accession"].values

    matched = merged[merged["accession"].notna()]
    matched_count = len(matched)

    unmatched = merged[merged["accession"].isna()][["genome_name"]].drop_duplicates()
    unmatched.to_csv(QC_DIR / "regprecise_sin_match.tsv", sep="\t", index=False)

    cols_to_save = ["regulog_id", "genome_name", "locus_tag", "tf_name", "gene_name"]
    df_curated[cols_to_save].to_csv(OUT_REGULONS, sep="\t", index=False)
else:
    df_curated.to_csv(OUT_REGULONS, sep="\t", index=False)

print("\n" + "=" * 65)
print("          REPORTE CHECKPOINT 7 · MAPEO TAXONÓMICO")
print("=" * 65)
print(f"[*] Total interacciones procesadas:          {len(df_curated):,}")
print(f"[*] Organismos únicos recuperados:           {df_curated['genome_name'].nunique():,}")
print(f"[*] Interacciones vinculadas al Atlas:       {matched_count:,}")
print(f"[*] Archivo de salida generado:              {OUT_REGULONS}")
print("=" * 65 + "\n")
import re
from pathlib import Path
from collections import Counter
import pandas as pd
from bs4 import BeautifulSoup
from tqdm import tqdm

RAW_DIR = Path("data/raw/regprecise")
SITES_DIR = RAW_DIR / "regulons" / "sites_fasta"
PAGES_DIR = RAW_DIR / "pages"
OUT_DIR = Path("data/processed/curated/regprecise")
QC_DIR = Path("data/processed/curated/_qc")

OUT_DIR.mkdir(parents=True, exist_ok=True)
QC_DIR.mkdir(parents=True, exist_ok=True)


def cargar_metadatos_regulones(pages_dir: Path) -> dict:
    """
    Lee las páginas HTML cacheadas (regulon.jsp?regulon_id=XXXX) y extrae,
    por regulon_id, el TF, el organismo y la tabla real de genes regulados
    (locus_tag / gene_name / function) desde <table id="operontbl">.
    Esto reemplaza la dependencia de encabezados FASTA que nunca tuvieron
    esos metadatos (endpoint export.jsp roto -> fallback sin tf=/org=/gene=).
    """
    meta = {}
    html_files = list(pages_dir.glob("*.html"))

    for p in tqdm(html_files, desc="Leyendo páginas HTML cacheadas"):
        id_m = re.search(r"regulon_id_(\d+)_", p.name)
        if not id_m:
            continue
        rid = id_m.group(1)

        try:
            with open(p, "r", encoding="utf-8", errors="ignore") as f:
                soup = BeautifulSoup(f.read(), "html.parser")
        except Exception:
            continue

        title = soup.find("title")
        if not title:
            continue

        t_text = title.text.strip()
        m = re.search(r"Regulon of\s+([A-Za-z0-9_().-]+)\s+in\s+([^.<>\n\r]+)", t_text)
        tf_name = m.group(1).strip() if m else f"TF_{rid}"
        genome_name = m.group(2).strip() if m else "Unknown"

        genes = []
        tabla = soup.find("table", id="operontbl")
        if tabla:
            for fila in tabla.find_all("tr"):
                celdas = fila.find_all("td")
                if len(celdas) != 4:
                    continue
                celda_locus = celdas[1].find("div", class_="showinfo")
                celda_nombre = celdas[2].find("div", class_="showinfo")
                if not celda_locus:
                    continue
                enlace = celda_locus.find("a")
                locus_tag = enlace.get_text(strip=True) if enlace else celda_locus.get_text(strip=True)
                gene_name = celda_nombre.get_text(strip=True) if celda_nombre else None
                if locus_tag:
                    genes.append({"locus_tag": locus_tag, "gene_name": gene_name})

        meta[rid] = {
            "tf_name": tf_name,
            "genome_name": genome_name,
            "genes": genes
        }

    return meta


print("1. Cargando metadatos reales desde páginas HTML cacheadas...")
regulon_meta = cargar_metadatos_regulones(PAGES_DIR)
print(f"   -> {len(regulon_meta)} regulones con metadatos HTML disponibles")

print("2. Procesando sitios FASTA para generar motivos...")
motif_rows = []
curated_rows = []
seen_motifs = set()

fasta_files = sorted(list(SITES_DIR.glob("*.fa*")))
n_sin_metadata_html = 0

for fa in tqdm(fasta_files, desc="Generando motivos e interacciones"):
    rid = fa.stem
    motif_key = f"RG_{rid}"

    seqs = []
    with open(fa, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith(">"):
                cleaned = re.sub(r"[^ACGTNacgtn]", "", line).upper()
                if cleaned:
                    seqs.append(cleaned)

    if not seqs:
        continue

    meta = regulon_meta.get(rid)
    if meta:
        tf_name = meta["tf_name"]
        source_taxon = meta["genome_name"]
    else:
        # No había página HTML cacheada para este regulon_id: se marca
        # explícitamente en vez de generar un placeholder silencioso.
        n_sin_metadata_html += 1
        tf_name = f"TF_{rid}"
        source_taxon = "Unknown"

    # Calcular consenso por posición (igual que antes; esto sí funcionaba bien)
    lengths = [len(s) for s in seqs]
    w = Counter(lengths).most_common(1)[0][0]
    valid_seqs = [s for s in seqs if len(s) == w]

    if not valid_seqs:
        continue

    consensus = "".join([max("ACGT", key=lambda b: [s[i] for s in valid_seqs].count(b)) for i in range(w)])

    if motif_key not in seen_motifs:
        seen_motifs.add(motif_key)
        motif_rows.append({
            "motif_key": motif_key,
            "source": "RegPrecise",
            "tf_name": tf_name,
            "tf_family": None,
            "source_taxon": source_taxon,
            "source_phylum": None,
            "length": len(consensus),
            "n_sites": len(valid_seqs),
            "consensus": consensus
        })

    # Interacciones TF -> gen: ahora desde la tabla real de operontbl,
    # no desde encabezados FASTA que nunca tuvieron esta información.
    genes = meta["genes"] if meta else []
    if genes:
        for g in genes:
            curated_rows.append({
                "regulog_id": str(rid),
                "genome_name": source_taxon,
                "locus_tag": g["locus_tag"],
                "tf_name": tf_name,
                "gene_name": g["gene_name"]
            })
    else:
        # Sin tabla de genes disponible: se deja constancia explícita en QC
        # en vez de inventar un locus_tag falso tipo REG_{rid}.
        curated_rows.append({
            "regulog_id": str(rid),
            "genome_name": source_taxon,
            "locus_tag": None,
            "tf_name": tf_name,
            "gene_name": None
        })

# 1. Guardar motifs_regprecise.tsv
df_motifs = pd.DataFrame(motif_rows)
df_motifs.to_csv(OUT_DIR / "motifs_regprecise.tsv", sep="\t", index=False)

# 2. Guardar curated_regulons_raw.tsv
df_curated = pd.DataFrame(curated_rows)

# QC: registrar cuántas filas quedaron sin locus_tag real (antes esto era
# invisible porque se rellenaban con REG_{rid})
sin_locus = df_curated["locus_tag"].isna().sum()
df_curated_valid = df_curated.dropna(subset=["locus_tag"]).drop_duplicates(
    subset=["regulog_id", "genome_name", "locus_tag", "tf_name"]
)
df_curated_valid.to_csv(OUT_DIR / "curated_regulons_raw.tsv", sep="\t", index=False)

if sin_locus > 0:
    df_curated[df_curated["locus_tag"].isna()][["regulog_id", "tf_name", "genome_name"]].drop_duplicates().to_csv(
        QC_DIR / "regprecise_sin_locus_tag.tsv", sep="\t", index=False
    )

print(f"\n[OK] CHECKPOINT 5 & 6 COMPLETADOS (locus_tag real desde HTML):")
print(f" -> {len(df_motifs)} motivos generados en {OUT_DIR / 'motifs_regprecise.tsv'}")
print(f" -> {len(df_curated_valid)} interacciones curadas con locus_tag real en {OUT_DIR / 'curated_regulons_raw.tsv'}")
print(f" -> {n_sin_metadata_html} regulones sin página HTML cacheada (tf_name/genome_name = placeholder)")
print(f" -> {sin_locus} filas sin locus_tag real (excluidas, ver {QC_DIR / 'regprecise_sin_locus_tag.tsv'})")
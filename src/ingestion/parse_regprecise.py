import re
from pathlib import Path
from collections import Counter
import pandas as pd
from tqdm import tqdm

RAW_DIR = Path("data/raw/regprecise")
SITES_DIR = RAW_DIR / "regulons" / "sites_fasta"
PAGES_DIR = RAW_DIR / "pages"
OUT_DIR = Path("data/processed/curated/regprecise")
QC_DIR = Path("data/processed/curated/_qc")

OUT_DIR.mkdir(parents=True, exist_ok=True)
QC_DIR.mkdir(parents=True, exist_ok=True)

print("1. Procesando 4.535 sitios FASTA para generar motivos...")
motif_rows = []
curated_rows = []
seen_motifs = set()

fasta_files = sorted(list(SITES_DIR.glob("*.fa*")))

for fa in tqdm(fasta_files, desc="Generando motivos e interacciones"):
    rid = fa.stem
    motif_key = f"RG_{rid}"
    
    seqs = []
    headers = []
    
    with open(fa, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            line = line.strip()
            if line.startswith(">"):
                headers.append(line)
            elif line:
                cleaned = re.sub(r"[^ACGTNacgtn]", "", line).upper()
                if cleaned:
                    seqs.append(cleaned)

    if not seqs:
        continue

    # Extraer metadatos desde el primer encabezado
    first_header = headers[0] if headers else ""
    tf_m = re.search(r"tf=([^\s]+)", first_header)
    org_m = re.search(r"org=([^>\n]+)", first_header)
    
    tf_name = tf_m.group(1).strip() if tf_m else f"TF_{rid}"
    source_taxon = org_m.group(1).strip() if org_m else "Unknown"

    # Calcular consenso por posición
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

    # Extraer pares (TF -> Gen) desde los encabezados de sitios
    for h in headers:
        gene_m = re.search(r"gene=([^\s]+)", h) or re.search(r"locus=([^\s]+)", h)
        locus_tag = gene_m.group(1) if gene_m else None
        
        # Si no está en el encabezado, usar el propio identificador del regulón
        if not locus_tag:
            locus_tag = f"REG_{rid}"

        curated_rows.append({
            "regulog_id": str(rid),
            "genome_name": source_taxon,
            "locus_tag": locus_tag,
            "tf_name": tf_name,
            "gene_name": None
        })

# 1. Guardar motifs_regprecise.tsv
df_motifs = pd.DataFrame(motif_rows)
df_motifs.to_csv(OUT_DIR / "motifs_regprecise.tsv", sep="\t", index=False)

# 2. Guardar curated_regulons_raw.tsv
df_curated = pd.DataFrame(curated_rows).drop_duplicates(subset=["regulog_id", "genome_name", "locus_tag", "tf_name"])
df_curated.to_csv(OUT_DIR / "curated_regulons_raw.tsv", sep="\t", index=False)

print(f"\n[OK] CHECKPOINT 5 & 6 COMPLETADOS:")
print(f" -> {len(df_motifs)} motivos generados en {OUT_DIR / 'motifs_regprecise.tsv'}")
print(f" -> {len(df_curated)} interacciones curadas en {OUT_DIR / 'curated_regulons_raw.tsv'}")
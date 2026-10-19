import json
from pathlib import Path
import pandas as pd

RAW_FILE = Path("data/raw/prodoric/matrices_complete.json")
OUT_DIR = Path("data/processed/curated/prodoric")
QC_DIR = Path("data/processed/curated/_qc")

OUT_DIR.mkdir(parents=True, exist_ok=True)
QC_DIR.mkdir(parents=True, exist_ok=True)

with open(RAW_FILE, "r", encoding="utf-8") as f:
    payload = json.load(f)

matrix_list = payload.get("data", [])
rows = []
discarded = []
seen_keys = set()

# Cabecera estándar para el formato MEME
meme_lines = [
    "MEME version 4",
    "",
    "ALPHABET= ACGT",
    "",
    "strands: + -",
    ""
]

for item in matrix_list:
    mx_id = item.get("mx")
    tf_name = item.get("name")
    consensus = item.get("consensus")
    organism_dict = item.get("organism") or {}
    source_taxon = organism_dict.get("name") if isinstance(organism_dict, dict) else str(organism_dict)

    motif_key = f"MX_{int(mx_id):06d}" if mx_id is not None else None

    # Reglas duras de validación
    if not motif_key or not tf_name or not consensus or not source_taxon:
        discarded.append({
            "motif_key": motif_key,
            "tf_name": tf_name,
            "reason": "Missing required fields (key, tf_name, consensus or taxon)"
        })
        continue

    if motif_key in seen_keys:
        continue
    seen_keys.add(motif_key)

    length = len(consensus)
    pwm = item.get("pwm") or {}
    a_vals, c_vals, g_vals, t_vals = pwm.get("A", []), pwm.get("C", []), pwm.get("G", []), pwm.get("T", [])
    
    n_sites = length
    prob_matrix = []
    is_valid_matrix = True

    # Validar que todas las listas tengan la longitud del consenso
    if all(len(v) == length for v in [a_vals, c_vals, g_vals, t_vals]):
        for i in range(length):
            col_sum = a_vals[i] + c_vals[i] + g_vals[i] + t_vals[i]
            if col_sum > 0:
                # Normalización: dividir por la suma de la columna para que sume 1.0
                prob_matrix.append([
                    a_vals[i] / col_sum, 
                    c_vals[i] / col_sum, 
                    g_vals[i] / col_sum, 
                    t_vals[i] / col_sum
                ])
                if col_sum > n_sites: 
                    n_sites = int(col_sum)
            else:
                # Si la columna suma 0 (brecha), asignar probabilidad uniforme
                prob_matrix.append([0.25, 0.25, 0.25, 0.25])
    else:
        discarded.append({"motif_key": motif_key, "tf_name": tf_name, "reason": "Invalid PWM column lengths"})
        is_valid_matrix = False

    if not is_valid_matrix:
        continue

    # Metadatos para la BD
    rows.append({
        "motif_key": motif_key,
        "source": "PRODORIC",
        "tf_name": tf_name.strip(),
        "tf_family": None,
        "source_taxon": source_taxon.strip(),
        "source_phylum": None,
        "length": length,
        "n_sites": n_sites,
        "consensus": consensus.strip()
    })

    # Construcción del bloque MEME para este motivo
    meme_lines.append(f"MOTIF {motif_key} {tf_name.strip()}")
    meme_lines.append(f"letter-probability matrix: alength= 4 w= {length} nsites= {n_sites} E= 0")
    for row in prob_matrix:
        meme_lines.append(f"  {row[0]:.6f}  {row[1]:.6f}  {row[2]:.6f}  {row[3]:.6f}")
    meme_lines.append("")

df = pd.DataFrame(rows)
df_disc = pd.DataFrame(discarded)

# Exportar tabla de BD
df.to_csv(OUT_DIR / "motifs_prodoric.tsv", sep="\t", index=False)
df_disc.to_csv(QC_DIR / "prodoric_descartes.tsv", sep="\t", index=False)

# Exportar archivo MEME para FIMO
with open(OUT_DIR / "prodoric.meme", "w") as f:
    f.write("\n".join(meme_lines))

print(f"[OK] PRODORIC: {len(df)} motivos exportados (TSV y MEME), {len(df_disc)} descartados.")
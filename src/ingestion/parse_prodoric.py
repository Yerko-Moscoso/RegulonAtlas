import json
import sys
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

    assert motif_key not in seen_keys, f"motif_key duplicado detectado: {motif_key}"
    seen_keys.add(motif_key)

    length = len(consensus)
    # Si viene lista PWM, n_sites estimado o número de posiciones
    pwm = item.get("pwm") or {}
    a_vals = pwm.get("A", [])
    n_sites = len(a_vals) if a_vals else length

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

df = pd.DataFrame(rows)
df_disc = pd.DataFrame(discarded)

df.to_csv(OUT_DIR / "motifs_prodoric.tsv", sep="\t", index=False)
df_disc.to_csv(QC_DIR / "prodoric_descartes.tsv", sep="\t", index=False)
print(f"[OK] PRODORIC: {len(df)} motivos exportados, {len(df_disc)} descartados.")
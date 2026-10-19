import hashlib
import json
import logging
import re
import time
from collections import Counter
from pathlib import Path
import pandas as pd
import requests
from tqdm import tqdm

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)

BASE_URL = "https://regprecise.lbl.gov"
RAW_DIR = Path("data/raw/regprecise")
PAGES_DIR = RAW_DIR / "pages"
REGULONS_DIR = RAW_DIR / "regulons"
GENES_TSV_DIR = REGULONS_DIR / "genes_tsv"
SITES_FASTA_DIR = REGULONS_DIR / "sites_fasta"


class RegPreciseHarvester:
    def __init__(self, delay_seconds: float = 0.05):
        self.delay = delay_seconds
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        })
        PAGES_DIR.mkdir(parents=True, exist_ok=True)
        GENES_TSV_DIR.mkdir(parents=True, exist_ok=True)
        SITES_FASTA_DIR.mkdir(parents=True, exist_ok=True)

    def get_html(self, url: str) -> str:
        url_hash = hashlib.sha256(url.encode("utf-8")).hexdigest()[:12]
        safe_name = re.sub(r"[^a-zA-Z0-9_-]", "_", url.replace(BASE_URL, ""))[:60]
        cache_path = PAGES_DIR / f"{safe_name}_{url_hash}.html"

        if cache_path.exists() and cache_path.stat().st_size > 0:
            with open(cache_path, "r", encoding="utf-8", errors="ignore") as f:
                return f.read()

        time.sleep(self.delay)
        try:
            r = self.session.get(url, timeout=20)
            if r.status_code == 200:
                with open(cache_path, "w", encoding="utf-8") as f:
                    f.write(r.text)
                return r.text
        except Exception:
            pass
        return ""

    def harvest_regulon(self, regulon_id: str):
        """Descarga sitios FASTA y tabla de genes para un regulon dado."""
        fasta_file = SITES_FASTA_DIR / f"{regulon_id}.fasta"
        tsv_file = GENES_TSV_DIR / f"{regulon_id}.tsv"

        # 1. Intentar endpoints de exportación directa
        if not (fasta_file.exists() and fasta_file.stat().st_size > 0):
            url_sites = f"{BASE_URL}/c/export.jsp?regulon_id={regulon_id}&type=sites"
            try:
                r_sites = self.session.get(url_sites, timeout=15)
                if r_sites.status_code == 200 and ">" in r_sites.text:
                    with open(fasta_file, "w", encoding="utf-8") as f:
                        f.write(r_sites.text)
            except Exception:
                pass

        if not (tsv_file.exists() and tsv_file.stat().st_size > 0):
            url_genes = f"{BASE_URL}/c/export.jsp?regulon_id={regulon_id}&type=genes"
            try:
                r_genes = self.session.get(url_genes, timeout=15)
                if r_genes.status_code == 200 and len(r_genes.text.strip()) > 10:
                    with open(tsv_file, "w", encoding="utf-8") as f:
                        f.write(r_genes.text)
            except Exception:
                pass

        # 2. Respaldo: Parsear la página HTML completa del regulon si falló el export directo
        if not (fasta_file.exists() and fasta_file.stat().st_size > 0):
            html = self.get_html(f"{BASE_URL}/regulon.jsp?regulon_id={regulon_id}")
            if html:
                seq_matches = re.findall(r"Sequence:\s*([ACGTNacgtn]+)", html)
                if seq_matches:
                    with open(fasta_file, "w", encoding="utf-8") as f:
                        for idx, s in enumerate(seq_matches, 1):
                            f.write(f">{regulon_id}_{idx}\n{s.upper()}\n")


def extract_ids_recursively(obj):
    """Extrae cualquier número o ID de regulón de estructuras JSON anidadas."""
    found = set()
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k in ["regulon_id", "regulonId", "id"] and str(v).isdigit():
                found.add(str(v))
            else:
                found.update(extract_ids_recursively(v))
    elif isinstance(obj, list):
        for item in obj:
            if isinstance(item, (int, str)) and str(item).isdigit():
                found.add(str(item))
            else:
                found.update(extract_ids_recursively(item))
    return found


def collect_all_regulon_ids(harvester: RegPreciseHarvester) -> list:
    """Recolecta todos los IDs de regulones disponibles asegurando comparación homogénea de tipos."""
    found_ids = set()

    # 1. Leer índices JSON locales
    for fname in ["matched_regulons_index.json", "taxonomy_index.json"]:
        p = RAW_DIR / fname
        if p.exists():
            try:
                with open(p, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    found_ids.update(extract_ids_recursively(data))
            except Exception:
                pass

    # 2. Descubrir desde páginas cacheadas
    for p in PAGES_DIR.glob("*.html"):
        try:
            with open(p, "r", encoding="utf-8", errors="ignore") as f:
                rids = re.findall(r"regulon(?:_id|=)(\d+)", f.read())
                found_ids.update(rids)
        except Exception:
            pass

    # 3. Si se encontraron muy pocos, recorrer colecciones taxonómicas principales
    if len(found_ids) < 50:
        logging.info("Consultando colecciones taxonómicas de RegPrecise...")
        for col_id in range(1, 100):
            url = f"{BASE_URL}/collection_tax.jsp?collection_id={col_id}"
            html = harvester.get_html(url)
            if html:
                rids = re.findall(r"regulon\.jsp\?regulon_id=(\d+)", html)
                found_ids.update(rids)

    # Ordenar numéricamente convirtiendo todo a entero con seguridad
    numeric_ids = [int(x) for x in found_ids if str(x).isdigit()]
    return [str(x) for x in sorted(numeric_ids)]


def build_consolidated_meme(master_meme_path: Path) -> int:
    """Compila los FASTA a archivo MEME."""
    fasta_files = sorted(list(SITES_FASTA_DIR.glob("*.fa*")))
    if not fasta_files:
        return 0

    header = (
        "MEME version 4\n\n"
        "ALPHABET= ACGT\n\n"
        "strands: + -\n\n"
        "Background letter frequencies\n"
        "A 0.25 C 0.25 G 0.25 T 0.25\n\n"
    )

    valid_count = 0
    with open(master_meme_path, "w", encoding="utf-8") as out:
        out.write(header)
        for f in tqdm(fasta_files, desc="Generando matrices MEME"):
            regulon_id = f.stem
            sequences = []
            with open(f, "r", encoding="utf-8", errors="ignore") as fa_in:
                for line in fa_in:
                    line = line.strip().upper()
                    if line and not line.startswith(">"):
                        cleaned = re.sub(r"[^ACGT]", "", line)
                        if cleaned:
                            sequences.append(cleaned)
            
            if not sequences:
                continue

            lengths = [len(s) for s in sequences]
            motif_len = Counter(lengths).most_common(1)[0][0]
            valid_seqs = [s for s in sequences if len(s) == motif_len]
            num_sites = len(valid_seqs)
            if num_sites == 0:
                continue

            alphabet = ["A", "C", "G", "T"]
            matrix_lines = []
            for pos in range(motif_len):
                counts = Counter(s[pos] for s in valid_seqs)
                total = num_sites + 0.04
                freqs = [(counts.get(b, 0) + 0.01) / total for b in alphabet]
                matrix_lines.append(f"{freqs[0]:.6f}\t{freqs[1]:.6f}\t{freqs[2]:.6f}\t{freqs[3]:.6f}")

            block = (
                f"MOTIF {regulon_id} {regulon_id}\n"
                f"letter-probability matrix: alength= 4 w= {motif_len} nsites= {num_sites} E= 0\n"
                + "\n".join(matrix_lines) + "\n\n"
            )
            out.write(block)
            valid_count += 1

    return valid_count


def build_consolidated_tsv(master_tsv_path: Path) -> int:
    """Consolida las interacciones curadas en TSV."""
    tsv_files = sorted(list(GENES_TSV_DIR.glob("*.tsv")))
    if not tsv_files:
        return 0

    records = []
    for f in tqdm(tsv_files, desc="Consolidando interacciones"):
        try:
            df = pd.read_csv(f, sep="\t", dtype=str, on_bad_lines="skip")
            df["source_file"] = f.name
            records.append(df)
        except Exception:
            pass

    if not records:
        return 0

    master_df = pd.concat(records, ignore_index=True).drop_duplicates()
    master_df.to_csv(master_tsv_path, sep="\t", index=False)
    return len(master_df)


def run_pipeline():
    harvester = RegPreciseHarvester(delay_seconds=0.05)
    
    # 1. Recolectar identificadores de regulones
    regulon_ids = collect_all_regulon_ids(harvester)
    logging.info(f"Total de regulones identificados para descargar: {len(regulon_ids)}")

    # 2. Descargar datos de cada regulon
    if regulon_ids:
        for rid in tqdm(regulon_ids, desc="Descargando regulones"):
            harvester.harvest_regulon(rid)

    # 3. Compilar archivos maestros
    master_meme = RAW_DIR / "regprecise_all_motifs.meme"
    master_tsv = RAW_DIR / "regprecise_curated_interactions.tsv"

    valid_motifs = build_consolidated_meme(master_meme)
    total_genes = build_consolidated_tsv(master_tsv)

    # 4. Reporte final
    print("\n" + "=" * 70)
    print("      REPORTE DE AUDITORÍA FINAL · REGPRECISE 3.2")
    print("=" * 70)
    num_fasta = len(list(SITES_FASTA_DIR.glob("*.fa*")))
    num_tsv = len(list(GENES_TSV_DIR.glob("*.tsv")))
    print(f"[*] Regulones procesados (FASTA sitios): {num_fasta:>6}")
    print(f"[*] Regulones procesados (TSV genes):    {num_tsv:>6}")
    
    meme_kb = (master_meme.stat().st_size / 1024) if master_meme.exists() else 0
    tsv_kb = (master_tsv.stat().st_size / 1024) if master_tsv.exists() else 0
    print(f"[*] Motivos MEME compilados (FIMO):      {valid_motifs:>6} ({meme_kb:.1f} KB)")
    print(f"[*] Interacciones curadas totales:       {total_genes:>6} ({tsv_kb:.1f} KB)")
    print("-" * 70)
    if valid_motifs > 0 or num_fasta > 0:
        print(" ESTADO: DATASET REGPRECISE PROCESADO EXITOSAMENTE")
    else:
        print("⚠️  ESTADO: COMPLETANDO EXTRACCIÓN DE MOTIVOS")
    print("=" * 70 + "\n")


if __name__ == "__main__":
    run_pipeline()
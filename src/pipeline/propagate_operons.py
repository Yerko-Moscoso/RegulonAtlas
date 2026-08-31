import pandas as pd
from pathlib import Path
import re
import logging
import gzip
from tqdm import tqdm

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

HITS_DIR = Path("data/processed/fimo_hits")
GENOMES_DIR = Path("data/genomes/atlas_genomes")
OUT_DIR = Path("data/processed/expanded_networks")

MAX_INTERGENIC_DISTANCE = 50

def parse_gff_genes_sorted(gff_path):
    genes = []
    open_func = gzip.open if str(gff_path).endswith(".gz") else open
    
    with open_func(gff_path, "rt", encoding="utf-8", errors="ignore") as f:
        for line in f:
            if line.startswith("#"):
                continue
            parts = line.strip().split("\t")
            if len(parts) < 9:
                continue
            
            if parts[2] in ["CDS", "gene"]:
                chrom = parts[0]
                start = int(parts[3])
                end = int(parts[4])
                strand = parts[6]
                
                locus_m = re.search(r"(?:locus_tag|ID)=([^;]+)", parts[8])
                locus_tag = locus_m.group(1) if locus_m else None
                
                if locus_tag:
                    genes.append({
                        "chrom": chrom,
                        "start": start,
                        "end": end,
                        "strand": strand,
                        "locus_tag": locus_tag
                    })
    
    df = pd.DataFrame(genes)
    if not df.empty:
        df = df.drop_duplicates(subset=["chrom", "start", "end", "strand"])
        df = df.sort_values(by=["chrom", "start"]).reset_index(drop=True)
    return df

def expand_operons(df_hits, df_genes):
    expanded_rows = []
    genes_list = df_genes.to_dict("records")
    locus_to_index = {g["locus_tag"]: i for i, g in enumerate(genes_list)}
    
    for _, hit in df_hits.iterrows():
        header_parts = str(hit["sequence_name"]).split("|")
        leader_locus = header_parts[0]
        
        if leader_locus not in locus_to_index:
            continue
            
        leader_idx = locus_to_index[leader_locus]
        leader_gene = genes_list[leader_idx]
        
        base_interaction = hit.to_dict()
        base_interaction["target_gene"] = leader_locus
        base_interaction["is_leader"] = True
        expanded_rows.append(base_interaction)
        
        curr_idx = leader_idx
        while True:
            next_idx = curr_idx + 1 if leader_gene["strand"] == "+" else curr_idx - 1
            
            if next_idx < 0 or next_idx >= len(genes_list):
                break
                
            curr_gene = genes_list[curr_idx]
            next_gene = genes_list[next_idx]
            
            if (curr_gene["chrom"] != next_gene["chrom"]) or (curr_gene["strand"] != next_gene["strand"]):
                break
                
            if leader_gene["strand"] == "+":
                distance = next_gene["start"] - curr_gene["end"]
            else:
                distance = curr_gene["start"] - next_gene["end"]
                
            if 0 <= distance <= MAX_INTERGENIC_DISTANCE:
                operon_interaction = hit.to_dict()
                operon_interaction["target_gene"] = next_gene["locus_tag"]
                operon_interaction["is_leader"] = False
                expanded_rows.append(operon_interaction)
                curr_idx = next_idx
            else:
                break

    return pd.DataFrame(expanded_rows)

def main():
    print("\n" + "=" * 65)
    print("      PROPAGACIÓN DE REDES REGULATORIAS POR OPERONES")
    print("=" * 65)
    
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    hit_files = list(HITS_DIR.glob("*_hits.tsv.gz"))
    
    if not hit_files:
        logging.error(f"No se encontraron resultados de FIMO en {HITS_DIR}.")
        return

    success_count = 0
    total_expanded = 0

    for hit_file in tqdm(hit_files, desc="Expandiendo redes"):
        genome_acc = hit_file.name.replace("_hits.tsv.gz", "")
        out_file = OUT_DIR / f"{genome_acc}_expanded_network.tsv"
        
        gff_candidates = list(GENOMES_DIR.glob(f"{genome_acc}/*.gff*")) + list(GENOMES_DIR.glob(f"**/{genome_acc}*.gff*"))
        
        if not gff_candidates:
            logging.warning(f"No se encontró GFF para {genome_acc}")
            continue
            
        df_hits = pd.read_csv(hit_file, sep="\t")
        if df_hits.empty:
            continue
            
        df_genes = parse_gff_genes_sorted(gff_candidates[0])
        df_expanded = expand_operons(df_hits, df_genes)
        
        if not df_expanded.empty:
            df_expanded.to_csv(out_file, sep="\t", index=False)
            success_count += 1
            total_expanded += len(df_expanded)

    print("\n" + "-" * 65)
    print(f"[*] Genomas procesados:         {success_count} de {len(hit_files)}")
    print(f"[*] Interacciones biológicas:   {total_expanded:,}")
    print(f"[*] Archivos listos en:         {OUT_DIR}")
    print("=" * 65 + "\n")

if __name__ == "__main__":
    main()
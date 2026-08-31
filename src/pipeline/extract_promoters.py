import re
from pathlib import Path
from Bio import SeqIO
from Bio.Seq import Seq
import pandas as pd
from tqdm import tqdm

# Configuración de rutas
GENOMES_DIR = Path("data/genomes/atlas_genomes")
OUT_DIR = Path("data/processed/promoters")

# Ventana regulatoria (-400 / +100 nt)
UPSTREAM_LEN = 400
DOWNSTREAM_LEN = 100

def parse_gff_genes(gff_path):
    """Extrae coordenadas de CDS/genes desde el archivo GFF3."""
    genes = []
    with open(gff_path, "rt", encoding="utf-8", errors="ignore") as f:
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
                
                # Extraer locus_tag de los atributos
                locus_m = re.search(r"(?:locus_tag|ID|gene_id)=([^;]+)", parts[8])
                locus_tag = locus_m.group(1) if locus_m else f"{chrom}_{start}"
                
                genes.append({
                    "chrom": chrom,
                    "start": start,
                    "end": end,
                    "strand": strand,
                    "locus_tag": locus_tag
                })
                
    df = pd.DataFrame(genes)
    if not df.empty:
        # Eliminar duplicados si CDS y gene comparten las mismas coordenadas
        df = df.drop_duplicates(subset=["chrom", "start", "end", "strand"])
        df = df.sort_values(by=["chrom", "start"]).reset_index(drop=True)
    return df

def extract_promoters_for_genome(fna_path, gff_path, out_fasta):
    """Genera las ventanas promotoras recortando solapamientos."""
    # Cargar genoma en memoria
    genome_seqs = {rec.id: rec.seq for rec in SeqIO.parse(fna_path, "fasta")}
    
    df_genes = parse_gff_genes(gff_path)
    if df_genes.empty:
        return 0

    promoters = []
    
    # Procesar por cromosoma/contig
    for chrom, chrom_genes in df_genes.groupby("chrom"):
        if chrom not in genome_seqs:
            continue
            
        chrom_seq = genome_seqs[chrom]
        chrom_len = len(chrom_seq)
        genes_list = chrom_genes.to_dict("records")
        
        for i, gene in enumerate(genes_list):
            strand = gene["strand"]
            locus = gene["locus_tag"]
            
            if strand == "+":
                tss = gene["start"]
                raw_start = max(1, tss - UPSTREAM_LEN)
                raw_end = min(chrom_len, tss + DOWNSTREAM_LEN - 1)
                
                # Recorte si el gen anterior solapa aguas arriba
                if i > 0 and genes_list[i - 1]["strand"] == "+":
                    prev_end = genes_list[i - 1]["end"]
                    if prev_end > raw_start and prev_end < tss:
                        raw_start = prev_end + 1
                        
                seq_promoter = chrom_seq[raw_start - 1 : raw_end]
                
            else: # strand == "-"
                tss = gene["end"]
                raw_start = max(1, tss - DOWNSTREAM_LEN + 1)
                raw_end = min(chrom_len, tss + UPSTREAM_LEN)
                
                # Recorte si el gen posterior solapa aguas arriba
                if i < len(genes_list) - 1 and genes_list[i + 1]["strand"] == "-":
                    next_start = genes_list[i + 1]["start"]
                    if next_start < raw_end and next_start > tss:
                        raw_end = next_start - 1
                        
                seq_promoter = chrom_seq[raw_start - 1 : raw_end].reverse_complement()

            # Solo guardar si quedó una secuencia con longitud útil
            if len(seq_promoter) >= 30:
                header = f"{locus}|{chrom}:{raw_start}-{raw_end}({strand})"
                promoters.append(f">{header}\n{str(seq_promoter)}\n")

    if promoters:
        with open(out_fasta, "w", encoding="utf-8") as f:
            f.writelines(promoters)
            
    return len(promoters)

def main():
    print("\n" + "=" * 65)
    print("      EXTRACCIÓN DE VENTANAS PROMOTORAS [-400, +100 nt]")
    print("=" * 65)
    
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    
    # Buscar todos los archivos GFF/GFF3
    gff_files = list(GENOMES_DIR.glob("**/*.gff")) + list(GENOMES_DIR.glob("**/*.gff3"))
    print(f"[*] Genomas con anotaciones detectados: {len(gff_files)}")
    
    total_extracted = 0
    processed_count = 0

    for gff in tqdm(gff_files, desc="Procesando genomas"):
        # Buscar el FASTA en la misma carpeta que el GFF
        fna_candidates = list(gff.parent.glob("*.fna")) + list(gff.parent.glob("*.fasta"))
        if not fna_candidates:
            continue
            
        fna = fna_candidates[0]
        # El accession (GCF_...) será el nombre de la carpeta contenedora
        acc = gff.parent.name
        out_fasta = OUT_DIR / f"{acc}_promoters.fa"
        
        count = extract_promoters_for_genome(fna, gff, out_fasta)
        total_extracted += count
        processed_count += 1

    print("\n" + "=" * 65)
    print(f"[*] Genomas procesados exitosamente: {processed_count}")
    print(f"[*] Promotores extraídos totales:    {total_extracted:,}")
    print(f"[*] Directorio de salida:            {OUT_DIR}")
    print("=" * 65 + "\n")

if __name__ == "__main__":
    main()
from sqlalchemy import Column, Integer, String, Float, ForeignKey
from sqlalchemy.orm import declarative_base

Base = declarative_base()

class Genome(Base):
    __tablename__ = "genomes"
    genome_id = Column(Integer, primary_key=True, index=True)
    accession = Column(String(50), unique=True, index=True)
    ncbi_organism = Column(String(255))
    completeness = Column(Float)
    contamination = Column(Float)
    assembly_level = Column(String(50))

class Motif(Base):
    __tablename__ = "motifs"
    motif_id = Column(Integer, primary_key=True, index=True)
    motif_key = Column(String(100), unique=True, index=True)
    source = Column(String(50))
    tf_name = Column(String(100))
    tf_family = Column(String(100))
    source_taxon = Column(String(255))
    length = Column(Integer)

class Gene(Base):
    __tablename__ = 'genes'
    gene_id = Column(Integer, primary_key=True, index=True)
    genome_id = Column(Integer, ForeignKey('genomes.genome_id'), index=True)
    locus_tag = Column(String(50), index=True)

class FimoHit(Base):
    __tablename__ = 'fimo_hits'
    hit_id = Column(Integer, primary_key=True, index=True)
    genome_id = Column(Integer, ForeignKey('genomes.genome_id'), index=True)
    gene_id = Column(Integer, ForeignKey('genes.gene_id'), index=True)
    motif_id = Column(Integer, ForeignKey('motifs.motif_id'), index=True)
    neg_log10_p = Column(Float, index=True)
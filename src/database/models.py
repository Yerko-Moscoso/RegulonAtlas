from sqlalchemy import Column, Integer, String, Float
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
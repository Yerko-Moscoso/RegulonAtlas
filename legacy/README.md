# Código histórico (no se usa en el flujo actual)

Se movió aquí en la limpieza de la semana 12 (19-10-2026, `docs/limpieza_semana12.md`). **Ningún `make`, ningún módulo
de `src/` ni la API lo importan.** Se conserva porque documenta el pipeline propio de las semanas 1 a 7, que la tesis
describe, y para que se pueda consultar o volver a ejecutar a mano.

Los archivos se movieron con `git mv`, así que `git log --follow legacy/<archivo>` muestra su historia completa.

## `ingestion/`: obtención de los datos curados (semanas 1–7)

| Archivo | Qué hacía | Ruta anterior |
|---|---|---|
| `regprecise_scraper.py` | Descarga de las páginas JSP de RegPrecise 3.0 (la API REST estaba caída) | `src/ingestion/` |
| `parse_regprecise.py` | Regulones curados desde el HTML en caché (BeautifulSoup con `html.parser`). Aquí se corrigió el error de los locus falsos `REG_xxxxx` (contexto, sección 8.1). | `src/ingestion/` |
| `map_regprecise_atlas.py` | Mapeo de los genomas de RegPrecise a accesiones del atlas | `src/ingestion/` |
| `prodoric_client.py`, `parse_prodoric.py`, `qc_prodoric.py` | Cliente de la API de PRODORIC 1.3.1, parseo de motivos y control de calidad | `src/ingestion/` |
| `manifest_curated.py` | Manifest de los archivos curados | `src/ingestion/` |

Hoy esos datos se leen desde la base `regulon_atlas` (tablas `curated_regulons`, `regprecise_genome_map`, `motifs`) mediante
la caché (`make cache-atlas`).

## `pipeline_piloto/`: primer pipeline propio (10 genomas, antes del MVP)

Leía los genomas de `data/genomes/atlas_genomes/` y escribía en `data/processed/` (los dos fuera de git).

| Archivo | Qué hacía | Ruta anterior |
|---|---|---|
| `extract_promoters.py` | Ventanas promotoras (−400 / +100 nt) desde FASTA y GFF | `src/pipeline/` |
| `build_backgrounds.py` | Modelos de fondo de nucleótidos para FIMO | `src/pipeline/` |
| `run_fimo.py` | Escaneo FIMO de los motivos de RegPrecise y PRODORIC | `src/pipeline/` |
| `propagate_operons.py` | Propagación de los hits a los genes del operón | `src/pipeline/` |
| `build_transfer_map_eggnog.py` | Mapa de transferencia de motivos por ortólogos de eggNOG | `src/pipeline/` |
| `build_networks_piloto.py` | Redes JSON y métricas del piloto | `src/networks/build_networks.py` |
| `benchmark_piloto.py` | Benchmark del piloto contra RegPrecise (*B. subtilis*, contexto 8.1) | `src/validation/benchmark.py` |

Lo reemplazaron, en este orden:
1. el pipeline del MVP (`src/pipeline/`, `make mvp`, semana 8);
2. las redes del atlas en la base y los módulos `src/networks/atlas_*.py` (semanas 9–12).

## Uso

Desde la raíz del proyecto, con el entorno `bioinfo` (`environment.yml` incluye meme, biopython, requests y
beautifulsoup4):

```bash
PYTHONPATH=. python legacy/pipeline_piloto/extract_promoters.py
```

Las rutas de datos dentro de los scripts no se cambiaron (`data/raw/`, `data/processed/`, `data/genomes/`).

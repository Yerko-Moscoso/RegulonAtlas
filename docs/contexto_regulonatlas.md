# RegulonAtlas — Documento de contexto del proyecto

*Última actualización: semana 12 (19 de octubre de 2026). Este documento resume el estado del proyecto, las decisiones tomadas y el trabajo hecho en los chats de la carpeta "Redes de regulación bacterianas". Sirve como punto de partida para cualquier conversación nueva.*

---

## 1. El proyecto

**RegulonAtlas** es un proyecto de título de Ingeniería Informática en la Universidad de las Américas, dentro del NIDS (Núcleo de Investigación en Data Science).

- **Objetivo:** predecir y comparar redes de regulación transcripcional (factor de transcripción → genes/operones diana) en 2.224 genomas bacterianos representativos seleccionados desde GTDB R232 + RefSeq.
- **Flujo completo:** ingesta de genomas → escaneo de motivos → construcción de redes → validación → dashboard de visualización interactiva.
- **Roles:** el usuario (Yerko Moscoso, usuario de servidor `ymoscoso`) es el desarrollador. Se encarga de la parte informática: pipeline, sistema, API y dashboard. Trabaja junto a un investigador bioinformático que aporta la parte de investigación y que generó la base de datos y las redes. El usuario no hace la investigación biológica, pero debe entender y poder explicar los términos del dominio.
- **Metodología declarada en la tesis:** modelo en cascada (no Agile/Scrum), justificado porque los requisitos son fijos y secuenciales. Las semanas posteriores al MVP se presentan como fases de construcción, pruebas y cierre.
- **Idiomas:** la tesis se escribe en español. El texto visible del dashboard va en inglés.
- **Objetivos específicos mencionados:** OE4 (métricas topológicas) y OE5 (validación contra gold standard).

---

## 2. Infraestructura y entorno de trabajo

- **Servidor:** `devastator`, Ubuntu 22.04, 48 núcleos, 242 GB de RAM, discos NVMe y almacenamiento compartido en `/mnt/biostore`.
- **Acceso:** VS Code conectado por SSH. Todos los comandos se ejecutan desde la terminal integrada de VS Code. VS Code reenvía automáticamente los puertos (8000 para la API y el de Vite para el frontend).
- **Sin `tmux`** (no hay permisos). Los procesos largos se lanzan con `nohup … &`, y las credenciales de MariaDB para esos procesos van en `~/.my.cnf` (con `chmod 600`).
- **Conda:** un solo entorno, `bioinfo`, para todo (pipeline, API, pruebas y Node.js). Se reproduce con `conda env create -f environment.yml` (regenerado en la semana 12; algunos paquetes van por pip).
- **Raíz del proyecto:** `~/proyecto`.
- **Base de datos:** MariaDB `regulon_atlas`. El usuario `ymoscoso` **solo tiene permiso SELECT**: no puede crear, modificar ni cargar tablas. Todo dato nuevo (por ejemplo RegulonDB) se maneja como archivo dentro del repositorio.
- **La API ya no consulta MariaDB:** todo se lee desde la caché local `data/cache/atlas/` (parquet) y desde los resultados en `data/results/`. La base solo se usa al regenerar la caché con `make cache-atlas`.
- **Credenciales:** se leen de variables de entorno (`DB_PASSWORD`, etc.) desde un `.env` ignorado por git. La conexión del proyecto está en `src/database/connection.py`. La contraseña antigua fue cambiada y eliminada del historial de git. La línea 8 del `.env` tenía un espacio que python-dotenv no podía leer; el estudiante la corrigió el 26-10-2026.
- **Carpetas de otros usuarios** (`/home/*`) tienen permisos `drwxr-x---`, así que no se pueden leer.

### Arranque del sistema

```bash
# Backend (desde ~/proyecto)
uvicorn src.api.main:app --host 0.0.0.0 --port 8000 --reload
# Frontend (desde ~/proyecto/frontend)
npm run dev
```

La documentación interactiva de la API queda en `http://localhost:8000/docs`.

---

## 3. Repositorio y control de versiones

- **Repositorio:** `github.com/Yerko-Moscoso/Proyecto_Bioinfo`.
- **`main`:** llega hasta la semana 11 (`f2d5df3`, etiqueta `semana11-metricas`). La etiqueta **`mvp-semana8`** (`d056fc9`) marca la entrega del MVP.
- **`dev`:** rama de trabajo desde la semana 9. Hasta la semana 11, los bloques terminados se fusionaron a `main` y se etiquetaron: `semana09-auditoria`, `semana10-validacion`, `semana11-metricas`. **Desde el 26-10-2026, todo el desarrollo queda solo en `dev`**: no se fusiona ni se sube nada a `main` hasta que el estudiante lo indique. Respaldo antes de la limpieza de la semana 12: rama `respaldo/pre-limpieza-semana12` y etiqueta `respaldo-pre-limpieza-semana12`. Etiqueta **`congelamiento-v1`** (`d9bcf58`, solo en `dev`): funciones congeladas al cierre de la semana 13.
- **No se versionan** datos generados (`data/cache/`, `data/audit/*.tsv`, `data/results/`), solo código, SQL y documentación.

---

## 4. Datos del atlas

### 4.1 Selección de genomas (embudo)

878.998 genomas en GTDB → 189.801 representantes de especie → 39.085 en RefSeq → 34.667 aislados (sin MAG/SAG) → 8.276 "Complete Genome" → 7.961 con completitud >95 % y contaminación <5 % → **2.224** (1 por género según calidad + 3 referencias forzadas).

- GTDB R232 se usa solo como marco taxonómico y de muestreo. RefSeq (accesiones GCF_ con anotación PGAP) es la fuente real de ensamblajes y anotaciones.
- Se guarda **taxonomía dual** por genoma (rango GTDB + `ncbi_organism`), porque GTDB ubica a *E. coli* K-12 en un género placeholder (`G047199095`). En el dashboard se muestra `ncbi_organism` como nombre principal.
- **Decisión D4:** tres cepas de referencia se incluyen siempre (`selection = 'forced'`): `GCF_000005845.2` (*E. coli* K-12 MG1655, RegulonDB), `GCF_000006765.1` (*P. aeruginosa* PAO1, PRODORIC) y `GCF_000009045.1` (*B. subtilis* 168).

### 4.2 Composición de la tabla `genomes` (2.644 filas)

| `selection` | Genomas | Rol |
|---|---|---|
| `representative` | 2.220 | Atlas |
| `forced` | 3 | Atlas |
| `replacement` | 1 | Atlas (GCF_050942165.1 suprimido → GCF_002993285.1). El valor real es `"replacement (GCF_050942165.1 suppressed in RefSeq 2026)"`: se compara la primera palabra |
| `regprecise_source` | 315 | Auxiliar: genomas de RegPrecise para validación |
| `chromosome_level` | 104 | Auxiliar |
| `expression_validation` | 1 | Auxiliar |

El atlas son exactamente **2.224 genomas**. Los otros 420 son auxiliares.

### 4.3 Fuentes de datos (tabla `provenance`)

| prov_id | Fuente | Versión | Fecha | Nota |
|---|---|---|---|---|
| 1 | GTDB | R232 | 2026-08-17 | 2.224 genomas seleccionados |
| 2 | RefSeq | snapshot 2026-08-17 | 2026-08-17 | GCF_050942165.1 suprimido → GCF_002993285.1 |
| 3 | eggNOG | v7 / emapper 3.0.0-beta6 | 2026-08-18 | 7,27M proteínas anotadas |
| 4 | PRODORIC | 2021.9 (API 1.3.1) | 2026-08-18 | D11 |
| 5 | RegPrecise | 3.0 (scraping JSP) | 2026-08-18 | API REST caída; ExportServlet. 2.730 regulogs, 1.808 motivos TF, 434 RNA |
| 6 | Rfam | 43 familias CM | 2026-08-18 | D12 |
| 7 | NCBI COG | 2020 | 2026-08-18 | Guarda de reguladores (D10) |

### 4.4 Volúmenes por etapa

2.224 genomas → 25 GB descargados → 7,27M proteínas anotadas (eggNOG v7, ejecutado como un solo FASTA combinado con IDs prefijados por accesión) → 6,55M regiones intergénicas → 4,34M operones → 2.141 motivos de TF → 43 familias de RNA → 2,20M pares motivo–genoma en `transfer_map` → 317,7M hits de escaneo (FIMO + cmscan) → 103.044 membresías de regulones de RegPrecise (gold standard).

### 4.5 Principio de diseño: "escanear una vez, filtrar después"

- FIMO se ejecutó una sola vez para los 2.224 genomas con un umbral permisivo (p ≤ 1e-4): 311,1M hits de TF, 6,6M de reguladores de respuesta y 27.582 hits de RNA (cmscan).
- En MariaDB solo se cargaron los hits con **p ≤ 1e-5**. Los resultados crudos completos siguen en archivos `.tsv.gz`.
- `fimo_hits` es el escaneo crudo, **no es la red regulatoria**. Las redes se materializan aparte (`networks` + `edges`) aplicando umbrales a posteriori.
- ~~`fimo_hits` se escaneó sin el filtro de elegibilidad de `transfer_map`.~~ **Corregido en la semana 12:** en la base, todos los hits de los 312 genomas validables tienen su par (motivo, genoma) en `transfer_map`, que solo guarda pares elegibles (mediana de 1.075 de 2.141 motivos por genoma). La afirmación original probablemente solo vale para los `.tsv.gz` crudos (`robustez_semana12.md`, sección 8.2).

---

## 5. Esquema de la base `regulon_atlas` (tablas clave)

La base tiene 41 tablas en tres capas (genómica, motivos/escaneo, redes/validación/trazabilidad) más tablas puente de vocabularios funcionales (GO, KEGG, EC, CAZy, PFAM, BRITE, COG), con unos 60M pares gen–término.

| Tabla | Filas | Columnas relevantes |
|---|---|---|
| `genomes` | 2.644 | `genome_id`, `accession`, `gtdb_*` (dominio a especie), `ncbi_organism`, `completeness`, `contamination`, `selection` |
| `genes` | 9.440.405 | `gene_id`, `genome_id`, `locus_tag`, `gene_name`, `operon_id`, `operon_role`, `win_start`, `win_end` (la cifra antigua de 7,84M era una estimación de InnoDB) |
| `gene_old_locus` | 8.058.126 | `genome_id`, `old_locus_tag`, `gene_id`. Una fila por gen, sin huérfanos; ningún `old_locus_tag` es igual al `locus_tag`. *E. coli* MG1655 no tiene locus antiguos (sus locus ya son números b) |
| `operons` | ~4,34M | `operon_id`, `genome_id`, `label`, `contig`, `strand`, `n_genes` |
| `motifs` | 2.141 | `motif_id`, `motif_key`, `source` (prodoric/regprecise), `tf_name`, `tf_family`, `source_taxon`, `source_phylum`, `tf_og`, `transfer_rule`, `regulatory_role` |
| `transfer_map` | ~2,2M | Pares motivo–genoma elegibles con su tier (D13) |
| `fimo_hits` | 54.575.443 | `motif_id`, `genome_id`, `gene_id`, `hit_start`, `hit_stop`, `strand`, `score`, `neg_log10_p` |
| `networks` | 5 | `network_id`, `name`, `p_threshold`, `tier_ceiling`, `fdr_method`, `params` (JSON), `prov_id` |
| `edges` | 3.152.092 | `network_id`, `genome_id`, `motif_id`, `target_operon`, `best_gene_id`, `best_score`, `best_neg_log10_p`, `n_sites`, `footprint_enrichment`, `tier`, `confidence` |
| `network_metrics` | 6.427 | Por red y genoma: `n_tf`, `n_targets`, `n_edges`, `density`, grados, `frac_multi_reg`, `n_autoreg`, `n_ffl`, `n_cascade`, `n_components`, `frac_largest` |
| `curated_regulons` | 103.044 | Gold standard RegPrecise: `regulog_id`, `tf_name`, `genome_name`, `locus_tag`, `gene_name` |
| `regprecise_genome_map` | 488 | Mapeo resuelto `genome_name` de RegPrecise → `accession`, con `source` (atlas/ncbi) y `resolved_name` |
| `provenance` | 7 | Fuentes de datos (sección 4.3) |

**Detalles importantes:**

- Las **coordenadas de `fimo_hits` son relativas** a la ventana promotora de cada gen (hasta 350 pb río arriba), no al genoma.
- Las **aristas apuntan a operones** (decisión D10), no a genes. Los genes heredan la pertenencia a la red mediante `operon_id`. `best_gene_id` indica el gen del mejor sitio de unión.
- `edges.confidence` es una **probabilidad calibrada** por arista (script `calibrate_edges.py` del pipeline externo). Ninguna arista tiene `confidence` nula.
- Un mismo TF puede tener **varios motivos** (PRODORIC y RegPrecise), y su nombre puede variar en mayúsculas entre fuentes (MariaDB compara sin distinguir mayúsculas; pandas sí distingue). Para agrupar TF hay que normalizar el nombre (minúsculas). `tf_og` no sirve para agrupar, porque muchos motivos no lo tienen.
- **`motif_key` identifica el origen del motivo:** `RGnnn` es el regulog `nnn` de RegPrecise (coincide con `curated_regulons.regulog_id`); `MXnnnnnn` es PRODORIC. Esto permite detectar autoevaluación en la validación.
- `transfer_rule` de los motivos: `ortholog` (1.265), `tax_fallback_order` (256), `tax_fallback_family` (230), `tax_fallback_phylum` (217), `tax_fallback_genus` (110), `tax_fallback_genome` (28), `unresolved` (21), `tax_fallback_class` (14).
- Tiers que aparecen en `edges`: `within_genus`, `same_genus`, `within_family`, `same_family`, `within_order`, `same_order`, `within_class`, `same_class`, `within_phylum`, `same_phylum` y `cross_phylum`. La diferencia entre `within_*` y `same_*` no está documentada (pregunta abierta).

---

## 6. Redes materializadas por el pipeline externo

El investigador generó cinco redes para todo el atlas (`created_on` = 2026-09-03). Todas registran el método `convergent-empirical + phylo-footprint decoy` y están asociadas en la base a la fuente RegPrecise 3.0 (`prov_id = 5`).

| ID | Red | p | Tier máximo | Footprint ≥ | Aristas | Genomas |
|---|---|---|---|---|---|---|
| 1 | validated | 1e-7 | same_order | 10 | 77.503 | 1.427 |
| 2 | high-precision | 1e-8 | same_family | 50 | 5.711 | 338 |
| 3 | **balanced** | 1e-6 | same_class | 10 | 383.903 | 2.088 |
| 4 | permissive | 1e-6 | cross_phylum | 1 | 2.551.734 | 2.634 |
| 5 | no-footprint | 1e-7 | same_order | 0 | 133.241 | 1.515 |

- **`balanced`** es la red por defecto del dashboard: tiene el F1 más alto en 3 de las 4 combinaciones de la validación propia (sección 10.3), aunque no siempre se distingue de la segunda red (`ampliaciones_semana14.md`, sección 2).
- **`validated` vs `no-footprint`** es un experimento controlado: mismo umbral y tier, solo cambia el footprinting. La validación propia da 1,30× (modo `all`) y 1,37× (modo `independent`).
- La cobertura cae con la exigencia: incluso `balanced` deja ~560 de los 2.644 genomas sin aristas, y `high-precision` cubre solo 338.

### Sobre el pipeline externo

- El código no está en ningún lugar accesible del servidor. Se buscó con `locate`, `find` y `grep` en `/mnt/biostore` y `/home` sin resultado; probablemente está en la carpeta privada del investigador o en otra máquina.
- Lo que se sabe de él viene de la base: los parámetros en `networks.params`, la procedencia en `provenance` y las referencias a decisiones numeradas del investigador, cuyo registro no está disponible.
- **Estrategia adoptada:** no depender de él. Toda evaluación y métrica que se presenta como propia se define y calcula desde la caché, y `network_metrics` se muestra solo como referencia externa. Los valores P/R/F1 anotados en `networks.params.source` no se usan ni se muestran, porque no se puede verificar cómo se calcularon.

---

## 7. Registro de decisiones conocidas

| Decisión | Contenido |
|---|---|
| D1–D3 | GTDB R232 como marco taxonómico; RefSeq como fuente de ensamblajes y anotaciones; embudo de selección |
| D4 | Tres referencias forzadas (*E. coli* K-12, *P. aeruginosa* PAO1, *B. subtilis* 168) |
| D10 | Las aristas apuntan a operones; COG se usa como guarda de reguladores |
| D11 | Catálogo de motivos de PRODORIC + RegPrecise; gold standard de RegPrecise |
| D12 | 43 familias de RNA de Rfam |
| D13 | Regla de transferencia de motivos: ortólogo del TF por COG + respaldo taxonómico con un tier por par (motivo, genoma) |
| D15 | Catálogo final de 2.141 motivos de TF |
| Redes (03-09-2026) | Las cinco redes materializadas, con sus filtros en `networks.params` |
| Post-MVP | Los datos de la base son la fuente principal; el pipeline propio pasa a ser validador independiente |
| Semana 10 | Validación propia a nivel TF–operón, universo (genoma, TF) curado, recall sobre todo el gold standard y modo `independent` sin autoevaluación (sección 10.2) |
| Semana 12 (línea base) | Red de prueba desde `fimo_hits` solo en los 312 genomas validables (no en el atlas); variantes por umbral y techo de tier, sin footprinting; misma validación que la semana 10 |
| Semana 12 | Robustez en dos partes: entre redes (anidamiento, orden, footprinting) y submuestreo de aristas (random, degree-biased, low-confidence; 10–75 %; clases robusta ≥ 0,90 / moderada ≥ 0,70). `n_edges` es trivial en el submuestreo (sección 12) |
| Semana 11 | Métricas propias sobre el grafo TF (nombre normalizado) → operón; `network_metrics` solo como referencia. Comparación entre genomas por taxón GTDB (no PCA ni clusters), porque es la única con equivalente externo (sección 11.2) |

El registro completo de decisiones lo tiene el investigador y está pendiente de solicitar.

---

## 8. Historia del proyecto hasta el MVP (semanas 1–8)

### 8.1 Módulo de validación del MVP (OE5)

- Vivía en `src/validation/benchmark.py`; desde la semana 12 está archivado en `legacy/pipeline_piloto/benchmark_piloto.py` (el scraper y los parsers, en `legacy/ingestion/`).
- Se corrigieron tres errores en el benchmark de *B. subtilis*:
  1. `parse_regprecise.py` generaba locus tags falsos (`REG_xxxxx`) porque las fallas del endpoint FASTA de RegPrecise eran silenciosas (`except: pass`). Se arregló parseando las páginas HTML en caché con BeautifulSoup.
  2. `lxml` no encontraba la tabla `operontbl` en el servidor; se cambió a `html.parser`.
  3. `normalize_id()` no quitaba el prefijo `gene-` de los IDs estilo GFF3; se corrigió con `re.sub(r'(?i)^gene[-_]', '', s)`.
- Resultado de *B. subtilis* tras las correcciones: TP=845, FP=180.457, FN=483, precisión ≈0,47 %, recall ≈63,6 %.
- `map_regprecise_atlas.py` quedó resuelto el 2026-09-22: con el cambio a `html.parser` se mapearon 4.479 de 4.569 páginas, y al reemplazar el join difuso por género/especie por un join directo con `regprecise_genome_map`, las coincidencias con el atlas pasaron de 0 a 33.996 de 41.083 interacciones.
- La validación de *E. coli* K-12 funciona de punta a punta desde el 2026-09-22: `GET /api/v1/metrics/validation/GCF_000005845.2` devuelve precisión y recall reales en 7 umbrales (por ejemplo, TP=459, FP=12.082, precisión 3,66 % en 1e-4, hasta TP=211, FP=435, precisión 32,7 % en 1e-7).

### 8.2 Subconjunto de comparación del MVP

`gtdb_order = 'Enterobacterales'` devuelve 228 genomas, porque el orden de GTDB es más amplio que el de NCBI. El subconjunto final del MVP (`gtdb_family = 'Enterobacteriaceae'` y `selection IN ('forced', 'regprecise_source')`) tiene 8 genomas:

`GCF_000005845.2` (*E. coli* K-12), `GCF_000016305.1` (*K. pneumoniae* MGH 78578), `GCF_000011605.1` (*P. atrosepticum* SCRI1043), `GCF_000006945.2` (*S. enterica* Typhimurium LT2), `GCF_000016325.1` (*Enterobacter* sp. 638), `GCF_000196155.1` (*P. laumondii* TTO1), `GCF_000027205.1` (*E. amylovora* ATCC 49946) y `GCF_000069965.1` (*P. mirabilis* HI4320).

Esta lista estaba en `frontend/src/constants/comparisonGenomes.js`, que se eliminó en la semana 12, cuando Dashboard, Organisms, OrganismDetail y Header pasaron a los datos del atlas.

### 8.3 MVP entregado (etiqueta `mvp-semana8`)

- `make cache`: exporta una caché de solo lectura desde MariaDB a `data/cache/mvp`.
- `make mvp`: `transfer_map` → redes con propagación por operones → métricas NetworkX → validación → `data/results/mvp/report.md`.
- La red del MVP usa p ≤ 1e-5 y las reglas de elegibilidad source_genome + ortholog. Gold standard: RegPrecise (validables *E. coli* y *Salmonella* LT2).
- Verificado desde un clon limpio. El dashboard lee los resultados del pipeline.

### 8.4 Dashboard en el MVP

- Backend migrado de Streamlit a FastAPI (uvicorn, SQLAlchemy asyncio, asyncmy, pydantic-settings, python-dotenv).
- Frontend: Vite + React + Tailwind CSS + Cytoscape.js + Recharts.
- Nueve componentes migrados desde prototipos de Figma: `RegulatoryNetwork`, `Metrics`, `Robustness`, `Comparison`, `Pipeline`, `DataProvenance`, `MVP`, `Fingerprints` y `Validation`. Varios usaban nombres de métodos de API inventados y se están alineando con el `api.js` real (ver pendientes).
- Patrón de componentes: `useState`/`useEffect` + llamadas `api.xxx()`, spinner `Loader2` y mensajes de error en rojo.

---

## 9. Semana 9 — trabajo realizado

### 9.1 Planificación y ramas

Se armó el plan de las semanas 9 a 16 y se creó la rama `dev`.

### 9.2 Auditoría de `fimo_hits`

Archivos: `sql/audit_fimo_coverage.sql`, `scripts/audit_summary.py`, salida en `data/audit/fimo_coverage.tsv` y resumen en `docs/auditoria_semana9.md`.

- **La carga está completa:** 54.575.443 hits.
- **Cobertura del atlas:** 2.222 de 2.224 genomas con hits. Los dos sin hits son micoplasmas (Mycoplasmoidaceae y Metamycoplasmataceae) sin TF elegibles, algo esperado y documentado.
- **Umbral mínimo en la base:** exactamente 1e-5. El barrido desde la base va de 1e-5 a 1e-8; el umbral 1e-4 solo existe en los `.tsv.gz` crudos.
- **El escaneo se limitó a regiones promotoras:** ventanas de hasta 350 pb río arriba (`max hit_stop = 350`).
- **Hits por umbral:** 1e-5 = 54,6M; 1e-6 = 10,1M (18,5 %); 1e-7 = 2,7M (5,0 %); 1e-8 = 1,0M (1,8 %).

### 9.3 Decisión de fuente de datos

Las redes de la base (sección 6) pasan a ser la **fuente principal** de lo que muestra el sistema. El pipeline propio pasa a ser un **validador independiente**.

### 9.4 Caché del atlas (`make cache-atlas`)

- Script `scripts/export_atlas_cache.py`, que usa `get_engine` de `src/database/connection.py`. Se ejecuta con `PYTHONPATH=.`.
- Salida en `data/cache/atlas/` (parquet). Contenido tras la regeneración del 14-10-2026:
  - Completas: `networks` (5), `network_metrics` (6.427), `provenance` (7), `genomes` (2.644, todas las columnas) y `motifs` (2.141, todas las columnas).
  - Para la validación: `curated_regulons` (103.044), `regprecise_genome_map` (488) y `genes_validation` (1.415.837 genes de los genomas cubiertos por RegPrecise, con `gene_id`, `genome_id`, `locus_tag`, `gene_name`, `operon_id` y `old_locus_tag`).
  - `edges_net1` a `edges_net5` (77.503 / 5.711 / 383.903 / 2.551.734 / 133.241): cada red unida con `motifs` (`tf_name`, `tf_family`), `operons` (`operon_label`, `n_genes`) y `genes` (`best_locus`, `best_gene_name`).
  - `manifest.json` con los conteos y la fecha de exportación.
- **Integridad referencial verificada:** los 5 conteos de aristas coinciden exactamente con la base.

### 9.5 API de las redes reales (`src/api/routers/atlas.py`)

Router con prefijo `/atlas`, registrado en `main.py`. Lee solo desde la caché (cada parquet se carga una vez con `lru_cache`).

| Endpoint | Devuelve |
|---|---|
| `GET /api/v1/atlas/networks` | Las 5 redes con sus parámetros (JSON parseado) y número de aristas |
| `GET /api/v1/atlas/networks/{id}/genomes` | Los 2.644 genomas con su número de aristas en esa red (0 si no tienen), ordenados por nombre |
| `GET /api/v1/atlas/networks/{id}/metrics?accession=` | Filas de `network_metrics` con la taxonomía del genoma |
| `GET /api/v1/atlas/networks/{id}/graph/{accession}?min_confidence=&max_edges=` | Subgrafo TF → operón en formato Cytoscape (`elements.nodes` / `elements.edges`) |
| `GET /api/v1/atlas/provenance` | Tabla `provenance` + `manifest.json` de la caché |

Detalles del endpoint del grafo:

- Agrupa por nombre de TF normalizado y por operón, y conserva la arista de mayor `confidence`.
- Ordena por `confidence` y limita a `max_edges` (500 por defecto, máximo 5.000).
- Nodos TF: `node_type: "TF"`, `family`, `motifs`. Nodos operón: `node_type: "Operon"`, `label`, `operon_label`, `n_genes`, `lead_locus`.
- Aristas: `weight` (= `confidence`), `neg_log10_p`, `footprint`, `tier`, `n_sites`.
- Devuelve `total_edges`, `filtered_edges` y `shown_edges`.
- Los mensajes de error de la API están en inglés.

### 9.6 Diagnóstico de `network_metrics`

Script `scripts/check_metrics_coverage.py`.

- **Cobertura:** solo genomas del atlas; faltan entre 0 y 14 genomas del atlas por red (1.122, 207, 1.704, 2.205 y 1.189 genomas con métricas).
- **Consistencia:** los conteos **no se pueden reproducir desde `edges`**. Para *E. coli* K-12 en `balanced`, `network_metrics` dice 68 TF, 310 dianas y 919 aristas; `edges` tiene 832 filas, 118 TF, 218 motivos, 342 operones y 485 pares TF–operón. Agrupar por `tf_og` da 37, así que esa hipótesis se descartó.
- **Decisión:** recalcular las métricas con NetworkX desde `edges` (semana 11) y usar `network_metrics` solo como referencia externa.

### 9.7 Dashboard: `RegulatoryNetwork.jsx` con datos reales

- Selector de red (por defecto `balanced` con *E. coli* K-12), con los filtros de la red.
- Buscador de organismos con sugerencias sobre los 2.644 genomas, navegable con teclado; marca en gris los que no tienen aristas en la red actual. El organismo se mantiene al cambiar de red.
- Filtros de confianza mínima y de límite de aristas dibujadas.
- Grafo con TF en verde y operones en azul; el grosor refleja `confidence`. Panel lateral con familia, motivos (`RG` = RegPrecise, `MX` = PRODORIC), genes del operón, confianza y tier.
- **Layout determinista:** fcose sembrado, calculado antes de entregar los nodos a Cytoscape. Solo el botón "Rearrange" cambia el dibujo; la semilla se guarda en `localStorage`.
- Redes pequeñas en dos filas (≤12 nodos) y etiquetas completas hasta 60 nodos.

---

## 10. Semana 10 — trabajo realizado (7 al 14 de octubre)

### 10.1 Backend y frontend sin la base

- `routers/genomes.py` y `routers/motifs.py` leen la caché (`lru_cache`; responden 503 si falta).
- `routers/fingerprints.py` **se eliminó** (devolvía datos inventados con fórmulas fijas), junto con su import y su `include_router`. Ningún archivo de `src/api` usa `get_db` ni `get_engine`.
- `routers/robustness.py` respondía "pending" hasta la semana 12; se eliminó en la limpieza de esa semana, igual que `graphs.py`, `metrics.py` y `results.py`, que eran del MVP.
- Componentes compartidos nuevos:
  - `components/NetworkSelector.jsx` (props `networks`, `value`, `onChange`).
  - `components/OrganismSearch.jsx` (props `options` `[{id, label, muted, meta}]`, `value`, `onChange`, `disabled`).
  - `utils/atlas.js` (`DEFAULT_NETWORK = 3`, `DEFAULT_GENOME = GCF_000005845.2`, `ATLAS_SELECTIONS`, `fmtInt`, `fmtP`, `networkFilters`, `selectClass`; desde la semana 12 también `ATLAS_GENOMES` e `isAtlasSelection`).
- `RegulatoryNetwork.jsx` usa los componentes compartidos (se corrigió un selector duplicado).
- `Metrics.jsx`: 2.644 genomas, tarjetas, histograma en el atlas, ranking y tabla de la familia GTDB, con aviso de que `network_metrics` es externo.
- `Fingerprints.jsx`: percentil de 7 métricas en todo el atlas, radar (genoma + mediana de la familia + mediana del atlas + hasta 4 comparadores) y matriz de la familia.
- **Misterio resuelto:** `GCF_000013425.1` está entre los 10 genomas piloto de `data/genomes/atlas_genomes/`, lo que explica su `expanded_network.tsv`.

### 10.2 Validación propia de las 5 redes (OE5)

Detalle completo en `docs/validacion_semana10.md`.

- **Exploración previa:** `scripts/explore_validation.py` (salidas en `data/audit/validation_*`).
- **Módulo:** `src/validation/atlas.py`, ejecutado con `make validate-atlas`. Lee solo la caché y escribe en `data/results/validation/regprecise/` (`summary.tsv`, `pr_curve.tsv`, `by_tier.tsv`, `by_origin.tsv`, `by_genome.tsv`, `locus_mapping.tsv` y `manifest.json`).
- **Definición:**
  - Nivel TF → operón; genes curados proyectados por `operon_id`, emparejados por `locus_tag` y luego `old_locus_tag`.
  - TF por nombre normalizado; un par por (genoma, TF, operón) con la arista de mayor `confidence`.
  - Universo principal `genome_tf` (solo pares (genoma, TF) curados; el resto es "no evaluable") y universo estricto `genome`.
  - Recall sobre todo el gold standard proyectado.
  - Modo `all` y modo `independent` (excluye motivos `RGnnn` cuyo regulog contiene al genoma evaluado).
  - Curva P/R barriendo `confidence` de 0 a 1 en pasos de 0,01.
  - Parámetro `--gold regprecise|regulondb` (RegulonDB todavía no implementado).
- **Gold standard proyectado:** 37.266 pares TF–operón en 312 genomas. Se pierde el 28 % de las 103.044 filas curadas: 11.450 sin genoma en la base y 17.687 con locus sin emparejar. `old_locus_tag` resolvió 70.424 filas.

### 10.3 Resultados principales

| Red | P | R | F1 | F1 `independent` |
|---|---|---|---|---|
| validated | 0,784 | 0,220 | 0,343 | 0,160 |
| high-precision | 0,861 | 0,043 | 0,081 | 0,019 |
| **balanced** | 0,612 | 0,332 | **0,431** | **0,318** |
| permissive | 0,342 | 0,434 | 0,383 | 0,314 |
| no-footprint | 0,601 | 0,309 | 0,408 | 0,179 |

*(Universo `genome_tf`; P, R y F1 en modo `all`.)*

- **La precisión depende del universo evaluado:** al pasar de `genome_tf` a `genome` (modo `all`) baja entre 0,085 y 0,259 (`balanced`, de 0,612 a 0,353).
- **La circularidad infla el recall:** en modo `independent` el recall cae entre 24 % y 79 % (`balanced` de 0,332 a 0,219; `validated` de 0,220 a 0,089), mientras la precisión baja como mucho 0,11.
- **`balanced` es la mejor red** en 3 de las 4 combinaciones de modo y universo.
- **La precisión cae con la distancia taxonómica** del motivo transferido: en `permissive`, de 0,74 (`within_family`) a 0,05 (`cross_phylum`).
- **Solo una fracción de cada red es evaluable:** 9,7 % de los pares en `balanced`, 3,8 % en `permissive`.

### 10.4 API y vista de validación

- Router `src/api/routers/atlas_validation.py` (prefijo `/atlas/validation`), que solo lee los TSV; la caché se invalida sola cuando cambia la fecha del archivo.

| Endpoint | Devuelve |
|---|---|
| `GET /api/v1/atlas/validation/manifest` | Definición de la evaluación, estadísticas del gold standard, commit y fecha |
| `GET /api/v1/atlas/validation/summary?mode=&universe=` | P/R/F1 por red, modo y universo |
| `GET /api/v1/atlas/validation/curve?network_id=&mode=` | Curva P/R (sin `network_id` devuelve las 5 redes) |
| `GET /api/v1/atlas/validation/breakdown/{tier\|origin}?network_id=&mode=` | Precisión por tier o por origen del motivo |
| `GET /api/v1/atlas/validation/genomes?network_id=&mode=&accession=&limit=` | TP/FP/FN, precisión y recall por genoma |
| `GET /api/v1/atlas/validation/locus-mapping?max_rate=` | Tasa de emparejamiento de locus por genoma |

- Métodos nuevos en `api.js`: `getAtlasValidationManifest`, `getAtlasValidationSummary`, `getAtlasValidationCurve`, `getAtlasValidationBreakdown` y `getAtlasValidationGenomes`.
- `Validation.jsx` reescrita: selector de red, modo (`all`/`independent`) y universo; tabla de las 5 redes con sus filtros; curvas P/R de las 5 redes; curva de umbral de `confidence` con la fracción de pares conservados; desglose por tier y por origen; ficha por genoma para los 312 genomas validables. Funciona con todos los genomas.

---

## 11. Semana 11 — trabajo realizado (15 al 19 de octubre)

Detalle completo en `docs/metricas_semana11.md` y `docs/correcciones_semana11.md`.

### 11.1 Métricas propias (OE4)

- **Exploración:** `scripts/explore_metrics.py`. Solo se ubica por nombre el ~18 % de los TF (mediana en `balanced`), así que las métricas jerárquicas quedan como cota inferior.
- **Módulo:** `src/networks/atlas_metrics.py` (`make metrics-atlas`) → `data/results/metrics/` (`atlas_metrics.{parquet,tsv}`, 13.220 filas = 2.644 genomas × 5 redes; `metrics_vs_external.tsv`; `manifest.json`).
- **Grafo:** TF por nombre normalizado → operón, un par por (genoma, TF, operón) con la mayor `confidence`. Métricas de tamaño, normalizadas (`density = n_edges / (n_tf × n_targets)`), de grado, entropía, Gini, `hub_share` y componentes.
- **Control:** E. coli K-12 en `balanced` = 118 TF, 342 dianas, 485 pares.
- **Frente a `network_metrics`:** `n_targets` coincide casi 1:1 (ρ 0,95–0,998); `n_edges` propio ≈ 0,55× el externo; la `density` externa es `n_edges / (n_tf × todos los operones del genoma)` (comprobado en las 6.427 filas), así que no es comparable con la propia. `n_edges` y `n_tf` externos siguen sin poder reproducirse (`preguntas_pendientes.md`, P1).

### 11.2 Comparación entre taxones

- **Criterio:** resultados lo más cercanos posible al pipeline externo. Se eligió la comparación por taxón (opción A) frente a PCA o clusters, porque es la única con equivalente externo.
- **Exploración:** `scripts/explore_comparison.py`. **Módulo:** `src/networks/atlas_comparison.py` (`make comparison-atlas`) → `data/results/comparison/` (`by_taxon.tsv`, `taxon_tests.tsv`, `manifest.json`).
- **Definición:** genomas del atlas con aristas y con fila en `network_metrics` (los mismos para ambas fuentes); filo, clase, orden y familia de GTDB; taxones con ≥ 5 genomas; Kruskal–Wallis + ε²; concordancia = Spearman de las medianas por taxón (alta ≥ 0,85).
- **Resultado:** `n_targets`, `n_edges`, `max_out_degree` y `n_tf` ordenan los taxones como `network_metrics` (ρ ≥ 0,936 en `balanced`); Kruskal–Wallis llega a la misma conclusión en el 95 % de las combinaciones. El taxón explica ~40 % (filo) a >70 % (orden/familia) del tamaño de la red. Las métricas de grado de entrada no son comparables con la tabla externa.
- **Ese efecto del taxón es sobre todo metodológico** (`scripts/explore_motif_origin.py`, `metricas_semana11.md` sección 8.5): se ubicó en GTDB el origen del 98–100 % de los motivos; en `balanced`, el tamaño del genoma más la oferta de motivos de la misma familia/orden/clase explican el 88 % del efecto del filo sobre el número de TF (el filo solo agrega R² 0,056). `Comparison.jsx` lo advierte.

### 11.3 API y vistas

| Endpoint | Devuelve |
|---|---|
| `GET /api/v1/atlas/metrics?network_id=&accession=&atlas_only=&with_edges_only=` | Métricas propias de todos los genomas de una red |
| `GET /api/v1/atlas/metrics/{definitions,summary,compare-external,genomes}` | Manifest, medianas y percentiles, concordancia con la tabla externa, métricas de una lista de genomas |
| `GET /api/v1/atlas/comparison/taxa?network_id=&level=&metric=` | Distribución propia y externa por taxón (`level` = phylum, class, order, family) |
| `GET /api/v1/atlas/comparison/tests?network_id=&level=` | Kruskal–Wallis, ε² y concordancia por métrica |
| `GET /api/v1/atlas/comparison/manifest` | Definición y commit |

- Métodos nuevos en `api.js`: `getAtlasOwnMetrics`, `getAtlasMetricsDefinitions`, `getAtlasMetricsSummary`, `getAtlasMetricsVsExternal`, `getAtlasOwnMetricsForGenomes`, `getAtlasComparisonManifest`, `getAtlasComparisonTaxa` y `getAtlasComparisonTests`.
- `Metrics.jsx` y `Fingerprints.jsx` usan las métricas propias (E. coli en `balanced`: 485 pares, no los 919 externos).
- `Comparison.jsx` reescrita como *Taxon Comparison*: mediana propia con rango intercuartílico por taxón, mediana externa como punto, tabla de concordancia y tabla de taxones.
- `Fingerprints` y `Comparison` se agregaron a `App.jsx`, `Sidebar` y `Header` (antes no eran accesibles).
- `utils/atlas.js` agrega `isAtlasSelection()`.

### 11.4 Correcciones y control de calidad

- **El commit `06e5140` dejó la API sin arrancar** (`main.py` importaba `atlas_metrics_router`). Se corrigió en `73c7a34`.
- **El genoma `replacement` (*Gordonia iterans*, `GCF_002993285.1`) quedaba fuera del atlas** porque `selection` lleva una nota; se compara la primera palabra (`a1b5dfc`). El atlas vuelve a tener 2.224 genomas en las métricas.
- **Trazabilidad:** los manifiestos de métricas, validación y comparación guardan `git_dirty`; los resultados se generan con el árbol limpio.
- **`make check` y hook `pre-commit` versionado** (`make hooks`): verifican sobre el índice que la API importa, que `src/api` no usa `get_db` y que el frontend compila; `make check` además ejecuta `pytest` (`tests/test_api_atlas_metrics.py`, `tests/test_api_atlas_comparison.py`, `tests/test_api_atlas_validation.py`; 22 pruebas). Se instalaron `pytest` y `httpx` en `bioinfo`.

---

## 12. Semana 12 — trabajo realizado (19 al 26 de octubre)

Detalle completo en `docs/robustez_semana12.md`.

- **Cierre de la semana 11:** `main` avanzó (fast-forward) hasta `f2d5df3`, con la etiqueta `semana11-metricas`. `main` seguía en la semana 8; ahora incluye las semanas 9 a 11. La etiqueta antigua `semana10-sweep` apunta al MVP (`b628e54`) y no se tocó.
- **Dos análisis de robustez:** (A) entre redes, que es el plan original, y (B) submuestreo de aristas, que es lo que proponía el prototipo de `Robustness.jsx`.
- **Exploración:** `scripts/explore_robustness.py`. **Módulo:** `src/networks/atlas_robustness.py` (`make robustness-atlas`, 24 procesos, ~8 min) → `data/results/robustness/`.
- **Resultados A:**
  - Las redes están anidadas: high-precision ⊂ validated ⊂ balanced ⊂ permissive, y validated ⊂ no-footprint.
  - El orden de los genomas se mantiene entre redes vecinas en las métricas de tamaño (ρ 0,75–0,91), pero no entre redes lejanas.
  - Las métricas de estructura (`frac_largest`, `frac_multi_reg`) dependen de la red.
  - El footprinting quita ~40 % de los pares y conserva el orden (ρ 0,96).
- **Resultados B:**
  - Con el 50 % de las aristas eliminadas, `n_tf`, `n_targets` y `frac_genome_targeted` son robustas en todas las redes y estrategias (ρ ≥ 0,98 en `balanced`). `frac_largest` y `out_degree_entropy` no lo son.
  - Eliminar las aristas de menor `confidence` degrada la estructura casi tanto como perder los hubs.
  - En total, 136 de 210 combinaciones son robustas a ese nivel.
- **Conclusión para la tesis:** las métricas que coinciden con el pipeline externo (semana 11) son las mismas que resultan robustas.
- **API:** `/api/v1/atlas/robustness/{manifest, nesting, between, footprint, subsampling, subsampling/genome}`. Métodos `getAtlasRobustness*` en `api.js`.
- **Vista:** `Robustness.jsx` reescrita y en el menú. El router antiguo `/robustness` del MVP sigue respondiendo "pending".
- **Corrección:** `n_edges` es trivial en las tres estrategias (`38222a8`). El cálculo se repitió con el árbol limpio.
- **Pruebas:** 28 (`tests/test_api_atlas_robustness.py`).
- **Línea base del pipeline propio (análisis C).** El usuario aprobó hacerla solo en los 312 genomas validables, porque es una red de prueba.
  - **Datos:** `scripts/export_fimo_cache.py` (`make cache-fimo`) → `fimo_hits_validation.parquet` (7.376.281 hits) y `transfer_map_validation.parquet` (320.938 pares), verificados con `COUNT(*)` por lote.
  - **Módulo:** `src/networks/atlas_baseline.py` (`make baseline-atlas`). Variantes `scan`, `order_ceiling` y `class_ceiling` a p ≤ 1e-5…1e-8, validadas igual que la semana 10.
  - **Hallazgo clave:** el pipeline externo es **umbral + techo de tier + footprinting**. A nivel de arista (genoma, motivo, operón), `no-footprint` sale exactamente de los hits (incluido `n_sites`), y `validated`, `high-precision` y `balanced` salen exactamente de su red madre con el mínimo de footprint declarado; `permissive` no es comprobable (`robustez_semana12.md`, 8.4). A nivel de pares: `no-footprint` se reproduce **exactamente** desde los hits crudos (Jaccard 1,0), y las otras 4 redes están 100 % dentro de su línea base. El footprinting conserva entre el 27 y el 51 % de los pares; el método convergent-empirical y la calibración no eliminan pares.
  - **Aporte de los filtros:** con el mismo umbral y tier, el footprinting duplica la precisión de `balanced` (0,312 → 0,612; F1 0,378 → 0,431). Con un tamaño similar, `balanced` supera a la mejor línea base, sobre todo en modo `independent` (F1 0,318 frente a 0,255).
  - **Integración:** API `/api/v1/atlas/baseline/{manifest, summary, reproduction, reproduction-edges}` y sección *Own baseline vs external networks* en `Validation.jsx`. 33 pruebas.

### 12.1 Limpieza del proyecto

Detalle en `docs/limpieza_semana12.md`. Respaldo previo: rama `respaldo/pre-limpieza-semana12` (`3802d6e`).

- **Entorno:** `environment.yml` regenerado desde `bioinfo`; resuelve con `conda env create --dry-run`.
- **Eliminado:** routers `/robustness`, `/graphs` y `/metrics` del MVP, `src/api/results.py`, `comparisonGenomes.js`, métodos antiguos de `api.js` y archivos sin uso. La API ya no depende de `src/pipeline`.
- **Archivado:** `src/ingestion/` y el pipeline piloto pasaron a `legacy/`, y `data/genomes/` (75 MB) salió de git. Los datos versionados bajaron de 90,1 a 11,8 MB.
- **Vistas:** Dashboard, Organisms y OrganismDetail usan el atlas (antes, los 8 genomas del MVP). El Header muestra "2,224 genomes · 5 networks".
- **Código:** `src/atlas_common.py` con las reglas comunes (los 20 archivos de resultados son idénticos antes y después); `utils/metrics.js` con un nombre único por métrica; carga diferida (el paquete JS inicial bajó de 1.278 a 254 kB); `Validation.jsx` dividido; Pydantic al día.
- **Calidad:** 46 pruebas (13 unitarias nuevas); ESLint en `make check` (0 errores); `make help` y `make atlas`; `.gitignore` ordenado; README reescrito.
- **Etiquetas:** nuevas `semana09-auditoria` y `semana10-validacion`; eliminada `semana10-sweep` (apuntaba al commit del MVP `b628e54`).

### 12.2 Cierre de la semana 12 (20 al 26 de octubre)

- **Bitácora de Claude Code** (20-10): `docs/bitacora_claude_code.md`, recorrido del 15 al 20-10-2026 para la memoria.
- **Pruebas de aceptación del MVP** (26-10, `db6c33e`): CA1–CA6 sobre la etiqueta `mvp-semana8` (`d056fc9`) desde un clon limpio. 6 aprobadas (CA3 con observaciones), 0 fallidas. `make mvp` tarda 19 s y es determinista salvo fechas; E. coli coincide con lo informado. Registro en `docs/evidencia_mvp/pruebas_aceptacion_mvp.md`; la evidencia (registros, capturas, scripts, Excel) queda solo en el servidor (`.gitignore`).
- **Corrección:** la entrega `mvp-semana8` es `d056fc9`, no `b628e54` como decía la bitácora.
- **Verificación del cierre:** los 5 `manifest.json` de resultados tienen `git_dirty: false`; `make check` pasa (46 pruebas); los 32 endpoints GET de la API responden 200 y los valores de control coinciden (E. coli en balanced: 118 TF, 342 operones, 485 pares; validación balanced P = 0,612, R = 0,332, F1 = 0,431). Revisión visual del estudiante (26-10-2026): Robustness, la línea base de Validation, Dashboard, Organisms, OrganismDetail, Fingerprints y Comparison funcionan.
- **`.env`:** el estudiante borró el espacio de la línea 8 (26-10-2026). Claude no leyó el archivo.
- **Borradores de mensaje** actualizados con los resultados de la semana 12 (`docs/preguntas_pendientes.md`).
- **Ramas:** la semana 12 queda solo en `dev`; no se fusionó a `main` ni se creó etiqueta, por decisión del estudiante.

---

## 13. Arquitectura actual

```
MariaDB regulon_atlas (solo SELECT)
        │  make cache-atlas            make cache (MVP)
        ▼                               ▼
data/cache/atlas/*.parquet       data/cache/mvp/
        │   make validate-atlas         │  make mvp
        ├──────────────► data/results/validation/
        │   make metrics-atlas          │
        ├──────────────► data/results/metrics/
        │   make comparison-atlas (lee metrics/)
        ├──────────────► data/results/comparison/
        │   make robustness-atlas (lee metrics/ y edges)
        ├──────────────► data/results/robustness/
        │   make cache-fimo (312 genomas)  →  make baseline-atlas
        ├──────────────► data/results/baseline/
        │                               ▼
        │                        data/results/mvp/ (pipeline propio)
        ▼                               │
FastAPI src/api ── routers: system, genomes, motifs + atlas + atlas_validation
                   + atlas_metrics + atlas_comparison + atlas_robustness + atlas_baseline
                   + atlas_status (semana 13: lee los manifest.json; src/atlas_status.py)
                   (solo leen data/cache/atlas y data/results; src/atlas_common.py para las reglas comunes)
        │
        ▼
React (Vite + Tailwind + Recharts + Cytoscape.js) ── frontend/src/services/api.js
   vistas: Dashboard, Organisms (+ OrganismDetail), Regulatory Networks, Metrics, Fingerprints, Taxon Comparison,
           Robustness, Validation (con la línea base) y, en SYSTEM, Pipeline y Data Provenance (leen /atlas/status)

make all (= make atlas) ── make atlas-ready (caché completa y árbol limpio) → validate → metrics → comparison
                           → robustness → baseline; el MVP solo con make mvp
make check / pre-commit ── API importa, sin get_db, frontend compila, ESLint sin errores, pytest (tests/)
legacy/ ── ingesta (semanas 1–7) y pipeline piloto: no se usan; ver legacy/README.md
```

---

## 14. Plan de las semanas restantes

| Semana | Trabajo |
|---|---|
| 9 | Auditoría, caché del atlas, API `/atlas` y `RegulatoryNetwork` (hecho) |
| 10 | Validación propia de las 5 redes contra RegPrecise, modo independiente, curva P/R, API y `Validation.jsx`; `Metrics.jsx` y `Fingerprints.jsx` con datos reales (hecho). Pendiente: punto del MVP en la curva y RegulonDB si se aprueba |
| 11 | Métricas propias con NetworkX para los 2.644 genomas y las 5 redes, comparadas con `network_metrics`; comparación por filo/clase/orden/familia; `Metrics`, `Fingerprints` y `Comparison` sobre las métricas propias; `make check` y pruebas (hecho). No se hizo el enriquecimiento funcional opcional |
| 12 | Robustez entre las 5 redes y frente a submuestreo de aristas; componente `Robustness`; línea base del pipeline propio desde `fimo_hits` (1e-5 a 1e-8, sin footprinting) en los 312 genomas validables, contra las redes externas; limpieza; pruebas de aceptación del MVP (hecho, cerrada el 26-10-2026 en `dev`) |
| 13 | **Cerrada el 29-10-2026** (`docs/sistema_semana13.md`). Hecho: endpoint `/atlas/status` y vista `DataProvenance`; pasada de presentación de las vistas, aprobada por el estudiante (respaldo `respaldo-pre-presentacion-semana13`) (27-10-2026). Vista `Pipeline` (29-10-2026). Vistas `MVP` y `Settings` descartadas por el estudiante. `make all` corre todo el análisis del atlas (29-10-2026; el MVP solo con `make mvp`). Revisión previa de `make all` y prueba de reproducibilidad en un clon aparte: 20/20 archivos idénticos (29-10-2026, `docs/evidencia_reproducibilidad/`). Revisión completa (29-10-2026, `docs/revision_semana13.md`): sin errores graves; los 13 hallazgos (1 error menor, 6 mejoras, 6 detalles) y 1 advertencia de ESLint corregidos el mismo día. **Funciones congeladas (v1.0)** el 29-10-2026 → `docs/congelamiento_v1.md`; etiqueta `congelamiento-v1` (`d9bcf58`) |
| 14 | En curso. **Prueba desde cero hecha el 04-11-2026** (`docs/evidencia_instalacion/prueba_desde_cero.md`): entorno nuevo, 20/20 resultados con los mismos valores, 108 de 109 casos aprobados; hallazgo H1 corregido el mismo día (README: `npm ci` en vez de `npm install`). **Pruebas ampliadas el 09-11-2026** (`docs/pruebas_semana14.md`): de 58 a 123; el hallazgo H2 (500 sin caché en `/atlas/networks` y `/atlas/provenance`) se corrigió el mismo día (`71771e2`) y pasan 123 de 123; 88 corren en un clon sin `data/`. **Ampliaciones E1–E7 el 23-11-2026** (`docs/ampliaciones_semana14.md`, `make extensions`, fuera de `make all`): intervalos de confianza, modos lado a lado, comparación ajustada, precisión esperada por genoma, RegulonDB, MVP frente al atlas y avisos de cobertura; 147 pruebas. **Para el informe:** `balanced` está entre las mejores redes, pero no siempre se distingue de la segunda. Falta: etiqueta `v1.0`, cuando el estudiante lo indique. El README ya se reescribió en la semana 12 |
| 15 | Redacción de resultados y discusión, con figuras exportadas del sistema; sección de limitaciones |
| 16 | Preparación de la defensa, guion de demo con capturas de respaldo y holgura |

**Si falta tiempo, se recorta en este orden:** primero la línea base de la semana 12, después las huellas de la semana 11 (reducidas a 2 o 3 métricas). No se recortan la validación ni las pruebas.

### Rol del pipeline propio

- **Semana 10 (hecho):** la validación propia evalúa las 5 redes de forma independiente desde la caché.
- **Semana 11 (hecho):** su cálculo con NetworkX genera las métricas propias, con una definición de grafo documentada, y la comparación entre taxones.
- **Semana 12 (hecho):** la línea base sin filtros sofisticados mide cuánto aportan los filtros externos y reproduce exactamente `no-footprint`.
- **Semana 13 (hecho):** `make all` corre todo el análisis del atlas, incluida la línea base (29-10-2026).
- **Semana 13 (hecho):** prueba de reproducibilidad desde un clon limpio: `make all` reproduce byte a byte los 20 archivos de resultados (29-10-2026).
- **Semana 14:** la misma prueba creando el entorno desde cero (`conda env create`).

### Plan de RegulonDB (si se aprueba)

- **Alcance:** solo *E. coli* K-12 MG1655 (`GCF_000005845.2`, `genome_id` 1869).
- **Descarga:** interacciones TF–gen con nivel de evidencia en `data/raw/regulondb/`, con un `manifest.json` propio (versión, fecha, URL). Revisar condiciones de uso y cita.
- **Procesamiento (`make regulondb`):** `data/processed/curated/regulondb/regulondb_tf_gene.tsv` con `tf_name`, `target_locus`, `target_gene`, `effect` y `evidence`. Genes por número b; TF por nombre normalizado más una tabla de alias para complejos (`IHF`, `RcsB-BglJ`).
- **Validación:** implementar la rama `--gold regulondb` de `src/validation/atlas.py` con la misma definición (TF → operón). Resultado mostrado lado a lado en `Validation.jsx`.

---

## 15. Cómo presentarlo en el informe

- Declarar explícitamente que las redes analizadas las generó un pipeline externo del investigador, presentado como **decisión de diseño** (cobertura completa del atlas, filtros de especificidad que el pipeline propio no tiene, evitar duplicar trabajo y un segundo atlas incompatible).
- Separar la autoría:
  - **Externo:** la base `regulon_atlas`, las redes materializadas y `network_metrics`.
  - **Propio:** la auditoría de datos, la caché, la API, la validación independiente (definición, modo sin autoevaluación, curva P/R, desglose por tier), las métricas topológicas propias y la comparación entre taxones con su concordancia con `network_metrics`, el pipeline local como validador, las pruebas y el dashboard.
- Usar `balanced` como red principal y presentar las cifras de validación como rangos: precisión entre el universo `genome` y `genome_tf`; recall entre el modo `independent` y `all`.
- Declarar las limitaciones: sin acceso al código del pipeline externo, valores P/R/F1 anotados en la base sin definición verificable (no se usan), 28 % del gold standard sin mapear, solo una fracción de cada red evaluable, `network_metrics` no reproducible desde `edges` y trazabilidad hacia atrás solo hasta `provenance`.
- Citar al investigador según lo que él indique.

---

## 16. Pendientes y preguntas abiertas

Las preguntas completas para el investigador y el profesor, con un borrador de mensaje, están en `docs/preguntas_pendientes.md`. El índice de toda la documentación y la bitácora de trabajo están en `docs/README.md`. Las más urgentes:

- **Investigador:** cómo se calcularon los P/R/F1 anotados en `networks.params.source` (nivel de comparación, versión de RegPrecise); cómo se contaron los FP; si se excluyó la autoevaluación; diferencia entre tiers `within_*` y `same_*`; calibración de `confidence`; acceso al código y al registro de decisiones; versión de RegPrecise (3.0 en `provenance`, 3.2 en el MVP; P7).
- **Profesor:** aprobación del cambio de alcance; `balanced` como red principal con cifras del modo `independent`; RegulonDB obligatorio o complementario; fechas y formato del informe y la defensa.

### Pendientes técnicos

- *(Hecho el 26-10-2026: línea 8 del `.env` corregida por el estudiante; revisión visual de Robustness, Validation (línea base), Dashboard, Organisms, OrganismDetail, Fingerprints y Comparison sin problemas. Ver 12.2.)*
- Enviar los mensajes al investigador y al profesor (borradores al final de `docs/preguntas_pendientes.md`, actualizados el 26-10-2026). Los envía el usuario.
- Observaciones de las pruebas del MVP, sin corregir (la etiqueta `mvp-semana8` queda congelada): la procedencia no registra la versión ni la fecha de descarga de PRODORIC, la fecha de descarga de RegPrecise ni las versiones del entorno; el commit de la caché (`9e0b73c`) ya no existe. Considerarlas en la procedencia del atlas (`DataProvenance`, semana 13).
- *(Hecho el 19-10-2026: `make validate-atlas` repetido con el árbol limpio, resultados idénticos; hipótesis del origen de los motivos comprobada.)*
- *(Hecho el 23-11-2026: MVP frente al atlas en los mismos 8 genomas; `docs/ampliaciones_semana14.md`, sección 6.)*
- Mantener `docs/auditoria_semana9.md`, `docs/validacion_semana10.md`, `docs/metricas_semana11.md`, `docs/correcciones_semana11.md`, `docs/robustez_semana12.md` y `docs/limpieza_semana12.md` al día.
- *(Hecho el 09-11-2026: hallazgo H2 corregido, `/atlas/networks` y `/atlas/provenance` responden 503 sin la caché; `docs/pruebas_semana14.md`, sección 7.1.)*
- 18 advertencias de ESLint del React Compiler (documentadas en `eslint.config.js`); revisar al tocar esas vistas en la semana 13.

---

## 17. Lecciones técnicas y forma de trabajo

### Lecciones aprendidas

- **"Escanear una vez, filtrar después":** la falta temporal de acceso a la base no bloquea el trabajo; se priorizan salidas en archivos planos.
- **En este servidor, BeautifulSoup debe usar `html.parser`:** `lxml` puede fallar en silencio al buscar tablas.
- **Nunca inventar nombres de métodos de la API:** siempre obtener el `api.js` real (y la estructura de las respuestas) antes de escribir componentes.
- **Normalizar IDs biológicos con cuidado:** quitar prefijos como `gene-`/`gene_`, normalizar mayúsculas en nombres de TF y probar `old_locus_tag` cuando `locus_tag` no coincide.
- **Nada de `except: pass`** en scripts de ingesta: provocó corrupción silenciosa de datos con RegPrecise.
- **Las métricas de NetworkX se calculan en el servidor;** al navegador solo llegan subgrafos limitados, nunca grafos completos.
- **Verificar integridad tras cada exportación** (comparar conteos con la base) y documentar cualquier discrepancia como hallazgo.
- **No asumir que métricas precalculadas son reproducibles:** compararlas contra los datos de origen antes de mostrarlas.
- **Los conteos de InnoDB son estimaciones:** usar `COUNT(*)` para cifras que van a la tesis.
- **Sin acceso al código externo, definir la evaluación propia** y usar los valores externos como prueba de cordura, no como objetivo.
- **Revisar la circularidad en toda validación:** si los motivos se construyeron con el mismo gold standard, separar el modo independiente.
- **Calcular offline y servir resultados:** la validación pesada corre con `make`; la API solo lee archivos.
- **Verificar lo que entra en el commit, no la copia de trabajo:** un archivo local corregido no garantiza un commit sano (`06e5140`). El hook `pre-commit` revisa el índice.
- **Los campos categóricos pueden traer notas:** `selection` del genoma de reemplazo lleva texto extra; comparar por la primera palabra y contrastar el conteo (2.224) después de cada filtro.
- **Generar resultados con el árbol limpio:** el manifiesto debe apuntar a un commit que contenga el código que los produjo (`git_dirty: false`). Si hay documentos a medio editar, se guardan con `git stash` durante **todo** el cálculo, no solo al inicio.
- **El hook pre-commit sirve:** en la limpieza de la semana 12 bloqueó dos commits que habrían dejado la API o ESLint rotos, porque el índice tenía la mitad de un cambio (por ejemplo, un `git rm` sin el archivo nuevo que lo reemplazaba).
- **Antes de refactorizar, comparar resultados:** al unificar las funciones comunes se regeneraron los 20 archivos de resultados y se compararon con `assert_frame_equal` (idénticos).
- **Revisar si una métrica es trivial por construcción:** en el submuestreo, `n_edges` no cambia de orden porque se elimina una fracción fija de pares; contarla como "robusta" infla el resultado.

### Forma de trabajo

- Desarrollo iterativo e incremental: se construye sobre lo existente, no se reinicia.
- Para componentes nuevos se toma un archivo de referencia que funciona y se replica su patrón exacto.
- Depuración por capas: error visible → causa raíz → corregir el origen antes que los síntomas.
- Explorar antes de construir: un script de exploración rápido fija las decisiones antes de escribir el módulo definitivo.
- Comandos pensados para la terminal de VS Code por SSH; procesos largos con `nohup`.
- Redacción de la tesis en español, concisa y en lenguaje simple, ajustada a la rúbrica sin extensión innecesaria; se refina con instrucciones cortas y específicas.
- Texto visible del dashboard en inglés.

### Herramientas

- **Bioinformática:** FIMO, cmscan, PRODORIC, RegPrecise, RegulonDB, eggNOG v7, `ncbi-datasets-cli`, GTDB R232, NCBI RefSeq, GFF3, NetworkX, BeautifulSoup.
- **Backend:** FastAPI, uvicorn, SQLAlchemy (asyncio y pymysql), asyncmy, MariaDB, Pydantic, python-dotenv, pandas, pyarrow.
- **Frontend:** Vite, React (JSX), Tailwind CSS, Cytoscape.js con fcose, react-cytoscapejs, Recharts, lucide-react, axios.
- **Diseño:** prototipos en Figma (pensados en modo oscuro); el dashboard actual usa tonos teal/azul sobre fondo claro, fuente monoespaciada para IDs genómicos; referencias visuales: UCSC Genome Browser, STRING-db y Ensembl.

---

## 18. Comandos frecuentes

```bash
# Rama de trabajo
cd ~/proyecto && git checkout dev

# Regenerar la caché del atlas (en segundo plano)
nohup make cache-atlas > data/cache/atlas_export.log 2>&1 &
tail -f data/cache/atlas_export.log

# Validación de las 5 redes contra RegPrecise
make validate-atlas 2>&1 | tee data/results/validation_run.log

# Consultas rápidas a la base (usa ~/.my.cnf)
mysql regulon_atlas -e "SELECT * FROM networks;"

# Probar la API
curl -s localhost:8000/api/v1/atlas/networks | python -m json.tool | head -30
curl -s "localhost:8000/api/v1/atlas/networks/3/graph/GCF_000005845.2?max_edges=20" | python -m json.tool | head -50
curl -s "localhost:8000/api/v1/atlas/validation/summary?universe=genome_tf" | python -m json.tool | head -40

# Métricas propias, comparación entre taxones y verificaciones
make metrics-atlas && make comparison-atlas
nohup make robustness-atlas > logs/robustness_atlas.log 2>&1 &   # ~8 min
make cache-fimo && make baseline-atlas                            # línea base, 312 genomas (~3 min)
make check            # antes de cada commit; make hooks una vez por clon
make help             # lista de comandos; make atlas encadena todo el análisis; make web levanta el frontend

# Chequeos de datos
python scripts/audit_summary.py
python scripts/check_metrics_coverage.py
PYTHONPATH=. python scripts/explore_validation.py
```

# RegulonAtlas: redes regulatorias bacterianas predichas

Predicción de redes de regulación transcripcional (factor de transcripción →
gen) a partir de motivos de unión curados (RegPrecise 3.2, PRODORIC),
caracterización topológica y validación contra regulones curados, con un
dashboard web para explorar los resultados.

Este README cubre el **MVP**: un corte vertical del sistema completo sobre 8
genomas de Enterobacteriaceae con regulones curados en RegPrecise
(`config/mvp_genomes.txt`).

## Requisitos

- Python 3.11 con `pandas`, `networkx`, `sqlalchemy`, `fastapi`, `uvicorn` (entorno conda `bioinfo`).
- Node.js para el frontend (`frontend/`).
- Solo para `make cache`: acceso de lectura a la base MariaDB `regulon_atlas`.

## Reproducir los resultados

```bash
make mvp          # regenera todo desde el caché de datos (no necesita la base)
```

El caché (`data/cache/mvp/`) ya está en el repositorio. Para volver a
exportarlo desde la base: `make cache` (una vez, solo lectura).

Informe con los números: `data/results/mvp/report.md`.

## Ver el dashboard

```bash
make api                          # backend en http://localhost:8000 (docs en /docs)
cd frontend && npm install && npm run dev
```

El dashboard muestra exactamente los resultados de `make mvp`; si se vuelve a
correr el pipeline, se actualiza sin reiniciar el backend.

## Etapas del pipeline

| Etapa | Módulo | Qué hace | Salida |
|---|---|---|---|
| 0 | `export_cache` | Exporta de MariaDB (solo lectura) genomas, genes y operones, motivos, hits FIMO (p ≤ 1e-5), anotaciones eggNOG y regulones curados | `data/cache/mvp/` |
| 1 | `build_transfer_map` | Detección de ortólogos: qué motivos aplican a cada genoma (reglas `source_genome`, `ortholog`, `ortholog_og`, `name_match`) | `transfer_map/` |
| 2 | `build_networks` | Red TF → gen: filtro de ortólogos, una arista por par (TF, gen), propagación por operones | `networks/*.edges.tsv` |
| 3 | `compute_metrics` | 5 métricas básicas con NetworkX (nodos, aristas, densidad, grado medio, hubs), distribución de grados, ranking de TF | `metrics/` |
| 4 | `validate` | Precisión, recall y F1 por umbral contra RegPrecise, con y sin propagación por operones | `validation/` |
| 5 | `report` | Informe breve en Markdown | `report.md` |

Todos los parámetros están en `config/mvp_params.json` (umbral de la red,
reglas de elegibilidad, propagación, umbral de hubs, umbrales de validación).
Cada etapa escribe un `*.provenance.json` con los parámetros, el commit de git
y el sha256 de sus entradas y salidas; `data/cache/mvp/cache_manifest.json`
registra las consultas SQL, la versión del servidor y los conteos del caché.

## Decisiones respecto de la propuesta

- **Dashboard:** FastAPI + React en lugar de Streamlit, para separar el cálculo
  (API) de la visualización y enviar al navegador solo subgrafos.
- **Base de datos:** MariaDB en lugar de SQLite, por el volumen del atlas
  completo (2.224 genomas, ~10^8 hits FIMO). El MVP no depende de ella: trabaja
  desde el caché exportado.
- **Escaneo FIMO:** los hits provienen de la base del proyecto (p ≤ 1e-5). Este
  repositorio parte de ellos: los exporta con su procedencia y aplica
  elegibilidad, construcción de red, métricas y validación.
- **Detección de ortólogos:** grupos ortólogos de eggNOG en lugar de BLAST
  recíproco o HMM, reutilizando la anotación funcional del atlas.
- **Gold standard:** regulones curados de RegPrecise 3.2 (E. coli K-12 y
  Salmonella LT2 validables por coincidencia de locus tags).

## Limitaciones conocidas

- En 6 de los 8 genomas los locus tags de RegPrecise son anteriores a la
  reanotación PGAP de RefSeq y no coinciden; su validación aparece como
  `no_overlap` y no es un resultado biológico.
- Umbrales más permisivos que 1e-5 no se evalúan: la base solo guarda hits con
  p ≤ 1e-5.
- Un TF que además es gen blanco cuenta como dos nodos.
- El tamaño del genoma se estima con el fin del último gen anotado por contig.

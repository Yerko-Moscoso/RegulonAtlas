# RegulonAtlas

Dashboard, validación y métricas sobre redes de regulación transcripcional bacteriana (factor de transcripción →
operón) predichas en **2.224 genomas** (uno por género de GTDB R232, más 3 referencias). Proyecto de título de Ingeniería
Informática (Universidad de las Américas, NIDS).

Las cinco redes las generó un pipeline externo del investigador del proyecto y están en la base MariaDB `regulon_atlas`.
Este repositorio las audita, las valida contra RegPrecise, calcula métricas topológicas propias, compara los genomas
entre taxones, mide la robustez de las métricas y las muestra en un dashboard web.

**Documentación:** [`docs/README.md`](docs/README.md) es el índice. El documento maestro es
[`docs/contexto_regulonatlas.md`](docs/contexto_regulonatlas.md).

## Estructura

| Carpeta | Contenido |
|---|---|
| `src/atlas_common.py` | Definiciones comunes (redes, regla de genomas del atlas, lectura de la caché, trazabilidad) |
| `src/validation/atlas.py` | Validación de las 5 redes contra RegPrecise (semana 10) |
| `src/networks/atlas_*.py` | Métricas propias, comparación entre taxones, robustez y línea base (semanas 11–12) |
| `src/api/` | API FastAPI, solo de lectura (no consulta MariaDB) |
| `frontend/` | Dashboard: Vite + React + Tailwind + Recharts + Cytoscape.js |
| `scripts/` | Exportación de la caché desde MariaDB (`export_*`), exploraciones previas (`explore_*`) y verificaciones |
| `src/pipeline/`, `config/` | Pipeline del MVP (semana 8) |
| `legacy/` | Código histórico que ya no se usa (ingesta y pipeline piloto); ver `legacy/README.md` |
| `tests/` | Pruebas unitarias y de humo de la API |
| `docs/` | Documentación por semana, preguntas pendientes y bitácora |

## Instalación

```bash
conda env create -f environment.yml      # entorno "bioinfo"
conda activate bioinfo
cd frontend && npm install && cd ..
cp .env.example .env                      # credenciales de MariaDB (solo para regenerar la caché)
make hooks                                # una vez por clon: verificación antes de cada commit
```

Si ya existe un entorno llamado `bioinfo` (por ejemplo, en el servidor `devastator`), `conda env create -f environment.yml`
fallará por el nombre repetido. En ese caso se crea con otro nombre (`conda env create -n <nombre> -f environment.yml`) o
en una carpeta (`-p <carpeta>`), y se activa ese.

## Uso

```bash
make help                 # lista de comandos
make api                  # backend en http://localhost:8000 (documentación en /docs)
make web                  # frontend en http://localhost:5173
make check                # antes de cada commit: API, frontend, ESLint y pytest
```

Los datos no se versionan. Para regenerarlos desde la base (el usuario solo tiene permiso SELECT):

```bash
nohup make cache-atlas > logs/cache_atlas.log 2>&1 &    # caché del atlas (lento)
make cache-genes && make cache-fimo                      # genes completos y hits de los genomas validables
nohup make all > logs/atlas.log 2>&1 &                   # validación, métricas, comparación, robustez, línea base
```

Cada carpeta de `data/results/` tiene un `manifest.json` con el commit que la generó y `git_dirty` (debe ser `false`:
los cálculos se ejecutan con el árbol limpio).

## Vistas del dashboard

| Vista | Qué responde |
|---|---|
| Dashboard | Resumen del atlas: las 5 redes con su validación y accesos a cada vista |
| Organisms | Catálogo de los 2.644 genomas (2.224 del atlas y 420 auxiliares) con sus métricas; ficha de cada genoma |
| Regulatory Networks | Grafo TF → operón de un genoma en cualquiera de las 5 redes |
| Metrics | Métricas topológicas propias de un genoma, su lugar en el atlas y su familia, y la concordancia con la tabla externa |
| Fingerprints | Perfil de percentiles de un genoma frente a su familia y al atlas |
| Taxon Comparison | Cómo cambian las métricas entre filos, clases, órdenes y familias de GTDB |
| Robustness | Qué métricas resisten la pérdida de aristas y el cambio de red |
| Validation | Precisión y recall de las 5 redes contra RegPrecise, desgloses y la línea base del pipeline propio |
| Pipeline | El flujo de punta a punta, quién hizo cada parte y el estado de cada etapa |
| Data Provenance | Fuentes, exportaciones a la caché y el commit que generó cada resultado |

## Resultados principales

| Tema | Resultado | Documento |
|---|---|---|
| Validación | `balanced` es la mejor red: F1 = 0,431 (0,318 sin autoevaluación) | `docs/validacion_semana10.md` |
| Métricas propias | Las métricas de tamaño ordenan los taxones igual que la tabla externa (ρ ≥ 0,94) | `docs/metricas_semana11.md` |
| Comparación entre taxones | El efecto del filo es en un 88 % metodológico (tamaño del genoma y origen de los motivos) | `docs/metricas_semana11.md`, 8.5 |
| Robustez | Las métricas de tamaño resisten perder la mitad de las aristas; las de estructura no | `docs/robustez_semana12.md` |
| Línea base | El pipeline externo es umbral + tier + footprinting; `no-footprint` se reproduce exactamente | `docs/robustez_semana12.md`, 8.4 |

## MVP (semana 8)

El MVP es un corte vertical del pipeline propio sobre 8 genomas de Enterobacteriaceae (`config/mvp_genomes.txt`), con
la caché versionada en `data/cache/mvp/`:

Se ejecuta solo con `make mvp` (no forma parte de `make all`):

```bash
make mvp      # transfer_map -> redes con propagación por operones -> métricas -> validación -> informe
```

El informe queda en `data/results/mvp/report.md`; cada etapa escribe un `*.provenance.json` con los parámetros
(`config/mvp_params.json`), el commit y el sha256 de sus entradas y salidas. Desde la semana 12 el dashboard muestra el
atlas y no los resultados del MVP. El dashboard del MVP tal como se entregó está en la etiqueta `mvp-semana8`.

Decisiones del MVP respecto de la propuesta: FastAPI + React en lugar de Streamlit; MariaDB en lugar de SQLite (volumen
del atlas: ~10⁸ hits FIMO); hits FIMO de la base (p ≤ 1e-5); ortólogos por grupos de eggNOG en lugar de BLAST recíproco;
gold standard RegPrecise. Limitaciones conocidas: en 6 de los 8 genomas los locus de RegPrecise son anteriores a la
reanotación PGAP y no coinciden; la base solo guarda hits con p ≤ 1e-5.

## Etiquetas

`mvp-semana8` (entrega del MVP), `semana09-auditoria`, `semana10-validacion`, `semana11-metricas` y `congelamiento-v1`
(funciones congeladas al cierre de la semana 13; `docs/congelamiento_v1.md`). El desarrollo está en `dev`; `main` llega
hasta la semana 11 y no recibe cambios hasta que el estudiante lo indique.

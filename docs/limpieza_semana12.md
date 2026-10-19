# Limpieza del proyecto (semana 12)

*19 de octubre de 2026. El análisis se le presentó al usuario y él aprobó aplicar todos los cambios. Este documento
registra qué se cambió, por qué, en qué commit y cómo se verificó.*

## 1. Respaldo previo

Antes de cambiar nada se guardó el estado completo en GitHub:

| Referencia | Apunta a | Para volver |
|---|---|---|
| Rama `respaldo/pre-limpieza-semana12` | `3802d6e` | `git checkout respaldo/pre-limpieza-semana12` |
| Etiqueta `respaldo-pre-limpieza-semana12` | `3802d6e` | `git checkout respaldo-pre-limpieza-semana12` |

Los datos del disco (`data/`) no se tocaron. Los genomas que salieron de git (sección 4) siguen en
`data/genomes/`.

## 2. Commits

| Commit | Etapa | Contenido |
|---|---|---|
| `1e3a35a` | Limpieza 1 | `environment.yml`, código sin uso, Pydantic, `.gitignore`, corrección documental |
| `3893d57` | Limpieza 2 | `src/atlas_common.py` y pruebas unitarias |
| `8978abd` | Limpieza 3 | Código histórico a `legacy/` y genomas fuera de git |
| `e228f2f` | Limpieza 5 | ESLint en `make check` |
| `9b2f4c4` | Limpieza 4 | Dashboard, Organisms y OrganismDetail con datos del atlas |
| `0a10f90` | Limpieza 6 | Nombres de métricas compartidos, carga diferida y Validation dividida |
| `1cec481` | Limpieza 7 | Makefile con `make help` y `make atlas` |
| (este) | Documentación | README, este documento, contexto, CLAUDE.md e índice |

La 5 quedó antes que la 4 porque **el hook pre-commit bloqueó dos veces la limpieza 4**, y en las dos tenía razón:
1. El índice tenía la eliminación de `src/api/results.py` (hecha con `git rm`), pero no el `genomes.py` nuevo, así que la
   API no habría arrancado.
2. El script del hook ya exigía ESLint, pero la configuración nueva de ESLint todavía no estaba en el índice.

Fue la primera vez que el hook evitó un commit roto real (el mismo tipo de error que `06e5140`).

## 3. Correcciones (grupo A)

| # | Qué | Cambio |
|---|---|---|
| A1 | `correcciones_semana11.md` (C4) decía que `environment.yml` no estaba versionado. **Era un error mío**: sí lo está. | Corregido, con nota. |
| A2 | `environment.yml` estaba desactualizado: se llamaba `tf-networks`, incluía Streamlit, Snakemake y SQLite, y le faltaban FastAPI, uvicorn, SQLAlchemy, pymysql, python-dotenv, pydantic-settings, pyarrow, statsmodels, pytest y httpx | Regenerado desde `bioinfo` (nombre `bioinfo`, versiones mínimas = las instaladas). Los paquetes que en `bioinfo` vienen de pip van en la sección `pip:`, porque con conda chocan con `meme` por `icu`/`libxml2`. **Verificado** con `conda env create --dry-run`: resuelve con icu 75.1 y meme 5.5.9, como `bioinfo`. |
| A3 | El Header decía "8 Enterobacteriaceae genomes" en todas las páginas | "2,224 genomes · 5 networks" (`ATLAS_GENOMES` en `utils/atlas.js`) |
| A4 | Dashboard, Organisms y OrganismDetail mostraban los 8 genomas del MVP | Reescritas sobre el atlas. Dashboard: resumen de las 5 redes con la validación propia. Organisms: catálogo de 2.644 genomas con métricas propias, filtros y búsqueda. OrganismDetail: taxonomía, calidad, métricas en las 5 redes y validación. |
| A5 | `import numpy` sin uso en `atlas_comparison.py` | Eliminado |

## 4. Eliminado y archivado (grupos B y C)

**Eliminado** (sin uso y sin valor histórico):

| Archivo | Motivo |
|---|---|
| `src/api/routers/robustness.py` | Router del MVP que solo respondía "pending"; Robustness usa `/atlas/robustness` |
| `src/api/routers/graphs.py`, `getNetworkGraph` | Sin uso; RegulatoryNetwork usa `getAtlasGraph` |
| `src/api/routers/metrics.py`, `src/api/results.py` | API del MVP (`data/results/mvp`); ya ninguna vista la usa. **La API ya no depende de `src/pipeline`.** |
| `getGenomes`, `getGenomesByAccessions`, `getValidationMetrics`, `getTopologyMetrics`, `getTopologySummary` | Métodos de `api.js` del MVP |
| `frontend/src/constants/comparisonGenomes.js` | Lista de los 8 genomas del MVP |
| `src/api/schemas/network_graph.py`, `src/database/models.py`, `src/api/services/` (vacío) | Nadie los importaba |
| `scripts/diagnostico_operontbl.py` | Diagnóstico puntual de la semana 7 |
| `notebooks/` | Carpeta vacía |

El router `/genomes` **se reescribió** en lugar de eliminarse: lee solo la caché del atlas y agrega taxonomía GTDB,
`selection` e `in_atlas`. Esto cubre el pendiente "agregar `gtdb_*` y `selection` a `CATALOG_COLUMNS`".

**Archivado en `legacy/`** (con `git mv`, que conserva la historia; ver `legacy/README.md`):
- `legacy/ingestion/`: los 7 scripts de `src/ingestion/` (scraper y parseo de RegPrecise y PRODORIC).
- `legacy/pipeline_piloto/`: el pipeline piloto de 10 genomas. Son 5 módulos de `src/pipeline/` (`extract_promoters`,
  `build_backgrounds`, `run_fimo`, `propagate_operons`, `build_transfer_map_eggnog`), más
  `src/networks/build_networks.py` → `build_networks_piloto.py` y `src/validation/benchmark.py` → `benchmark_piloto.py`.
- En esos archivos se quitaron 8 importaciones sin uso.

**Fuera de git:** `data/genomes/` (75 MB: 10 genomas `.fna`/`.gff` del piloto y 2 ZIP) salió del seguimiento con
`git rm --cached`. Los archivos siguen en el disco y quedan ignorados por `data/*`. El historial no se reescribió (pesa
39 MB): reescribirlo es riesgoso y `origin` ya lo tiene.

## 5. Mejoras de código (grupo D)

| # | Cambio | Verificación |
|---|---|---|
| D1 | `src/atlas_common.py` reúne `CACHE`, `NETWORKS`, `KEY`, `ATLAS_SELECTIONS`, `TIERS`, `load`, `norm_tf`, `norm_locus`, `is_atlas_selection`, `git_commit`, `git_dirty` y `check_dirty`. Antes estaban copiados en 2 a 5 módulos (así se originó el error C2 de la semana 11). El router `/genomes` también usa la regla común. | Se regeneraron los resultados con el código nuevo: **los 20 archivos** de `metrics`, `validation`, `comparison`, `baseline` y `robustness` son **idénticos** a los anteriores (`assert_frame_equal`). |
| D2 | `utils/metrics.js` (`METRIC_LABELS`): la misma métrica se llama igual en Metrics, Fingerprints, Comparison y Robustness (antes había "Edges", "Edges (TF → operon)" y "TF–operon pairs") | Build y revisión visual por el usuario |
| D3 | `tests/test_unit_atlas.py`: 13 pruebas de funciones puras que no necesitan `data/`. `make check` muestra las pruebas omitidas (`pytest -rs`). | 46 pruebas pasan (33 de la API + 13 unitarias) |
| D4 | ESLint: 1 error real corregido (`fmtP` sin uso). Tres reglas del React Compiler pasan a advertencia, con la razón en `eslint.config.js`: `set-state-in-effect` es el patrón de carga del proyecto, y `refs` y `preserve-manual-memoization` vienen del caché del layout de RegulatoryNetwork y de un `useMemo` de Fingerprints. `make check` y el hook exigen 0 errores. | 0 errores, 19 advertencias |
| D5 | `config.py`: `SettingsConfigDict` en vez de `class Config` (obsoleto en Pydantic 2) | Desapareció el aviso de pytest |
| D6 | `React.lazy` + `Suspense` en `App.jsx` | El paquete JS inicial bajó de **1.278 kB a 254 kB**. Queda el aviso de Vite por el trozo de RegulatoryNetwork (580 kB, Cytoscape), que solo se descarga al abrir esa vista. |
| D7 | `Validation.jsx` (764 → 500 líneas): la línea base pasa a `components/BaselineSection.jsx` y las piezas pequeñas a `components/ValidationParts.jsx` y `utils/validation.js` | Build y revisión visual |

## 6. Repositorio y documentación (grupo E)

| # | Cambio |
|---|---|
| E1 | `README.md` reescrito para el atlas: estructura, instalación, uso, resultados principales, MVP y etiquetas |
| E2 | Makefile por secciones, `make help`, `make atlas` (validación → métricas → comparación → robustez → línea base) y `make web`. Las recetas existentes no cambiaron (`make -n mvp` es igual). |
| E3 | `.gitignore` ordenado. Ignora exactamente los mismos archivos (comprobado con `git ls-files --ignored`), más `.pytest_cache/` de forma explícita. |
| E4 | Etiquetas nuevas `semana09-auditoria` (`448e6f5`) y `semana10-validacion` (`16b243b`). Se eliminó `semana10-sweep`, que apuntaba a `b628e54` (el commit "mvp-semana 8", no la semana 10); para recrearla: `git tag semana10-sweep b628e54`. |
| E5 | **Pendiente del usuario:** la línea 8 del `.env` hace que `python-dotenv` muestre un aviso. Claude no lee ese archivo. |

## 7. Verificación final

- **`make check`**: la API importa, no hay `get_db`, el frontend compila, ESLint da 0 errores y pasan las 46 pruebas.
- **`make mvp`**: corre completo en 18 s. Los archivos versionados de `data/results/mvp` solo cambiaron de fecha y
  commit, y se restauraron a la versión entregada.
- **Resultados del atlas**: idénticos antes y después (D1).
- **Segundo análisis** después de los cambios (sección 8).
- **Backend y frontend levantados** para la revisión del usuario (`make api` en el puerto 8000 y `make web` en el 5173).

## 8. Segundo análisis (después de los cambios)

Se repitieron las comprobaciones del primer análisis. Las cifras de "antes" se midieron sobre la etiqueta
`respaldo-pre-limpieza-semana12` con el mismo método, y las de "después" sobre `HEAD`.

| Comprobación | Antes | Después |
|---|---|---|
| Módulos de `src/` y `scripts/` que nadie importa y ningún `make` usa (sin contar los `explore_*`) | 18 | 2: `scripts/audit_summary.py` y `scripts/check_metrics_coverage.py`, que se conservan a propósito porque los cita el contexto (secciones 9.2, 9.6 y comandos frecuentes). El resto sin uso está en `legacy/`. |
| Métodos de `api.js` sin uso | 10 | 8: `getAtlasMetrics`, `getAtlasProvenance`, `getAtlasMetricsDefinitions`, `getAtlasMetricsSummary`, `getAtlasOwnMetricsForGenomes` y los tres `get…Manifest`. Se conservan para la vista DataProvenance (semana 13). |
| Archivos Python con importaciones sin uso (`src`, `scripts`, `tests`, `legacy`) | 6 | 0 |
| ESLint | 19 errores | 0 errores, 19 advertencias documentadas |
| `except:` vacíos | 0 | 0 |
| `get_db`/`get_engine` en `src/api` | 0 | 0 |
| Datos versionados en git | 90,1 MB | 11,8 MB (`data/cache/mvp`, que necesita `make mvp`, más los `*.provenance.json` y `report.md` del MVP) |
| Paquete JS inicial | 1.278 kB | 254 kB |
| Pruebas (`make check`) | 33 | 46, todas pasan |

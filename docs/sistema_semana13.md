# Semana 13 — Componentes del sistema

*Documento de la semana 13 (desde el 27-10-2026). Se completa a medida que se termina cada bloque.*

## 1. Alcance acordado

El 27-10-2026 el estudiante pidió avanzar por partes, una a la vez:

| Bloque | Estado |
|---|---|
| Endpoint de estado del pipeline (`/api/v1/atlas/status`) | Hecho (`65e9ace`, `fbce952`) |
| Vista Data Provenance | Hecho (`fbce952`) |
| Vista Pipeline | Pendiente (se decide después) |
| Vista MVP | **Descartada** por el estudiante (27-10-2026). `frontend/src/pages/MVP.jsx` sigue como prototipo sin uso |
| Revisión completa, pipeline propio en `make all` y congelamiento de funciones | Pendiente (se decide después) |

## 2. Endpoint de estado del pipeline

### 2.1 Exploración (`scripts/explore_status.py`)

Antes del módulo se revisaron los manifiestos reales:

- **Caché** (`data/cache/atlas/manifest.json`): registra la fecha (`exportado`) y los conteos por tabla (`tablas`), y
  aparte (`tables`) `genes_all`, `fimo_hits_validation` y `transfer_map_validation` con su fecha y número de filas.
  **No registra el commit** del script que exportó. No se corrige: habría que volver a exportar desde MariaDB.
- **Resultados**: los 5 manifiestos registran `git_commit`, `git_dirty` y `created_at`, y la lista de archivos (`files`).
  Validación y métricas guardan una copia del manifiesto de la caché que usaron; comparación y robustez guardan el commit
  de las métricas que leyeron (`metrics_manifest`).
- **Estado al 27-10-2026**: los 5 resultados están en árbol limpio, sus commits existen en el historial, no falta ningún
  archivo y todos están al día con su entrada.

### 2.2 Reglas (`src/atlas_status.py`)

8 etapas, en el orden del pipeline (contexto, sección 13):

| Etapa | `make` | Depende de | Regla "al día" |
|---|---|---|---|
| `cache-atlas` | `cache-atlas` | — | — |
| `cache-genes` | `cache-genes` | — | — |
| `cache-fimo` | `cache-fimo` | — | — |
| `validation` | `validate-atlas` | `cache-atlas` | su copia de la caché (`exportado` y `tablas`) = caché actual |
| `metrics` | `metrics-atlas` | `cache-atlas`, `cache-genes` | igual que `validation` |
| `comparison` | `comparison-atlas` | `metrics` | `metrics_manifest` = `git_commit` actual de `metrics` |
| `robustness` | `robustness-atlas` | `metrics` | igual que `comparison` |
| `baseline` | `baseline-atlas` | `cache-fimo` | `created_at` posterior a la exportación de `fimo_hits` |

Estado de cada etapa:

- `missing`: no hay manifiesto.
- `warning`: hay algún problema: `git_dirty: true` o sin registrar, commit que ya no está en el historial (lo que pasó
  con la caché del MVP), archivos declarados que faltan, o entrada desactualizada.
- `ok`: ninguno de los anteriores.

La falta de commit en la caché se informa como **nota** (limitación conocida), no como problema. La comprobación del
historial usa `git cat-file`; si no hay git, el campo queda en `null`.

### 2.3 API

`GET /api/v1/atlas/status` (`src/api/routers/atlas_status.py`). Solo lee archivos: no consulta MariaDB ni calcula nada.
Devuelve `checked_at`, `code` (commit y `git_dirty` del código que sirve la API), `summary` (conteo por estado) y
`steps` (por etapa: `label`, `make`, `depends_on`, `description`, `created_at`, `git_commit`, `git_dirty`,
`commit_in_history`, `files_declared`, `files_missing`, `up_to_date`, `up_to_date_detail`, `issues`, `notes` y, en la
caché, `tables` con los conteos).

### 2.4 Pruebas (`tests/test_api_atlas_status.py`, 7)

- Humo (con los datos reales): las 8 etapas en orden y los conteos de la caché iguales al manifiesto (2.644 genomas).
- Unitarias (manifiestos falsos en un directorio temporal): atlas coherente al día; comparación hecha con métricas
  antiguas; validación y métricas hechas con una caché antigua; árbol sucio y archivos faltantes; sin manifiestos.

Total del proyecto: 53 pruebas.

## 3. Vista Data Provenance

`frontend/src/pages/DataProvenance.jsx`, en el menú bajo **SYSTEM**. Reemplaza al prototipo, que llamaba a endpoints
inexistentes (`getProvenanceRecords`, `exportProvenanceCsv`) y listaba fuentes que el atlas no usa (KEGG, RegulonDB).

| Sección | Fuente | Qué muestra |
|---|---|---|
| Indicadores | ambas | 7 fuentes externas, 16 tablas en caché, 5 resultados, 5/5 trazables y al día |
| 1. External sources | `/atlas/provenance` (tabla `provenance`) | Fuente, versión, fecha de descarga, parámetros y notas, tal como están en la base |
| 2. Local cache | `/atlas/status` | Las 3 exportaciones con fecha, comando y filas por tabla |
| 3. Results | `/atlas/status` | Por resultado: comando, fecha, commit, árbol limpio, archivos, si está al día (con el detalle) y estado |
| Known limitations | notas de `/atlas/status` + lista fija | Caché sin commit; trazabilidad solo hasta `provenance`; `network_metrics` y D33 son externos |

Verificación: `make check` sin errores de ESLint en los archivos tocados; captura con Chrome sin interfaz a 1440 y 900 px
de ancho, sin errores de consola y con todas las llamadas a la API en 200. Las capturas no se versionan.

Los parámetros y notas de las fuentes se muestran en español porque así están en la base (son datos, no texto de la
interfaz).

## 4. Observaciones

- **Versión de RegPrecise.** La tabla `provenance` del atlas dice `3.0 (scraping JSP)`; el manifiesto de la caché del
  MVP decía "RegPrecise 3.2" (`evidencia_mvp/pruebas_aceptacion_mvp.md`, CA3). No se cambió nada: la vista muestra lo
  que dice la base. Conviene confirmarlo con el investigador.
- **Con PRODORIC, el atlas sí está completo.** La observación de las pruebas del MVP (falta la versión de PRODORIC) no
  aplica al atlas: `provenance` registra `2021.9 (API 1.3.1)` y la fecha de descarga.

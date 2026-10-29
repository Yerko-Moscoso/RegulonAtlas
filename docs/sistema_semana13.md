# Semana 13 — Componentes del sistema

*Documento de la semana 13 (desde el 27-10-2026). Se completa a medida que se termina cada bloque.*

## 1. Alcance acordado

El 27-10-2026 el estudiante pidió avanzar por partes, una a la vez:

| Bloque | Estado |
|---|---|
| Endpoint de estado del pipeline (`/api/v1/atlas/status`) | Hecho (`65e9ace`, `fbce952`) |
| Vista Data Provenance | Hecho (`fbce952`) |
| Pasada de presentación de las vistas (sección 5) | Hecho y aprobada (`3edeff6`–`fd2abb1`) |
| Vista Pipeline (sección 6) | Hecho (`9f55796`, 29-10-2026) |
| Vista MVP | **Descartada** por el estudiante (26-10-2026); `MVP.jsx` eliminado (`6dd5b18`) |
| Vista Settings | **Descartada** por el estudiante (29-10-2026); nunca existió como archivo |
| `make all` corre todo el análisis del atlas | Hecho (29-10-2026); el MVP solo con `make mvp` |
| Revisión previa de `make all` (`make atlas-ready`) | Hecho (`7521118`, 29-10-2026) |
| Prueba de reproducibilidad en un clon aparte | Hecho (29-10-2026): 20/20 archivos idénticos → `evidencia_reproducibilidad/prueba_reproducibilidad_atlas.md` |
| Revisión completa | Hecha y corregida (29-10-2026): los 13 hallazgos y 1 advertencia de ESLint → `revision_semana13.md`, secciones 2 y 5 |
| Congelamiento de funciones | Hecho (29-10-2026) → `congelamiento_v1.md` |

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

## 5. Pasada de presentación de las vistas (27-10-2026)

**Pedido del estudiante:** que las vistas sean útiles y accesibles para un investigador bioinformático, sin relleno, y
poder volver atrás si no convence. **No cambia ningún dato ni cálculo:** solo la forma de mostrar.

### 5.1 Respaldo

Rama `respaldo/pre-presentacion-semana13` y etiqueta `respaldo-pre-presentacion-semana13`, ambas en `fd3f3a5` y subidas a
GitHub antes del primer cambio.

### 5.2 Criterio

Cada vista responde su pregunta en la primera pantalla. El detalle que respalda el resultado (útil si el jurado o un
investigador pregunta "¿cómo lo sabes?") queda en secciones plegables (`components/Collapsible.jsx`) que, cerradas,
muestran el resultado en una línea **calculado con los datos** (no texto fijo). No se eliminó ninguna tabla ni gráfico.

### 5.3 Cambios (un commit por bloque)

| Commit | Vista | Cambio | Alto (px), antes → después |
|---|---|---|---|
| `3edeff6` | Dashboard, Metrics, Fingerprints, RegulatoryNetwork | Nombre del proyecto unificado en los textos visibles (5 lugares) | — |
| `91605a5` | Validation | Recuadro con el resultado de la red elegida (precisión, recall, fracción evaluable). Desglose por tier y por origen del motivo plegado con su resumen (solo tiers con ≥ 1 % de los pares). Línea base plegada con su resumen. Corregido: columnas de la tabla de desglose que se superponían | 2.962 → 1.780 |
| `dd7661c` | Robustness | Leyendas arriba (la etiqueta del eje X se montaba sobre ellas). Ficha del genoma y efecto del footprinting plegados con su resumen | 2.894 → 2.014 |
| `fd2abb1` | Metrics, Data Provenance | Metrics: se quita el pie que repetía la definición del grafo. Data Provenance: conteos de la caché plegados; el detalle "al día" solo aparece si un resultado está desactualizado | 2.059 → 2.031; 1.733 → 1.367 |

Sin cambios: Organisms, Regulatory Networks, Fingerprints (su recuadro explica los percentiles, propio de esa vista),
Taxon Comparison y Dashboard (su tabla de redes es el resumen de entrada, no una duplicación).

Resúmenes calculados, comprobados contra los documentos de la semana 12 (balanced, modo `all`):

- Validation: "Precision by tier ranges from 34.9 % (same_class) to 78.5 % (within_family); circular pairs 72.3 % vs
  48.1 % for independent motifs".
- Línea base: "no-footprint is rebuilt exactly from the raw hits … footprinting keeps 27.2 %–51.1 % of the baseline
  pairs" (`robustez_semana12.md`, 8.4: 27–51 %).
- Robustness: "A typical genome keeps 59 % of its TF–operon pairs after footprinting, and 7 of 15 metrics keep the
  ranking" (footprinting quita ~40 % de los pares).

Verificación: `make check` en cada commit (53 pruebas, 0 errores de ESLint); capturas de las 9 vistas antes y después
con Chrome sin interfaz, sin errores de consola ni respuestas HTTP fallidas.

### 5.4 Decisión

El estudiante revisó las vistas y **aprobó la pasada el 27-10-2026**. La rama y la etiqueta de respaldo se conservan
por trazabilidad.

### 5.5 Cómo volver atrás

- **Todo:** `git revert --no-edit 3edeff6^..fd2abb1` (crea commits que deshacen los 4 cambios, sin reescribir el
  historial) y `make check`.
- **Un bloque:** `git revert --no-edit <commit>` con el commit de la tabla (por ejemplo, solo Robustness: `dd7661c`).
- **Solo mirar el estado anterior:** `git switch respaldo/pre-presentacion-semana13` (y volver con `git switch dev`).

## 6. Vista Pipeline y limpieza de prototipos (29-10-2026)

**Pedido del estudiante:** hacer la vista Pipeline y descartar las vistas MVP y Settings. Lo demás de la semana 13
(pipeline propio en `make all`, revisión completa, congelamiento) queda para cuando él lo pida.

### 6.1 Vista Pipeline (`9f55796`)

Reemplaza al prototipo, que llamaba a un endpoint inexistente (`getPipelineStatus`). No necesita backend nuevo: usa
`/atlas/status` (sección 2) y `/atlas/provenance`.

| Etapa | Autoría | Qué muestra |
|---|---|---|
| 1. Public sources | Externa | Las 7 fuentes de la tabla `provenance` con su versión |
| 2. External pipeline | Externa | Escaneo FIMO, transferencia de motivos y los tres filtros que definen las redes (confirmados al reconstruirlas, `robustez_semana12.md`, 8.4) |
| 3. MariaDB `regulon_atlas` | Externa | Redes, genomas, motivos y filas curadas (conteos de la caché) |
| 4. Local cache | Propia | Las 3 exportaciones con estado, comando y fecha |
| 5. Analyses | Propia | Los 5 resultados con estado, comando, de qué dependen, commit y botones a las vistas que los muestran |
| 6. API, 7. Dashboard | Propia | Que la API solo lee y que cada análisis enlaza a sus vistas |

Arriba hay dos recuadros que separan la autoría (lo que pide el contexto, sección 15) y abajo los comandos para
regenerar todo: `make all` (desde el 29-10-2026; antes `make atlas`, que ya
incluía la línea base) y `make check`. *(Corregido el 29-10-2026: este párrafo decía por error que `make atlas` no
incluía la línea base.)*

Lo único fijo en el código es qué vista muestra cada resultado y la descripción del pipeline externo. El indicador de
estado pasó a `components/StatusBadge.jsx`, compartido con Data Provenance (sin cambio visible).

### 6.2 Prototipos eliminados (`6dd5b18`)

- `frontend/src/pages/MVP.jsx`: no estaba en el menú y llamaba a un endpoint inexistente. Sigue en el historial de git.
- Settings: nunca existió como archivo, solo una mención en `Sidebar.jsx`, que se quitó.

### 6.3 Verificación

`make check` (53 pruebas, 0 errores de ESLint); capturas de las 10 vistas sin errores de consola ni respuestas HTTP
fallidas; los botones de la vista llevan a la vista correcta (probado con Taxon Comparison y Robustness). Estado al
29-10-2026: 8 de 8 etapas al día.

### 6.4 Corrección: orden de Organisms (`e32b0b2`)

Observación del estudiante al revisar: la vista Organisms no mostraba los genomas en orden alfabético (abría ordenada
por pares TF–operón, de mayor a menor, y el primer clic en una columna de texto ordenaba de Z a A). Ahora abre por
organismo de A a Z; el primer clic en una columna de texto ordena de A a Z y en una numérica de mayor a menor; los
valores vacíos van al final. Los nombres se comparan sin distinguir mayúsculas, ignorando signos ("[Enterobacter]
lignolyticus" queda en la E) y con números como números ("sp. 2" antes que "sp. 10"). Probado en el navegador: las
100 primeras filas en orden alfabético, el orden por columnas y su inversión funcionan; sin errores de consola.

# Documentación de RegulonAtlas

**Este es el punto de entrada de toda la documentación del proyecto.** Toda la documentación vive en `docs/`. Cada documento
nuevo y cada bloque de trabajo terminado se registran aquí: el índice dice *qué* hay en cada documento y la bitácora dice
*cuándo* se hizo cada cosa y en qué commit.

*Creado el 19-10-2026. Se actualiza en cada commit que agregue o cambie documentación.*

## Por dónde empezar

1. **`contexto_regulonatlas.md`**: el documento maestro. Contiene el proyecto, los datos, las decisiones, lo hecho cada
   semana, la arquitectura, el plan y los pendientes. Si solo se lee un documento, debe ser este.
2. **Este archivo**: para encontrar el detalle de cada tema.
3. **`../CLAUDE.md`**: reglas de trabajo y valores de control. Lo lee Claude Code al empezar, pero también sirve como resumen
   de las reglas.

## Índice

### Documentos generales

| Documento | Qué contiene | Actualizado |
|---|---|---|
| [`contexto_regulonatlas.md`](contexto_regulonatlas.md) | Documento maestro: proyecto, infraestructura, datos, esquema de la base, redes externas, decisiones (D1–D33 y semanales), historia semana a semana (hasta la 12, con su cierre en 12.2), arquitectura, plan, cómo presentarlo en el informe, pendientes, lecciones y comandos | 09-11-2026 |
| [`congelamiento_v1.md`](congelamiento_v1.md) | Congelamiento de funciones de la v1.0: lista cerrada de análisis, API (35 rutas), 10 vistas y calidad; lo que queda fuera; reglas después del congelamiento; registro de excepciones y limitaciones | 29-10-2026 |
| [`bitacora_claude_code.md`](bitacora_claude_code.md) | Bitácora completa del trabajo con Claude Code (15-10 al 04-11-2026, semanas 11 a 13): decisiones, cambios, errores y correcciones, con sus commits. Base para el documento de memoria | 04-11-2026 |
| [`evidencia_mvp/pruebas_aceptacion_mvp.md`](evidencia_mvp/pruebas_aceptacion_mvp.md) | Registro formal de las pruebas de aceptación del MVP (CA1–CA6) sobre la etiqueta `mvp-semana8` (`d056fc9`): entorno, procedimiento, tabla por caso, resumen y limitaciones. Todo lo de las pruebas vive en `evidencia_mvp/`; en git solo está este registro. Los registros, las capturas, los scripts y la versión en Excel quedan solo en el servidor (`.gitignore`, decisión del 26-10-2026) | 26-10-2026 |
| [`evidencia_instalacion/prueba_desde_cero.md`](evidencia_instalacion/prueba_desde_cero.md) | Prueba desde cero (semana 14): clon de `congelamiento-v1`, entorno nuevo desde `environment.yml`, comparación con los resultados del dashboard (20/20 con los mismos valores) y 109 casos de prueba (108 aprobados). El Excel `casos_de_prueba_v1.xlsx` y la evidencia quedan solo en el servidor | 04-11-2026 |
| [`pruebas_semana14.md`](pruebas_semana14.md) | Ampliación de las pruebas automáticas (semana 14): 65 pruebas nuevas en 3 bloques (validación, línea base/comparación/robustez y API sin datos), de 58 a 123; cómo se aisló lo existente; hallazgo H2 (500 sin caché en 2 endpoints) y su corrección | 09-11-2026 |
| [`evidencia_reproducibilidad/prueba_reproducibilidad_atlas.md`](evidencia_reproducibilidad/prueba_reproducibilidad_atlas.md) | Prueba de reproducibilidad de `make all` desde un clon limpio, comparada con los resultados del dashboard: 20 de 20 archivos idénticos, manifiestos, valores de control, tiempos y limitaciones. La evidencia queda solo en el servidor | 29-10-2026 |
| [`preguntas_pendientes.md`](preguntas_pendientes.md) | Preguntas abiertas al investigador (P1–P6) y al profesor (Q1–Q4), preguntas resueltas (R1–R4) y borradores de mensaje (actualizados con la semana 12) | 26-10-2026 |
| [`../CLAUDE.md`](../CLAUDE.md) | Reglas del proyecto, definiciones del dominio, comandos y valores de control | 19-10-2026 |
| [`../README.md`](../README.md) | README del proyecto: estructura, instalación, uso, resultados y MVP | 19-10-2026 |

### Documentos por semana (resultados para la tesis)

| Semana | Documento | Objetivo | Qué contiene |
|---|---|---|---|
| 9 | [`auditoria_semana9.md`](auditoria_semana9.md) | — | Auditoría de `fimo_hits`, cobertura del atlas, decisión de usar las redes de la base, diagnóstico de `network_metrics` |
| 10 | [`validacion_semana10.md`](validacion_semana10.md) | OE5 | Validación propia de las 5 redes contra RegPrecise: definición, proyección del gold standard, P/R/F1, modo `independent`, precisión por tier, hallazgos y limitaciones |
| 11 | [`metricas_semana11.md`](metricas_semana11.md) | OE4 | Métricas topológicas propias, diferencias con `network_metrics`, comparación entre taxones, concordancia con el pipeline externo y prueba del origen de los motivos (8.5) |
| 11 | [`correcciones_semana11.md`](correcciones_semana11.md) | — | Correcciones C1–C6: import roto, genoma replacement, trazabilidad, verificación pre-commit, `density` externa y documentación |
| 12 | [`limpieza_semana12.md`](limpieza_semana12.md) | — | Limpieza del proyecto: respaldo, eliminado y archivado, código común, vistas migradas al atlas, pruebas, ESLint, Makefile, README y segundo análisis |
| 13 | [`revision_semana13.md`](revision_semana13.md) | — | Revisión completa del sistema: API, 10 vistas en 1440/900 px, API apagada y sin resultados, teclado, código y documentación. Hallazgos E1, M1–M6, C1–C6 y las 19 advertencias de ESLint con recomendación; correcciones con su commit (sección 5). Evidencia solo en el servidor (`evidencia_revision_semana13/`) |
| 13 | [`sistema_semana13.md`](sistema_semana13.md) | — | Componentes del sistema (en curso): alcance acordado, endpoint de estado del pipeline (`/atlas/status`: reglas, API y pruebas), vista Data Provenance, observaciones (versión de RegPrecise) y pasada de presentación de las vistas con cómo revertirla (sección 5) y vista Pipeline con limpieza de prototipos (sección 6) |
| 12 | [`robustez_semana12.md`](robustez_semana12.md) | — | Robustez de las métricas (anidamiento de las redes, orden de los genomas entre redes, efecto del footprinting, submuestreo de aristas) y línea base del pipeline propio desde `fimo_hits` en los 312 genomas validables (sección 8) |

### Material de referencia

| Archivo | Qué contiene |
|---|---|
| [`esquemas.txt`](esquemas.txt) | Salida de `SHOW CREATE TABLE` de `edges`, `motifs`, `operons`, `genes` y `curated_regulons` (copiada de la terminal; tiene códigos de escape al inicio) |
| `../data/results/mvp/report.md` | Informe generado por `make mvp` (MVP de la semana 8) |
| [`../legacy/README.md`](../legacy/README.md) | Qué hacía cada script archivado en `legacy/` (ingesta y pipeline piloto) y su ruta anterior |
| [`../README.md`](../README.md) | Estructura, instalación y uso del proyecto (reescrito en la semana 12) |

### Dónde están los resultados (no versionados, se regeneran)

| Carpeta | Se genera con | Documentado en |
|---|---|---|
| `data/cache/atlas/` | `make cache-atlas`, `make cache-genes` | Contexto, sección 9.4 |
| `data/results/validation/regprecise/` | `make validate-atlas` | `validacion_semana10.md`, sección 9 |
| `data/results/metrics/` | `make metrics-atlas` | `metricas_semana11.md`, sección 11 |
| `data/results/comparison/` | `make comparison-atlas` | `metricas_semana11.md`, sección 11 |
| `data/results/robustness/` | `make robustness-atlas` | `robustez_semana12.md`, sección 7 |
| `data/results/baseline/` | `make cache-fimo`, `make baseline-atlas` | `robustez_semana12.md`, sección 8 |
| `data/audit/` | `scripts/explore_*.py`, `scripts/audit_summary.py` | Docstring de cada script |
| `logs/` | Ejecuciones con `> logs/….log` | Bitácora (abajo) |

Cada carpeta de resultados tiene un `manifest.json` con el commit que la generó y `git_dirty` (debe ser `false`).

## Bitácora

Una entrada por bloque de trabajo, la más reciente arriba. Al agregar una entrada se indica qué se hizo, el commit y dónde
quedó documentado.

### 09-11-2026: semana 14, corrección de H2

- Con aprobación del estudiante, `71771e2`: `/atlas/networks` y `/atlas/provenance` responden 503 con
  `make cache-atlas` cuando falta la caché (antes, 500 sin mensaje). Función `_manifest()` en
  `src/api/routers/atlas.py`; se quita el `xfail`. Corrección de error, permitida por el congelamiento.
- Verificado: con la caché, las respuestas son idénticas a las de antes; `data/results/` y `data/cache/` idénticos
  (sha256); **123 de 123 pruebas**; en un clon sin `data/` corren 88. → `pruebas_semana14.md`, sección 7.1.

### 09-11-2026: semana 14, ampliación de las pruebas

- Aprobado por el estudiante (bloques A, B y C, sin afectar lo existente). Tres archivos nuevos en `tests/`, un commit
  cada uno: `9586f67` (A, validación contra RegPrecise, 12), `6a77bfa` (B, línea base, comparación y robustez, 19) y
  `fb11872` (C, la API sin resultados ni caché, 34). Suite: de 58 a **123 pruebas** (121 aprobadas y 2 fallas
  esperadas); en un clon sin `data/` corren 86 (antes 23). Sin cambios en `src/` ni en el frontend; `data/results/` y
  `data/cache/` idénticos (sha256).
- **Hallazgo H2:** sin la caché, `/atlas/networks` y `/atlas/provenance` responden 500 en vez de 503. Registrado con
  `xfail` estricto; pendiente de decisión del estudiante. → `pruebas_semana14.md`.

### 04-11-2026: semana 14, corrección H1 (`npm ci`)

- Con aprobación del estudiante, el README (y el comentario de `environment.yml`) indican `npm ci` en vez de `npm install`:
  instala exactamente lo de `package-lock.json` sin modificarlo, así `make all` no se detiene en una instalación nueva.
  Corrección de documentación, permitida por el congelamiento. → `evidencia_instalacion/prueba_desde_cero.md`, H1.

### 04-11-2026: semana 14, prueba desde cero ejecutada

- Clon de `congelamiento-v1`, entorno nuevo desde `environment.yml` (10 paquetes en versiones más recientes que
  `bioinfo`), caché enlazada solo para lectura. `make all` en 8 min 34 s: **20 de 20 archivos con los mismos valores** que
  el dashboard (16 idénticos byte a byte; 4 difieren solo en metadatos de pyarrow o en el 17.º dígito), 5/5 valores de
  control, 58/58 pruebas.
- **109 casos de prueba** (instalación, revisión previa, análisis, comparación, control, calidad, 35 rutas de la API,
  errores, API sin resultados, 10 vistas, 18 funciones y aislamiento): **108 aprobados**. Falla INS-03: `npm install`
  (README) modifica `package-lock.json` y `make all` se niega a correr; con `npm ci` funciona (hallazgo H1, pendiente de
  decisión). Resultados, caché y `bioinfo` intactos; clon y entorno borrados.
  → `evidencia_instalacion/prueba_desde_cero.md`; Excel `evidencia_instalacion/casos_de_prueba_v1.xlsx` (solo servidor).

### 04-11-2026: semana 14, plan de la prueba desde cero (sin ejecutar)

- Decisiones del estudiante: probar la etiqueta `congelamiento-v1` (mismo código que `dev`); incluir la revisión de las
  10 vistas desde la instalación nueva; en el README solo mencionar el choque de nombre con un entorno `bioinfo`
  existente. Caché: opción a (reutilizar la actual, enlazada solo para lectura; sin MariaDB), confirmada por el estudiante. La prueba se ejecuta cuando el estudiante lo indique.
- `README.md`: nota en "Instalación" para crear el entorno con otro nombre (`-n`) o en una carpeta (`-p`) si ya existe
  `bioinfo`.

### 04-11-2026: bitácora de Claude Code al día

- `bitacora_claude_code.md` amplía el recorrido hasta el 04-11-2026: secciones 10 a 17 (cierre de la semana 12, semana
  13 completa y congelamiento), 15 decisiones del usuario y 13 errores de Claude con su corrección.

### 04-11-2026: etiqueta `congelamiento-v1`

- Etiqueta anotada `congelamiento-v1` sobre `d9bcf58` (cierre de la semana 13), subida a GitHub. Solo en `dev`; `main` sin
  cambios. → `congelamiento_v1.md`.

### 29-10-2026: cierre de la semana 13

- El estudiante revisó el software congelado y cerró la semana. Estado al cerrar: `dev` en `ce540b6` (más este commit),
  limpio y en GitHub; `main` sin cambios (`f2d5df3`); 58 pruebas; 8 de 8 etapas al día; `data/results/` intacto.
- Hecho en la semana 13: estado del pipeline (`/atlas/status`), vistas Pipeline y Data Provenance, pasada de
  presentación, orden alfabético de Organisms, `make all` = atlas con revisión previa, nombre RegulonAtlas, prueba de
  reproducibilidad (20/20 idénticos), revisión completa con sus 13 correcciones y congelamiento de funciones.
- Siguiente (semana 14): pruebas, prueba desde cero con `conda env create` y, cuando el estudiante lo indique, `v1.0`.
  → `sistema_semana13.md`; contexto, sección 14.

### 29-10-2026: semana 13, congelamiento de funciones (v1.0)

- Desde hoy no se agregan funciones: solo correcciones, pruebas, documentación y redacción. Una función nueva requiere
  aprobación del estudiante y se registra como excepción (RegulonDB, prevista si el profesor la exige). Regla también en
  `../CLAUDE.md`. → `congelamiento_v1.md`.

### 29-10-2026: semana 13, correcciones de la revisión

- Se corrigieron todos los hallazgos (E1, M1–M6, C1–C6), un commit cada uno (`13f53f1` a `ffa5266`), y la advertencia
  de ESLint de Fingerprints (`95375a7`; quedan 18, que se mantienen). Nuevos: `components/ScrollX.jsx` (tablas anchas)
  y `utils/a11y.js` (teclado). No cambia ningún dato. Verificado: `make check`, 10 vistas a 1440/900 px, teclado y API
  apagada; `data/results/` intacto. → `revision_semana13.md`, sección 5.

### 29-10-2026: semana 13, revisión completa del sistema

- Revisión sin correcciones sobre `0a6a618`: 35/35 endpoints 200 (< 250 ms); sin resultados, 24 endpoints dan 503 con el
  `make` a correr; 10/10 vistas sin errores a 1440 y 900 px; con la API apagada o sin resultados todas avisan; 0 enlaces
  rotos. Hallazgos: 1 error menor (Dashboard muestra "Networks 0" con la API apagada), 6 mejoras (tablas a 900 px,
  accesibilidad con teclado, README sin las vistas, pregunta de la versión de RegPrecise, tarjetas del Dashboard) y 6
  detalles. 19 advertencias de ESLint listadas con recomendación. Resultados intactos (sha256).
  → `revision_semana13.md`.

### 29-10-2026: semana 13, revisión previa de `make all` y prueba de reproducibilidad

- `7521118`: `scripts/check_atlas_ready.sh` (`make atlas-ready`): `make atlas`/`make all` se detienen en el primer
  segundo si falta un archivo de la caché (indica la regla) o si hay cambios sin commit. 5 pruebas nuevas (58 en total).
- Prueba: `make all` en un clon limpio de `7521118` desde GitHub, con la caché enlazada y solo leída. 8 min 17 s.
  **Los 20 archivos de datos salieron idénticos byte a byte** a los que muestra el dashboard; los manifiestos solo
  cambian en fecha y commit; 5/5 valores de control y 58/58 pruebas pasan. Resultados y caché del proyecto intactos
  (sha256 antes y después). Clon borrado. → `evidencia_reproducibilidad/prueba_reproducibilidad_atlas.md`.

### 29-10-2026: semana 13, `make all` corre el atlas

- `make all` pasa a correr todo el análisis del atlas (validación, métricas, comparación, robustez y línea base); el MVP de
  8 genomas queda solo en `make mvp`. Actualizados `make help`, `README.md`, `CLAUDE.md` y la vista Pipeline.
- Corrección: la vista Pipeline y `sistema_semana13.md` (6.1) decían que `make atlas` no incluía la línea base; sí la
  incluía. → `sistema_semana13.md`, sección 6.1; contexto, sección 14.

### 29-10-2026: semana 13, vista Pipeline y limpieza de prototipos

- `9f55796`: `Pipeline.jsx` con el flujo real en 7 etapas, la autoría de cada parte, el estado de cada etapa propia
  (de `/atlas/status`) y enlaces a las vistas; `StatusBadge.jsx` compartido con Data Provenance. En el menú bajo SYSTEM.
- `6dd5b18`: se elimina `MVP.jsx` (descartada); Settings descartada (nunca existió como archivo).
- `e32b0b2`: Organisms abre en orden alfabético por organismo (observación del estudiante).
- Pendiente, cuando el estudiante lo pida: revisión completa y congelamiento.
  → `sistema_semana13.md`, sección 6.

### 27-10-2026: semana 13, pasada de presentación de las vistas

- Respaldo previo: rama `respaldo/pre-presentacion-semana13` y etiqueta `respaldo-pre-presentacion-semana13` (`fd3f3a5`).
- `3edeff6` (nombre del proyecto unificado en los textos visibles), `91605a5` (Validation), `dd7661c` (Robustness), `fd2abb1` (Metrics y Data
  Provenance): resultado clave arriba y detalle en secciones plegables con su resumen calculado; corregidas las columnas
  superpuestas de Validation y la leyenda de Robustness. No cambia ningún dato. **Aprobada por el estudiante el 27-10-2026**; el respaldo se conserva.
  → `sistema_semana13.md`, sección 5 (incluye cómo revertir).

### 27-10-2026: semana 13, estado del pipeline y Data Provenance

- Alcance pedido por el estudiante: solo el endpoint de estado y la vista Data Provenance; la vista MVP se descarta.
- `65e9ace`: `scripts/explore_status.py`, `src/atlas_status.py` (8 etapas: commit, `git_dirty`, commit en el
  historial, archivos y si cada resultado está al día con su entrada), `GET /api/v1/atlas/status` y
  `tests/test_api_atlas_status.py` (7 pruebas; 53 en total).
- `fbce952`: `DataProvenance.jsx` reescrita con datos reales (fuentes externas, caché, resultados y limitaciones), en el
  menú bajo SYSTEM. Estado actual: 8/8 etapas en `ok`, 5/5 resultados trazables y al día.
- Observación: `provenance` registra RegPrecise 3.0; el manifiesto del MVP decía 3.2. → `sistema_semana13.md`.

### 26-10-2026: cierre de la semana 12

- **Ramas:** por decisión del estudiante, todo el desarrollo queda solo en `dev`; no se fusiona ni se sube nada a `main`
  hasta que él lo indique (`main` sigue en `f2d5df3`, semana 11). No se creó etiqueta de la semana 12. La regla quedó en
  `../CLAUDE.md` y en el contexto, sección 3.
- **Pruebas del MVP:** registro versionado en `db6c33e`; la evidencia queda solo en el servidor (`.gitignore`).
- **Verificación:** `make check` pasa (46 pruebas); los 5 `manifest.json` de `data/results/` tienen `git_dirty: false`
  (validation `63469d5`, metrics `ceeb831`, comparison `3ce0f17`, robustness `38222a8`, baseline `251811b`); los 32
  endpoints GET de la API responden 200 y los valores de control coinciden. Registro de la API y del frontend en
  `logs/api_cierre_semana12.log` y `logs/web_cierre_semana12.log`. Revisión visual del estudiante: Robustness, la línea base de Validation, Dashboard, Organisms,
  OrganismDetail, Fingerprints y Comparison funcionan.
- **Borradores de mensaje** al investigador y al profesor actualizados con la semana 12 → `preguntas_pendientes.md`.
- **Línea 8 del `.env`:** era un espacio; la corrigió el estudiante (Claude no lee ese archivo).
- **No se hizo (semana 13 o después):** red del MVP en la curva de validación, advertencias de ESLint y procedencia del
  MVP. → contexto, secciones 12.2, 14 y 16.

### 26-10-2026: pruebas de aceptación del MVP

- Pruebas CA1–CA6 ejecutadas sobre la etiqueta `mvp-semana8` (`d056fc9`) en un clon nuevo desde GitHub, con asistencia
  de Claude Code y revisión del estudiante, sin modificar el código. Resultado: 6 aprobados (CA3 con observaciones),
  0 fallidos y 0 no verificados. `make mvp` tarda 19 s; dos corridas dan salidas idénticas salvo las fechas de los
  `*.provenance.json`; la validación de E. coli coincide con los valores informados (1e-5: 6,6 % / 59,5 %; 1e-7:
  418/683/1.158, 37,97 % / 26,52 %).
- Observaciones: faltan la versión de PRODORIC, las fechas de descarga y las versiones del entorno en la procedencia;
  el commit de la caché (`9e0b73c`) ya no existe; la etiqueta apunta a `d056fc9`, no a `b628e54` como decía la entrada
  del MVP más abajo (ya corregida). → `evidencia_mvp/pruebas_aceptacion_mvp.md` (la evidencia queda solo en el servidor).

### 20-10-2026: bitácora del trabajo con Claude Code

- Se agregó `bitacora_claude_code.md`, el recorrido completo del 15 al 20-10-2026 para el documento de memoria.

### 19-10-2026: limpieza del proyecto

- Respaldo: rama `respaldo/pre-limpieza-semana12` y etiqueta `respaldo-pre-limpieza-semana12` (`3802d6e`).
- `1e3a35a` (entorno y código sin uso), `3893d57` (`src/atlas_common.py` y pruebas unitarias), `8978abd` (`legacy/` y
  genomas fuera de git), `e228f2f` (ESLint), `9b2f4c4` (vistas del MVP migradas al atlas), `0a10f90` (nombres de
  métricas, carga diferida, Validation dividida), `1cec481` (Makefile). El hook bloqueó dos commits parciales.
- Verificación: los 20 archivos de resultados son idénticos antes y después; `make mvp` funciona; 46 pruebas pasan;
  0 errores de ESLint. Etiquetas `semana09-auditoria` y `semana10-validacion` creadas; `semana10-sweep` eliminada.
  → `limpieza_semana12.md`; contexto, sección 12.1; `README.md`.

### 19-10-2026: reproducción a nivel de arista

- `251811b`: `reproduction_edges.tsv`, endpoint `/atlas/baseline/reproduction-edges` y
  `test_edge_level_reproduction_is_exact` (33 pruebas). `no-footprint` sale exactamente de los hits (con `n_sites`);
  `validated`, `high-precision` y `balanced`, exactamente de su red madre con el mínimo de footprint.
  → `robustez_semana12.md`, sección 8.4.

### 19-10-2026: semana 12, línea base del pipeline propio

- `7bb4940`: `scripts/export_fimo_cache.py` (`make cache-fimo`; 7.376.281 hits y 320.938 pares de `transfer_map`, solo de
  los 312 genomas validables, verificados con `COUNT(*)`), `src/networks/atlas_baseline.py` (`make baseline-atlas`), API
  `/atlas/baseline/*`, sección nueva en `Validation.jsx`, `tests/test_api_atlas_baseline.py` (32 pruebas).
- Resultado: el pipeline externo es umbral + tier + footprinting; `no-footprint` se reproduce exactamente; el
  footprinting duplica la precisión de `balanced`. Corrige la afirmación del contexto sobre `fimo_hits` (sección 4.5).
  → `robustez_semana12.md`, sección 8; contexto, sección 12; `preguntas_pendientes.md`, P3, P5 y R4.

### 19-10-2026: semana 12, robustez de las métricas

- `e304236`: `scripts/explore_robustness.py`, `src/networks/atlas_robustness.py` (`make robustness-atlas`), API
  `/atlas/robustness/*`, `Robustness.jsx` reescrita y en el menú, `tests/test_api_atlas_robustness.py`.
- `38222a8`: corrección, `n_edges` es trivial en las tres estrategias. El cálculo se repitió con el árbol limpio
  (manifiesto `38222a8`, `git_dirty: false`); hay 28 pruebas.
- Resultado: las métricas de tamaño son robustas entre redes vecinas y frente a perder la mitad de las aristas; las de
  estructura no lo son. → `robustez_semana12.md`; contexto, sección 12.
- Pendiente: línea base desde `fimo_hits` (requiere aprobar la exportación). → `robustez_semana12.md`, sección 8.

### 19-10-2026: cierre de la semana 11

- `main` avanzó (fast-forward) hasta `f2d5df3` y se creó la etiqueta **`semana11-metricas`**. `main` estaba en la semana 8:
  la fusión incluye también las semanas 9 y 10. La etiqueta antigua `semana10-sweep` apunta a `b628e54` (MVP), así que su
  nombre no corresponde a lo que contiene; no se tocó.

### 19-10-2026: pendientes de la semana 11

Commits: `90a3f23` (código y pruebas) y `df454c6` (documentación).

- **Validación repetida con el árbol limpio.** Resultados idénticos a los de la semana 10 (diferencia 0,0). Manifiesto en
  `63469d5`, `git_dirty: false`. Nueva prueba `tests/test_api_atlas_validation.py` (22 pruebas en total).
  → `correcciones_semana11.md`, C3.
- **Hipótesis del origen de los motivos comprobada** (`scripts/explore_motif_origin.py`). En `balanced`, el tamaño del
  genoma y la oferta de motivos cercanos explican el 88 % del efecto del filo sobre el número de TF. `Comparison.jsx`
  muestra la advertencia. → `metricas_semana11.md`, sección 8.5; `preguntas_pendientes.md`, R3.
- **Mensajes al investigador y al profesor listos**, pendientes de que el usuario los envíe. → `preguntas_pendientes.md`,
  final.
- **Se creó este índice** (`docs/README.md`).

### 19-10-2026: comparación entre taxones y documentación de la semana 11

- `3ce0f17`: `scripts/explore_comparison.py`, `src/networks/atlas_comparison.py` (`make comparison-atlas`), API
  `/atlas/comparison/*`, `Comparison.jsx` reescrita, `Fingerprints` y `Comparison` en el menú.
- `63469d5`: `metricas_semana11.md`, contexto actualizado con la sección 11, preguntas al investigador y al profesor.
- `f46562d`: se agregó `contexto_regulonatlas.md`.

### 15-10-2026: verificación y correcciones de la semana 11

- `73c7a34`: import roto en `main.py`. `a1b5dfc`: genoma replacement y `git_dirty`. `ceeb831`: `make check`, hook
  pre-commit y pruebas. `9801b4f`: `correcciones_semana11.md` y `preguntas_pendientes.md`.
- `06e5140`: métricas propias (`src/networks/atlas_metrics.py`), vistas Metrics y Fingerprints.

### 14 y 15-10-2026: semana 10

- `7ef945d`: validación propia contra RegPrecise, API y `Validation.jsx`. → `validacion_semana10.md`.
- `16b243b`: vistas con la caché, routers sin MariaDB.

### 28-09-2026: semana 9

- `c4ad722`: auditoría de `fimo_hits` y decisión de fuente de datos. → `auditoria_semana9.md`.
- `53d24d9`, `448e6f5`: `RegulatoryNetwork` con datos reales y layout determinista.

### 23 al 28-09-2026: MVP (semanas 1–8)

- `c5216c6`, `4745f58`: pipeline reproducible del MVP e informe. La etiqueta `mvp-semana8` apunta a `d056fc9`
  (24-09-2026). `b628e54` (28-09-2026) es posterior: regenera las procedencias y cambia `src/database/connection.py`.
  *(Corregido el 26-10-2026: antes decía que `b628e54` era la entrega; ver `evidencia_mvp/pruebas_aceptacion_mvp.md`,
  sección 6.)* → `../README.md`, contexto, sección 8.

## Cómo mantener esta documentación

- **Documento nuevo:** agregarlo al índice, con su sección y qué contiene.
- **Bloque de trabajo terminado:** agregar una entrada a la bitácora con la fecha, qué se hizo, el commit y el documento
  donde quedó.
- **Resultados nuevos:** documentarlos en el documento de la semana y resumirlos en el contexto (sección de la semana).
- **Pregunta nueva o resuelta:** `preguntas_pendientes.md`.
- Todo esto entra en el mismo commit que el trabajo, que antes pasa por `make check`.

# Revisión completa del sistema (semana 13)

*Realizada el 29-10-2026 sobre el commit `0a6a618` (rama `dev`), con asistencia de Claude Code, a pedido del
estudiante.* Durante la revisión **no se corrigió nada**: solo se midió y se anotó. Las correcciones las decide el
estudiante, hallazgo por hallazgo. La evidencia (registros, capturas de las 10 vistas en tres escenarios y scripts)
está en `docs/evidencia_revision_semana13/` y queda solo en el servidor.

## 1. Resumen

El sistema está en buen estado: **no se encontraron errores que afecten resultados ni que rompan una vista.**

| Área | Resultado |
|---|---|
| Base técnica | `make check`: 58 pruebas, 0 errores de ESLint. `make atlas-ready`: caché completa y árbol limpio |
| API | 35 de 35 endpoints responden 200, todos bajo 250 ms. Entradas inválidas: 404/400/422 con mensaje claro en inglés. Sin resultados: 24 endpoints responden 503 diciendo qué `make` correr; 0 errores internos |
| Vistas (1440 y 900 px) | 10 de 10 cargan sin errores de consola, sin respuestas fallidas y sin scroll horizontal de página |
| API apagada / sin resultados | Las 10 vistas muestran un mensaje de error; ninguna queda en blanco. La cabecera indica "Backend offline". Pipeline y Data Provenance marcan las etapas faltantes ("3 of 8 stages up to date") |
| Datos visibles | Los valores de control aparecen correctos (P/R/F1 0,612/0,332/0,431; E. coli 118/342/485; 2.224 genomas) |
| Textos | Interfaz en inglés y nombre RegulonAtlas en todas las vistas |
| Documentación | 0 enlaces rotos |
| Resultados y caché | Intactos tras la revisión (sha256) |

Hallazgos: **1 error menor, 6 mejoras y 6 detalles cosméticos o de código**, más las 19 advertencias de ESLint
(sección 4), que solo se listan.

## 2. Hallazgos

Clasificación: **error** = algo que no funciona o muestra un dato falso; **mejora** = funciona, pero se puede hacer
mejor; **cosmético** = detalle visual, de texto o de código sin efecto para el usuario.

| ID | Tipo | Vista o archivo | Hallazgo | Evidencia | Recomendación |
|---|---|---|---|---|---|
| E1 | Error menor | Dashboard | Con la API apagada, la tarjeta **Networks muestra "0"** en vez de "—": parece un dato real. Las demás tarjetas sí muestran "—" | `capturas/api_apagada/1_Dashboard.png` | Corregir: mostrar "—" mientras no haya datos |
| M1 | Mejora | Dashboard ("The five networks") y Validation ("Networks") | A 900 px de ancho, **las columnas numéricas quedan pegadas** ("78.4%22.0%0.343", "0.7840.2200.343") y los encabezados se superponen | `capturas/n_1_Dashboard.png`, `capturas/n_8_Validation.png` | Corregir: separación entre columnas y scroll horizontal dentro de la tabla, como en las demás |
| M2 | Mejora | Robustness (submuestreo), Fingerprints (tabla de la familia), Data Provenance (Results) | A 900 px, las tablas anchas **se cortan a la derecha** sin indicio de que hay más columnas (se puede deslizar dentro de la tarjeta). En Data Provenance la columna "Result" queda muy angosta | `capturas/n_7_Robustness.png`, `n_5_Fingerprints.png`, `n_10_Data_Provenance.png` | Corregir con una sombra o aviso de "desliza" y un ancho mínimo para la primera columna |
| M3 | Mejora (accesibilidad) | Comparison, Fingerprints, Metrics, Organisms, Robustness, Validation | **8 elementos responden solo al mouse**: filas de tabla que se eligen con clic (5), una celda (Fingerprints) y encabezados que ordenan (Metrics, 2). No se alcanzan con Tab. Las secciones plegables, los botones y los selectores sí funcionan con teclado | `registros/07_teclado.txt` | Corregir si la accesibilidad es requisito; si no, opcional |
| M4 | Mejora (documentación) | `README.md` | **No describe las vistas del dashboard** (qué responde cada una) | — | Agregar una tabla corta con las 10 vistas |
| M5 | Mejora (documentación) | `docs/preguntas_pendientes.md` | Falta la duda de la **versión de RegPrecise**: 3.0 en la tabla `provenance`, 3.2 en el manifiesto del MVP (`sistema_semana13.md`, sección 4) | — | Agregarla a las preguntas y al borrador para el investigador |
| M6 | Mejora | Dashboard | Las tarjetas de acceso no incluyen **Pipeline** ni **Data Provenance** (sí las otras 7 vistas) | `capturas/a_1_Dashboard.png` | Agregar las dos tarjetas |
| C1 | Cosmético | Validation, Pipeline, Data Provenance | Con la API apagada dan un mensaje genérico ("could not be loaded"), mientras que las otras 7 agregan "Check that the backend is running". Validation lo muestra como texto suelto, sin el recuadro rojo de las demás | `capturas/api_apagada/` | Unificar el mensaje y el recuadro |
| C2 | Cosmético | Cabecera | A 900 px, "Backend online" y "2,224 genomes · 5 networks" se parten en dos líneas | `capturas/n_*.png` | Evitar el salto de línea |
| C3 | Cosmético | Data Provenance | Si falta un resultado, la columna Files muestra "0 / 0" en vez de "—" | `capturas/sin_resultados/10_Data_Provenance.png` | Mostrar "—" |
| C4 | Código | `frontend/src/services/api.js` | **6 métodos sin uso**: `getAtlasMetricsDefinitions`, `getAtlasMetricsSummary`, `getAtlasOwnMetricsForGenomes`, `getAtlasComparisonManifest`, `getAtlasRobustnessManifest`, `getAtlasBaselineManifest`. Sus endpoints existen y funcionan | — | Quitarlos (los endpoints se quedan) |
| C5 | Código | `frontend/package.json` | La dependencia `clsx` no se usa en ningún archivo | — | Quitarla |
| C6 | Documentación | `docs/contexto_regulonatlas.md`, sección 13 | El diagrama de arquitectura no menciona las vistas Pipeline y Data Provenance ni `make atlas-ready` | — | Actualizar el diagrama |

**Observaciones sin acción:**

- Las notas de la tabla de fuentes (Data Provenance) están en español porque se muestran tal como el investigador las
  guardó en la base; la vista lo indica ("values as stored").
- El endpoint más pesado es `/atlas/metrics` (2,2 MB, 0,2 s), que usa Organisms para mostrar todos los genomas. Es
  aceptable para el uso actual.
- Con la API apagada aparecen errores de consola `ERR_CONNECTION_REFUSED`: son los esperables cuando el navegador no
  puede conectar.
- El entorno pide `nodejs>=24` y `bioinfo` tiene Node 24.13; la v22 del sistema (`/usr/local/bin/node`) solo se usa si
  se corre `npm` fuera del entorno conda. Las dependencias de Python que solo usa `legacy/` (biopython, requests,
  beautifulsoup4, tqdm, meme) ya están señaladas como tales en `environment.yml`.

## 3. Pruebas realizadas

| # | Prueba | Cómo | Resultado | Evidencia |
|---|---|---|---|---|
| 1 | Verificaciones previas | `make check`, `make atlas-ready` | 58 pruebas; caché completa | `registros/01_check.log` |
| 2 | Endpoints | Los 35 GET del OpenAPI, dos veces cada uno (tiempo con y sin caché en memoria) | 35 × 200; máx. 242 ms | `registros/02_endpoints.txt` |
| 3 | Entradas inválidas | 8 casos: red, genoma, tipo, nivel y métrica inexistentes; parámetro mal tipado | 404/400/422 con mensaje | `registros/03_entradas_invalidas.txt` |
| 4 | Resultados faltantes | Segunda API (puerto 8001) en una copia temporal con la caché enlazada y **sin** `data/results/` | 24 × 503 con el `make` a correr; 11 × 200 (solo leen la caché); 0 errores internos | `registros/04_sin_resultados.txt` |
| 5 | Vistas | Chrome sin interfaz, 10 vistas a 1440 y 900 px: captura, texto, consola, red y scroll | 0 errores; ver M1, M2, C2 | `capturas/a_*`, `capturas/n_*` |
| 6 | API apagada | Frontend aparte (puerto 5174) apuntando a un puerto sin servidor | 10 vistas con mensaje; ver E1, C1 | `capturas/api_apagada/`, `registros/05_*` |
| 7 | Sin resultados | Frontend aparte (puerto 5175) contra la API del punto 4 | 10 vistas con mensaje o etapas en "Missing" | `capturas/sin_resultados/`, `registros/06_*` |
| 8 | Teclado | Tab hasta una sección plegable, Enter, foco visible; filas clicables | Plegable: sí (aria-expanded false → true, foco visible). Filas: no (ver M3) | `registros/07_teclado.txt` |
| 9 | Código | Métodos de `api.js`, exportaciones, archivos sin importar, `TODO` | Ver C4, C5; 0 exportaciones o archivos sin uso; 0 `TODO` pendientes | — |
| 10 | Documentación | Enlaces de README, CLAUDE.md, `docs/` y registros; cobertura del README y del contexto | 0 enlaces rotos; ver M4, M5, C6 | — |
| 11 | Que nada cambió | sha256 de `data/results/` después de la revisión | Idénticos | — |

Todo se hizo sin modificar `data/results/` ni la caché: los escenarios de falla usaron copias temporales y puertos
aparte, que se apagaron y borraron al terminar.

## 4. Advertencias de ESLint (solo listadas)

19 advertencias, 0 errores, de 3 reglas del React Compiler. Ya estaban documentadas en `frontend/eslint.config.js`
como advertencias, no errores. Ninguna produce un fallo visible hoy.

| Regla | Cantidad | Dónde | Qué significa | Corregirla implica | Riesgo | Recomendación |
|---|---|---|---|---|---|---|
| `react-hooks/set-state-in-effect` | 13 | BaselineSection (1), Comparison (1), Fingerprints (1), Metrics (1), OrganismDetail (1), Organisms (1), RegulatoryNetwork (2), Robustness (2), Validation (3) | Las vistas ponen `setLoading(true)` al inicio del `useEffect` que carga datos. React lo desaconseja porque provoca un render extra | Cambiar el patrón de carga de 9 archivos (por ejemplo, un hook común de carga) | Medio: toca la carga de casi todas las vistas justo antes del congelamiento | **No corregir ahora.** Es el patrón de carga de todo el proyecto (`CLAUDE.md`) y funciona |
| `react-hooks/refs` | 5 | RegulatoryNetwork (líneas 469–474) | Se lee y escribe durante el render la referencia que guarda las posiciones del dibujo de la red (layout determinista, semana 9) | Mover el caché de posiciones fuera del render | Medio: puede cambiar la forma en que se dibujan las redes | **No corregir ahora** |
| `react-hooks/preserve-manual-memoization` | 1 | Fingerprints (línea 188) | El compilador no puede optimizar un `useMemo` porque sus dependencias declaradas (`[rows, family]`) no coinciden con las que usa | Ajustar las dependencias de ese `useMemo` | Bajo: un cambio local | **Se puede corregir** si se quiere dejar una advertencia menos |

Listado completo (archivo, línea y código): `docs/evidencia_revision_semana13/registros/08_eslint.txt`.

## 5. Siguiente paso

El estudiante decide qué hallazgos se corrigen (E1, M1–M6, C1–C6 y, si quiere, la advertencia de Fingerprints). Cada
corrección irá en su propio commit con `make check`. Después viene el congelamiento de funciones.

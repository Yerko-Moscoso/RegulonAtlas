# Bitácora del trabajo con Claude Code en RegulonAtlas

*Del 15-10-2026 (inicio del trabajo con Claude Code) al 04-11-2026 (semanas 11 a 13). Lo anterior (semanas 1 a 10, la redacción inicial
de `CLAUDE.md` y el commit `06e5140`) se hizo fuera de estas sesiones y aquí aparece solo como punto de partida.
Material de base para el documento de memoria del proyecto. El detalle técnico de cada etapa está en los documentos de
cada semana (índice en `docs/README.md`).*

---

## 0. Punto de partida (15-10-2026)

- **Rama `dev`, commit `06e5140`** ("Semana 11: métricas propias, vistas Metrics y Fingerprints, y contexto para Claude
  Code"). Incluía:
  - `src/networks/atlas_metrics.py` (`make metrics-atlas`) y sus resultados en `data/results/metrics/`;
  - el router `src/api/routers/atlas_metrics.py`;
  - las vistas `Metrics.jsx` y `Fingerprints.jsx` reescritas con las métricas propias;
  - `CLAUDE.md` con las reglas del proyecto.
- **`main`** seguía en la semana 8 (`b628e54`). Las semanas 9 y 10 nunca se habían fusionado.

---

## 1. Verificación inicial (15-10)

El usuario pidió revisar el estado sin modificar archivos.

**Lo que funcionaba:**
- Los resultados existían.
- Los valores de control de E. coli estaban bien: 118 TF, 342 operones diana, 485 pares.
- El frontend compilaba y los métodos de `api.js` que usaban Metrics y Fingerprints existían.

**Lo que fallaba o faltaba:**

| # | Problema | Causa |
|---|---|---|
| 1 | **El commit `06e5140` dejaba la API sin arrancar.** `main.py` importaba `atlas_metrics_router`, que no existe. | La corrección estaba en la copia local, pero no entró en el commit. Ya estaba publicado en `origin/dev`. |
| 2 | El atlas tenía 2.223 genomas en vez de 2.224 | El genoma de reemplazo (*Gordonia iterans*, `GCF_002993285.1`) tiene `selection = "replacement (GCF_050942165.1 suppressed in RefSeq 2026)"`. La comparación exacta con `"replacement"` lo dejaba fuera. |
| 3 | `manifest.json` apuntaba al commit `16b243b`, que no contenía el módulo | Las métricas se calcularon antes del commit, y nada registraba que había cambios sin commit. |
| 4 | Faltaban `docs/contexto_regulonatlas.md` y `docs/preguntas_pendientes.md`; `docs/Claude.md` era una copia de `CLAUDE.md` | — |
| 5 | La `density` propia era entre 3,7 y 170 veces la externa, con correlación negativa | Se resolvió después como diferencia de definición. |

**Limitaciones de la verificación:**
- El backend no estaba corriendo y no se levantó.
- `TestClient` no funcionaba porque faltaba `httpx`, así que se probó llamando directamente a las funciones del router.

---

## 2. Correcciones y salvaguardas (15-10)

El usuario pidió aplicar los cambios y arreglar los commits "para que no tengamos más problemas".

| Commit | Cambio |
|---|---|
| `73c7a34` | Arreglo del import en `main.py`. Es un commit nuevo encima, sin reescribir el historial, porque `06e5140` ya estaba publicado. |
| `a1b5dfc` | El genoma de reemplazo vuelve al atlas: se compara la primera palabra de `selection` y se agrega `isAtlasSelection()` en el frontend. Los manifiestos registran `git_dirty`. |
| `ceeb831` | `scripts/check_commit.sh`, un hook `pre-commit` versionado (`make hooks`), `make check` y las primeras pruebas de la API. Revisa el **índice**, no la copia de trabajo, y se comprobó que habría bloqueado `06e5140`. Se instalaron `pytest` y `httpx` en `bioinfo`. |
| (sin commit) | Se repitió `make metrics-atlas` con el árbol limpio: manifiesto en `ceeb831`, `git_dirty: false`. |
| `9801b4f` | `docs/correcciones_semana11.md` (C1 a C6) y `docs/preguntas_pendientes.md` (P1 a P4). |

- Se eliminó `docs/Claude.md`, idéntico a `CLAUDE.md` (comprobado con `cmp`).
- **Hallazgos:**
  - **R1:** la `density` externa es `n_edges / (n_tf × todos los operones del genoma)`. Se cumple en las 6.427 filas.
  - **P1:** `n_edges` y `n_tf` de `network_metrics` no se pueden reproducir desde la caché. Para E. coli, la tabla
    externa da 919 aristas y la caché tiene 832 filas.

---

## 3. Contexto y comparación entre taxones (19-10)

- **`f46562d`:** el usuario agregó `docs/contexto_regulonatlas.md`. Se señaló lo que estaba desactualizado:
  Fingerprints con 919 aristas, la falta de una sección de la semana 11 y la arquitectura.
- **Decisión del usuario:** para Comparison, elegir la opción que diera resultados "más cercanos o iguales" a los del
  pipeline externo. Se eligió la **comparación por taxón (opción A)**, porque es la única que tiene equivalente externo.
  PCA y clusters no tienen con qué compararse.
- **`scripts/explore_comparison.py`** fijó las decisiones: mínimo de 5 genomas por taxón, las 11 métricas con
  equivalente externo y Spearman de las medianas por taxón como medida de concordancia.
- **`3ce0f17`:**
  - `src/networks/atlas_comparison.py` (`make comparison-atlas`), la API `/atlas/comparison/*` y `Comparison.jsx`
    reescrita. La versión anterior llamaba a `getOrganismProjection` y `getRegulatoryClusters`, que no existían.
  - **Hallazgo:** Fingerprints y Comparison no estaban en el menú. Se agregaron.
- **`63469d5`:** `docs/metricas_semana11.md`, y actualización del contexto y de las preguntas pendientes.
- **Resultados:**
  - `n_targets`, `n_edges`, `max_out_degree` y `n_tf` ordenan los taxones igual que la tabla externa (ρ ≥ 0,936 en
    `balanced`).
  - Kruskal–Wallis llega a la misma conclusión que la tabla externa en el 95 % de las combinaciones.
- **Corrección en la redacción:** se suavizó una afirmación del documento (que el efecto del taxón venía de la cobertura
  de motivos) y se marcó como hipótesis sin verificar.
- El usuario revisó el dashboard y los `curl` dieron los valores correctos.

---

## 4. Cierre de pendientes de la semana 11 (19-10)

- **Validación repetida** con el árbol limpio. El resultado fue **idéntico** al de la semana 10 (diferencia 0,0) y el
  manifiesto quedó en `63469d5`. Se agregó `tests/test_api_atlas_validation.py`.
- **Hipótesis del origen de los motivos** (`scripts/explore_motif_origin.py`):
  - se ubicó en GTDB el origen del 98–100 % de los motivos;
  - en `balanced`, el tamaño del genoma más la oferta de motivos cercanos explican el **88 % del efecto del filo**;
  - Comparison.jsx ahora lo advierte.
- **Mensajes** al investigador y al profesor: listos en `preguntas_pendientes.md`, pendientes de que el usuario los envíe.
- **Decisión del usuario:** tener un lugar único para la documentación. Se creó **`docs/README.md`** (índice y bitácora).
- **Commits:** `90a3f23`, `df454c6` y `f2d5df3`.
- **Cierre de la semana 11:** fast-forward de `main` hasta `f2d5df3` y etiqueta `semana11-metricas`. Con eso `main`
  incluye también las semanas 9 y 10. Se detectó que `semana10-sweep` apuntaba al MVP.

---

## 5. Semana 12: robustez de las métricas (19-10)

- **Decisión:** hacer los dos análisis.
  - **A. Entre redes**, que era lo que decía el plan.
  - **B. Submuestreo de aristas**, que era lo que proponía el prototipo de Robustness.jsx.
- **`e304236`:** `scripts/explore_robustness.py`, `src/networks/atlas_robustness.py` (24 procesos, semilla por genoma),
  la API `/atlas/robustness/*`, `Robustness.jsx` reescrita y en el menú, y las pruebas.
- **Resultados:**
  - Las redes están **anidadas** (high-precision ⊂ validated ⊂ balanced ⊂ permissive).
  - El footprinting quita alrededor del 40 % de las aristas, pero conserva el orden de los genomas (ρ 0,96).
  - Las métricas de tamaño resisten perder el 50 % de las aristas (ρ ≥ 0,98); las de estructura no.
- **Errores y su corrección:**
  1. `n_edges` solo estaba marcada como "trivial" en dos de las tres estrategias, así que con `low_confidence` contaba
     como robusta. Se corrigió en **`38222a8`** y se agregó una prueba.
  2. Una nueva ejecución arrancó con documentos modificados (`git_dirty: true`). El bucle de espera había leído el
     **log viejo** y los archivos guardados con `stash` se recuperaron demasiado pronto. Se detuvo y se repitió con
     `stash` durante todo el cálculo. Resultado final: `38222a8`, `git_dirty: false`.
  3. Un `pkill` coincidió con su propio comando y cortó la terminal. No se perdió nada.
- **`eaf4acd`:** `docs/robustez_semana12.md`. Al agregar la sección de la semana 12, el contexto se renumeró
  (secciones 12 a 18).

---

## 6. Semana 12: línea base del pipeline propio (19-10)

- **Decisión del usuario:** exportar solo los **312 genomas validables**, porque la red simple es solo de prueba.
- **`scripts/export_fimo_cache.py`** (`make cache-fimo`): 7.376.281 hits y 320.938 pares de `transfer_map`. Usa los
  índices de la base y comprueba cada lote con `COUNT(*)`. Tardó 56 segundos.
- **Hallazgo:** `transfer_map` solo contiene pares elegibles y **todos** los hits están dentro. Eso corrigió una
  afirmación del contexto (sección 4.5). La variante "solo elegibles" daba lo mismo que la otra, así que se eliminó y
  se agregó `order_ceiling`.
- **`7bb4940`:** módulo `atlas_baseline.py`, API `/atlas/baseline/*`, una sección en Validation.jsx y pruebas.
- **Hallazgos clave:**
  - **El pipeline externo es umbral de p + techo de tier + footprinting.** `no-footprint` se reproduce exactamente
    (Jaccard 1,0) y las otras redes están 100 % contenidas en su línea base.
  - El footprinting **duplica la precisión** de `balanced` (0,312 → 0,612).
  - Sin autoevaluación, la ventaja de las redes externas crece.
- **`2df83a7`:** documentación. La sección se renombró como "análisis C" porque chocaba con "B" (submuestreo).
- **Ampliación** (`251811b` y `3802d6e`), después de que el usuario pidió explicar la reconstrucción:
  - la coincidencia también es exacta a nivel de **arista por motivo**, y `n_sites` coincide al 100 %;
  - `validated`, `high-precision` y `balanced` salen exactamente de su red "madre" aplicando el footprint mínimo;
  - `permissive` no se puede comprobar así;
  - se agregó una prueba automática.
  - Quedó explícito lo que **no** se reproduce: el cálculo del footprint, la `confidence` y los 2.224 genomas.

---

## 7. Análisis del proyecto (19-10, sin cambios)

Se presentaron recomendaciones en grupos: A (errores), B (eliminar), C (archivar), D (código), E (repositorio) y F (lo
que no se tocaría).

Lo más importante que se encontró:
- **Un error propio de Claude:** había escrito que `environment.yml` no estaba versionado, y sí lo estaba. Además estaba
  desactualizado.
- Tres vistas del menú mostraban el MVP, y el Header decía "8 Enterobacteriaceae".
- 90 MB de genomas estaban versionados en git.
- 18 módulos sin uso.
- Funciones copiadas en 2 a 5 módulos.
- 19 errores de ESLint.

---

## 8. Limpieza del proyecto (19-10)

El usuario aprobó aplicar todos los cambios.

**Respaldo previo:** la rama `respaldo/pre-limpieza-semana12` y la etiqueta del mismo nombre, en `3802d6e`.

| Commit | Contenido |
|---|---|
| `1e3a35a` | `environment.yml` regenerado. **El primer intento falló** (`meme` choca con `icu`/`libxml2`); se corrigió con una sección pip, igual que en `bioinfo`, y `--dry-run` resolvió. También: se eliminaron los routers `/robustness` y `/graphs` y archivos sin uso; se actualizó `config.py` para Pydantic 2; se ordenó `.gitignore` (sigue ignorando lo mismo); se corrigió la frase sobre `environment.yml`. |
| `3893d57` | `src/atlas_common.py` con las reglas comunes y 13 pruebas unitarias. **Verificado: los 20 archivos de resultados son idénticos.** |
| `8978abd` | `legacy/` (ingesta y pipeline piloto, movidos con `git mv`) y `data/genomes/` fuera de git, sin borrarlo del disco. |
| `e228f2f` | ESLint en `make check`. Las reglas del React Compiler quedan como advertencia, con su razón documentada. |
| `9b2f4c4` | Dashboard, Organisms, OrganismDetail y Header con datos del atlas. Eliminados la API del MVP (`/metrics`, `results.py`) y `comparisonGenomes.js`. La API ya no depende de `src/pipeline`. |
| `0a10f90` | `utils/metrics.js` (nombres únicos por métrica), carga diferida (1.278 → 254 kB) y Validation.jsx dividido (764 → 500 líneas). |
| `1cec481` | Makefile con `make help`, `make atlas` y `make web`. |
| `6d216bb` | `docs/limpieza_semana12.md`, README reescrito, contexto (12.1), `CLAUDE.md` e índice. |

- **El hook bloqueó dos commits parciales** de la etapa 4: uno con un `git rm` sin el archivo que lo reemplazaba y otro
  sin la configuración nueva de ESLint. Se rehicieron en orden (por eso la 5 quedó antes que la 4).
- **Etiquetas:** se crearon `semana09-auditoria` (`448e6f5`) y `semana10-validacion` (`16b243b`) y se eliminó
  `semana10-sweep` (era `b628e54`).
- **`make mvp`** funciona (18 s). Sus archivos versionados se restauraron porque solo cambiaban las fechas.
- **Segundo análisis**, medido contra la etiqueta de respaldo:

  | | Antes | Después |
  |---|---|---|
  | Módulos sin uso | 18 | 2 (conservados a propósito) |
  | Errores de ESLint | 19 | 0 |
  | Datos versionados | 90,1 MB | 11,8 MB |
  | Pruebas | 33 | 46 |

  Además, los 26 endpoints responden por HTTP y las 9 vistas compilan.
- **La primera tabla del segundo análisis tenía cifras estimadas.** Se corrigió con mediciones antes del commit.
- Se levantaron el backend y el frontend, el usuario los revisó y se apagaron.

---

## 9. Estado al 20-10

- **Todo está guardado:** no hay cambios sin commit, `dev` está al día con `origin/dev` y el respaldo está en GitHub.
- **`main` va 15 commits detrás de `dev`.** Falta cerrar la semana 12 con su etiqueta.
- **Pendientes del usuario:**
  - enviar los mensajes al investigador y al profesor;
  - corregir la línea 8 del `.env`.
- **Lo que sigue:**
  - **Semana 13:** las vistas Pipeline, Data Provenance y MVP, y congelar funciones.
  - **Semana 14:** prueba desde un clon limpio, ampliar las pruebas y publicar `v1.0`.

---

## 10. Cierre de la semana 12 (26-10)

- **Pruebas de aceptación del MVP** (`db6c33e`): CA1–CA6 sobre la etiqueta `mvp-semana8` desde un clon limpio, sin
  modificar el código. 6 aprobadas (CA3 con observaciones). Se descubrió que la etiqueta apunta a `d056fc9`, no a
  `b628e54` como decía la bitácora del proyecto; se corrigió el texto, no la etiqueta.
- **El usuario revisó un plan antes de ejecutar** y decidió, punto por punto:
  - la evidencia de las pruebas (capturas, registros, scripts) **no se sube a GitHub**; solo el registro formal;
  - **todo el desarrollo queda en `dev`**; nada a `main` hasta que él lo indique (regla en `CLAUDE.md`).
- `ef15c4d`: cierre documentado. Verificado: los 5 manifiestos con `git_dirty: false`; los 32 endpoints responden.
- `cd5fa71`: el usuario revisó las vistas en el navegador (todo funcionaba) y corrigió él mismo la línea 8 del `.env`
  (un espacio). **Claude no leyó el archivo**, por la regla de credenciales.

---

## 11. Semana 13: estado del pipeline y Data Provenance (27-10)

El usuario pidió avanzar por partes: solo el endpoint de estado y la vista Data Provenance. **Descartó la vista MVP.**

| Commit | Contenido |
|---|---|
| `65e9ace` | `scripts/explore_status.py` (exploración), `src/atlas_status.py` y `GET /api/v1/atlas/status`: 8 etapas (3 de caché, 5 de resultados) con commit, `git_dirty`, si el commit sigue en el historial, archivos y si cada resultado está al día con su entrada. 7 pruebas (53 en total) |
| `fbce952` | `DataProvenance.jsx` reescrita con datos reales. El prototipo llamaba a endpoints inexistentes y listaba fuentes que el atlas no usa (KEGG, RegulonDB) |
| `fd3f3a5` | `docs/sistema_semana13.md` |

- **Observación registrada, sin cambiar nada:** la base dice RegPrecise 3.0; el MVP decía 3.2 (luego pregunta P7).

---

## 12. Pasada de presentación de las vistas (27-10)

- El usuario preguntó si las vistas tenían relleno. Claude separó resultado principal, evidencia de apoyo y relleno, sin
  cambiar nada.
- El usuario pidió **un respaldo y luego la corrección**, para poder volver atrás: rama y etiqueta
  `respaldo-pre-presentacion-semana13` (`fd3f3a5`), subidas a GitHub.
- Cuatro commits (`3edeff6` a `fd2abb1`): Validation y Robustness con el resultado
  arriba y el detalle en secciones plegables con su resumen **calculado con los datos**; columnas superpuestas y una
  leyenda corregidas. Alto de Validation 2.962 → 1.780 px, sin cambiar ningún dato.
- Capturas antes y después con Chrome sin interfaz. El usuario **aprobó** la pasada (`06acaca`).

---

## 13. Vista Pipeline, prototipos y orden de Organisms (29-10)

- `9f55796`: `Pipeline.jsx` con el flujo real en 7 etapas, **la autoría de cada parte** (pipeline externo o este
  proyecto), el estado de cada etapa propia y enlaces a las vistas. Sin backend nuevo.
- `6dd5b18`: se eliminó `MVP.jsx`. El usuario **descartó también Settings**, que nunca existió como archivo.
- `e32b0b2`: el usuario notó que Organisms no estaba en orden alfabético. Ahora abre por organismo de A a Z, ignorando
  signos ("[Enterobacter]" en la E) y con números como números.

---

## 14. `make all`, nombre y prueba de reproducibilidad (29-10)

- **Error de Claude:** al proponer el plan, afirmó que `make atlas` no incluía la línea base, y lo dejó escrito en la
  vista Pipeline. Al leer el Makefile completo vio que sí la incluía y lo informó antes de seguir.
- `71ead39`: `make all` pasa a correr todo el atlas; el MVP de 8 genomas queda solo en `make mvp`. Se corrigió la vista.
- `65e079f`: nombre del proyecto unificado en todos los archivos.
- `7521118`: `make atlas-ready`, una revisión previa que detiene `make all` en el primer segundo si falta la caché o hay
  cambios sin commit. 5 pruebas (58 en total).
- **Prueba de reproducibilidad** (`0a6a618`), pedida por el usuario con la condición de **no tocar los resultados que
  muestra el software**:
  - clon limpio desde GitHub, caché enlazada solo para lectura, `make all` en 8 min 17 s;
  - **20 de 20 archivos de datos idénticos byte a byte**; manifiestos iguales salvo fecha y commit; 5/5 valores de
    control y 58/58 pruebas sobre los resultados nuevos;
  - resultados y caché del proyecto verificados con sha256 antes, después y tras borrar el clon.

---

## 15. Revisión completa y correcciones (29-10)

- **Revisión sin corregir nada** (`74bc6bf`): 35 endpoints, las 10 vistas a 1440 y 900 px, la API apagada y una API
  sin resultados (en copias temporales), teclado, código y documentación. Sin errores graves: 1 error menor, 6 mejoras,
  6 detalles y 19 advertencias de ESLint.
- **El usuario eligió corregir todo**, salvo 18 advertencias de ESLint que se mantienen por riesgo (patrón de carga de
  las vistas y dibujo de las redes). Un commit por hallazgo (`95375a7` a `ffa5266`). Los cambios más visibles:
  - tablas anchas legibles en pantalla angosta (`ScrollX.jsx`, con aviso de más columnas);
  - filas y encabezados clicables usables con teclado (`utils/a11y.js`);
  - "—" en vez de "Networks 0" con la API apagada;
  - README con las 10 vistas y la pregunta P7 sobre la versión de RegPrecise.

---

## 16. Congelamiento de funciones (29-10 y 04-11)

- `ce540b6`: `docs/congelamiento_v1.md` con la lista cerrada de la v1.0, lo que queda fuera, las reglas (solo
  correcciones, pruebas, documentación y redacción; funciones nuevas solo con aprobación y registradas como excepción)
  y las limitaciones. La regla también quedó en `CLAUDE.md`. RegulonDB, excepción prevista si el profesor la exige.
- `d9bcf58`: cierre de la semana 13, tras la revisión del usuario.
- 04-11: etiqueta **`congelamiento-v1`** sobre `d9bcf58` (solo en `dev`), pedida por el usuario (`bfd42ec`).

---

## 17. Estado al 04-11

- `dev` limpio y en GitHub; `main` sin cambios desde la semana 11 (`f2d5df3`).
- 58 pruebas; 8 de 8 etapas del pipeline al día; funciones congeladas.
- **Pendiente del usuario:** enviar los mensajes al investigador y al profesor (borradores con P1–P7 y Q1–Q4).
- **Lo que sigue:** semana 14 (prueba desde cero con `conda env create`, revisar la cobertura de pruebas y `v1.0` cuando
  el usuario lo indique), semana 15 (redacción) y semana 16 (defensa).

---

## Decisiones del usuario a lo largo del trabajo

1. Verificar antes de cambiar, y mostrar los cambios propuestos antes de aplicarlos.
2. Arreglar los commits sin reescribir el historial.
3. Comparación por taxón, por ser la más cercana al pipeline externo.
4. Un único punto de documentación (`docs/README.md`).
5. Línea base solo en los 312 genomas validables.
6. Aplicar toda la limpieza, con un respaldo previo.
7. Todo el desarrollo en `dev`; nada a `main` hasta nuevo aviso.
8. La evidencia de las pruebas queda en el servidor; en GitHub solo los registros formales.
9. Avanzar por partes, revisando un plan antes de cada ejecución.
10. Descartar las vistas MVP y Settings.
11. Antes de cambios grandes en la presentación, un respaldo para poder volver atrás.
12. `make all` corre el atlas; el MVP solo con `make mvp`.
13. Las pruebas no deben tocar los resultados que muestra el software (clon o copia aparte, con comparación).
14. Corregir todos los hallazgos de la revisión, y de ESLint solo lo de bajo riesgo.
15. Congelar las funciones al cierre de la semana 13 y marcarlo con una etiqueta.

## Errores de Claude y cómo se corrigieron

| Error | Corrección |
|---|---|
| `environment.yml` "no versionado" | `1e3a35a` |
| `n_edges` marcada como robusta en `low_confidence` | `38222a8` |
| Ejecución de robustez con `git_dirty: true` | Repetida con `stash` |
| `pkill` que cortó la propia terminal | Sin consecuencias |
| Conflicto de nombres B/C en el documento de la semana 12 | Renombrado |
| Afirmaciones sin verificar (cobertura de motivos, cifras del segundo análisis) | Marcadas como hipótesis o reemplazadas por mediciones |
| "`make atlas` no incluye la línea base" (leyó solo parte de la regla del Makefile), escrito en la vista Pipeline | Informado al usuario; corregido en `71ead39` |
| Fecha "30-10-2026" en vez de 29-10 en la documentación de `make all` | Corregido en `0a6a618` |
| La primera versión de `StatusBadge.jsx` exportaba una función junto al componente (error de ESLint) | Movida a `utils/atlas.js` antes del commit |
| Script de valores de control con nombres de nivel taxonómico equivocados | Corregido y probado contra los resultados actuales antes de usarlo |
| Tabla de enlaces del índice apuntaba a `docs/pruebas_aceptacion_mvp.md`, que estaba en `evidencia_mvp/` | Corregido en `db6c33e` |
| `pkill` que cortó la propia terminal (otra vez) | Sin consecuencias; se repitió el paso |

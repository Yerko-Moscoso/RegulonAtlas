# Prueba de reproducibilidad desde cero de RegulonAtlas v1.0 (semana 14)

*Ejecutada el 04-11-2026, de 16:08 a 16:26 (hora de Chile), con asistencia de Claude Code, según el plan aprobado por el
estudiante (`docs/README.md`, bitácora del 04-11-2026).* Todos los valores salen de comandos ejecutados ese día. El
detalle caso por caso está en **`casos_de_prueba_v1.xlsx`** (109 casos) y la evidencia (registros, capturas, manifiestos y
scripts) en esta carpeta. En git se versiona solo este registro; el Excel y la evidencia quedan en el servidor, como en
las pruebas anteriores.

## 1. Resultado

**Aprobada, con un hallazgo de documentación.** Una persona con solo el repositorio y el README puede instalar el
proyecto en un entorno nuevo y obtener **exactamente los mismos resultados** que muestra el dashboard: 20 de 20
archivos de datos con los mismos valores (16 idénticos byte a byte), los 5 valores de control y las 58 pruebas
automáticas. **108 de 109 casos de prueba aprobados (99,1 %).**

El caso fallido (INS-03) es de documentación: la instrucción del README `npm install` modifica `package-lock.json`, y con
eso `make all` se niega a correr. Con `npm ci` todo funciona (hallazgo H1, sección 7). **El README ya se corrigió para usar `npm ci`.**

Nada del proyecto cambió: los resultados del dashboard, la caché y el entorno `bioinfo` quedaron idénticos (sha256 y
lista de paquetes), y el clon y el entorno temporal se borraron.

## 2. Objetivo y alcance

**Objetivo:** comprobar que la versión congelada se instala desde cero siguiendo el README y reproduce los resultados,
y verificar cada función del software (análisis, API y dashboard) sobre esa instalación nueva.

| Incluido | No incluido |
|---|---|
| Clon limpio de la etiqueta `congelamiento-v1` desde GitHub | Exportar la caché desde MariaDB (se reutilizó la del proyecto, solo lectura; opción a) |
| Entorno nuevo creado con `conda env create -f environment.yml` | Otra máquina u otro sistema operativo |
| `npm install` / `npm ci`, `make check`, `make all` | El MVP de 8 genomas (`make mvp`), probado aparte en la semana 12 |
| Las 35 rutas de la API, errores y la API sin resultados | Pruebas de carga o de seguridad |
| Las 10 vistas del dashboard a 1440 y 900 px y 18 funciones interactivas | |

## 3. Entorno de la prueba

| Elemento | Valor |
|---|---|
| Versión probada | Etiqueta `congelamiento-v1`, commit `d9bcf58`, clonada desde `git@github.com:Yerko-Moscoso/Proyecto_Bioinfo.git`; 0 cambios al clonar |
| Entorno Python | Nuevo, creado en una carpeta temporal con `conda env create -p <carpeta> -f environment.yml` (22 s; 1,2 GB). No se tocó `bioinfo` |
| Caché | `~/proyecto/data/cache/atlas` (18 archivos), enlazada en el clon y solo leída |
| Servidor | `devastator`, Ubuntu 22.04, 48 CPU |
| Navegador de las pruebas | Google Chrome sin interfaz, controlado con `playwright-core` |

`environment.yml` pide versiones mínimas, así que el entorno nuevo instaló las más recientes. **10 de 14 paquetes
quedaron en una versión distinta a la de `bioinfo`**:

| Paquete | `bioinfo` (trabajo) | Entorno nuevo (prueba) |
|---|---|---|
| Python | 3.11.15 | 3.11.17 |
| pandas | 3.0.5 | **3.1.1** |
| pyarrow | 23.0.1 | **26.0.1** |
| statsmodels | 0.14.6 | 0.15.0 |
| FastAPI | 0.141.1 | 0.162.0 |
| pydantic / pydantic-settings | 2.13.4 / 2.15.0 | 2.14.2 / 2.16.2 |
| uvicorn | 0.52.3 | 0.54.0 |
| SQLAlchemy | 2.0.52 | 2.1.8 |
| pytest | 9.1.1 | 9.2.0 |
| Node | 24.13.0 | 25.2.1 |
| numpy, scipy, networkx, pymysql, httpx | iguales | iguales |

Evidencia: `registros/04_clon.txt`, `05_env_create.log`, `06_versiones.txt` (hoja **Entorno** del Excel).

## 4. Procedimiento

1. **Huellas de lo actual:** sha256 de los 46 archivos de resultados y los 18 de la caché, lista de entornos conda y de
   los 391 paquetes de `bioinfo`.
2. **Clon** de la etiqueta y **entorno nuevo** desde `environment.yml`.
3. **Frontend como dice el README** (`npm install`). Como modificó `package-lock.json`, se registró, se comprobó que la
   revisión previa de `make all` lo detecta, se restauró el archivo y se instaló con `npm ci`.
4. **`make check` recién instalado** (sin resultados) y **API sin resultados** (casos SIN), con la caché ya enlazada.
5. **`make all`** con el entorno nuevo.
6. **Comparación** con los resultados del dashboard (`scripts/comparar_resultados.py`), **valores de control**
   (`valores_control.py`), `make check` y ESLint.
7. **API y dashboard del clon** (puertos 8002 y 5176) y un segundo frontend sin API (5177): casos API, ERR, VIS y FUN
   (`scripts/ejecutar_api.py`, `ejecutar_ui.cjs`).
8. **Comprobación de que nada cambió**, borrado del clon y del entorno temporal.
9. **Excel** desde el catálogo de casos (`scripts/casos.py`, `excel_casos.py`). El estado de cada caso lo decide su
   resultado obtenido, no una revisión manual.

## 5. Comparación de resultados

Resultados del clon (entorno nuevo) frente a los que muestra el dashboard (`~/proyecto`). Reglas: mismo sha256 →
idéntico; si no, valor por valor (textos iguales, números con diferencia ≤ 1e-9); manifiestos iguales salvo fecha y
commit.

| Análisis | Archivos de datos | Idénticos (sha256) | Mismos valores | Manifiesto |
|---|---|---|---|---|
| Validación | 6 | 6 | 0 | Igual salvo fecha y commit (*) |
| Métricas | 3 | 1 | 2 | Igual salvo fecha y commit (*) |
| Comparación entre taxones | 2 | 2 | 0 | Igual salvo fecha y commits |
| Robustez | 5 | 4 | 1 | Igual salvo fecha y commits |
| Línea base | 4 | 3 | 1 | Igual salvo fecha y commit |
| **Total** | **20** | **16** | **4** | **5 sin diferencias de contenido** |

**Por qué 4 archivos difieren en bytes con los mismos valores:**

- `metrics/atlas_metrics.parquet` y `robustness/subsampling_genomes.parquet`: cada Parquet guarda la versión de pyarrow
  que lo escribió (23.0.1 frente a 26.0.1). Las 13.220 y 986.400 filas son idénticas (diferencia máxima 0).
- `baseline/vs_networks.tsv`: algunos decimales se escriben con un dígito más (`0.3305811817429396` frente a
  `0.33058118174293966`); es el mismo número (diferencia 0).
- `metrics/metrics_vs_external.tsv`: el último dígito de algunas correlaciones cambia con pandas 3.1
  (`0.9324455712654725` frente a `…726`), una diferencia de 4,4 × 10⁻¹⁶, el redondeo propio de la máquina.

(*) La copia del manifiesto de la caché que guardan validación y métricas nombra además las tablas `fimo_hits` y
`transfer_map`, exportadas el 19-10-2026 después de generar los resultados originales. Esas tablas no las usan esos
análisis. Es la misma diferencia explicada en la prueba de reproducibilidad del 29-10.

**Valores de control** (sobre los resultados nuevos):

| Control | Esperado | Obtenido |
|---|---|---|
| Validación balanced, `all` / `genome_tf`: P / R / F1 | 0,612 / 0,332 / 0,431 | 0,612 / 0,332 / 0,431 |
| E. coli K-12 en balanced: TF / operones / pares | 118 / 342 / 485 | 118 / 342 / 485 |
| Genomas del atlas con métricas, por red | 2.224 | 2.224 en las 5 redes |
| Taxones con ≥ 5 genomas (balanced) | 10 / 13 / 48 / 83 | 10 / 13 / 48 / 83 |
| Línea base: `no-footprint` reproducida | 29.807 aristas, exacta | 29.807, exacta |

**Tiempos:** `make all` 8 min 34 s con el entorno nuevo (8 min 17 s con `bioinfo` el 29-10); `make check` 8 s;
creación del entorno 22 s; `npm ci` 5 s. Mismas 4 advertencias `ConstantInputWarning` de scipy que la corrida original.

Evidencia: `registros/14_make_all.log`, `16_comparacion.txt`, `16b_diferencias_bytes.txt`, `17_valores_control.txt`,
`manifiestos_nuevos/` (hoja **Comparación de resultados** del Excel).

## 6. Casos de prueba

109 casos, uno por función, ejecutados de forma automática sobre la instalación nueva. Detalle (precondición, pasos,
resultado esperado, resultado obtenido, estado y evidencia) en la hoja **Casos de prueba** del Excel; el resumen de la
hoja **Resumen** se calcula con fórmulas sobre esa hoja.

| Grupo | IDs | Qué comprueban | Aprobados |
|---|---|---|---|
| Instalación | INS-01 a 06 | Clonar, crear el entorno, instalar el frontend (`npm install` y `npm ci`), `make help`, `make check` sin resultados | **5 de 6** (falla INS-03) |
| Revisión previa | REV-01 a 03 | `make all` se detiene sin caché o con cambios sin commit, y sigue cuando todo está listo | 3 de 3 |
| Análisis | ANA-01 a 06 | `make all` y cada uno de los 5 análisis, con sus archivos y manifiesto (`git_dirty: false`, commit `d9bcf58`) | 6 de 6 |
| Comparación | CMP-01 a 05 | Resultados de cada análisis iguales a los del dashboard | 5 de 5 |
| Valores de control | CTL-01 a 05 | Las 5 cifras de control | 5 de 5 |
| Calidad | CAL-01 a 03 | `make check`, 58 pruebas, ESLint sin errores | 3 de 3 |
| API | API-01 a 35 | Las 35 rutas GET responden 200 con el contenido esperado | 35 de 35 |
| API: errores | ERR-01 a 08 | Entradas inválidas: 404, 400 o 422 con mensaje claro | 8 de 8 |
| API: sin resultados | SIN-01 a 06 | Sin resultados, 503 con el `make` a correr; el estado marca las etapas faltantes | 6 de 6 |
| Dashboard: vistas | VIS-01 a 10 | Cada vista a 1440 y 900 px: con datos, sin errores ni scroll horizontal | 10 de 10 |
| Dashboard: funciones | FUN-01 a 18 | Cabecera, accesos, orden y búsqueda en Organisms, ficha de genoma, grafo, métricas, radar, nivel taxonómico, estrategia, red, sección plegable, teclado, enlaces, trazabilidad, tablas angostas y backend apagado | 18 de 18 |
| Aislamiento | NOT-01 a 04 | Resultados, caché y `bioinfo` intactos; limpieza | 4 de 4 |
| **Total** | | | **108 de 109 (99,1 %)** |

## 7. Hallazgos

| ID | Tipo | Hallazgo | Recomendación |
|---|---|---|---|
| **H1** | **Fallo (documentación)** | `cd frontend && npm install`, como dice el README, modifica `package-lock.json`: npm 11.6 agrega metadatos `"peer": true` (16 líneas). Los paquetes son los mismos, pero el clon queda con cambios sin commit y la revisión previa de `make all` se niega a correr (INS-03 falla; REV-02 lo confirma). | Cambiar en el README `npm install` por **`npm ci`**, que instala exactamente lo del lock sin modificarlo (INS-04, aprobado). Es una corrección de documentación permitida por el congelamiento. **Corregido el 04-11-2026 con aprobación del estudiante** (README y comentario de `environment.yml`). |
| H2 | Observación | `environment.yml` pide versiones mínimas: el entorno nuevo trajo 10 paquetes más recientes. Los resultados coinciden igual. | Mantener. Para reproducir también los bytes de los Parquet, guardar además las versiones exactas (`conda env export`). |
| H3 | Observación | 4 archivos difieren en bytes con los mismos valores (versión de pyarrow en los Parquet; 17.º dígito de algunos decimales). | Ninguna: no cambia ningún resultado. |
| H4 | Observación | Recién instalado, `make check` pasa con 23 pruebas y 35 omitidas (necesitan resultados); tras `make all` pasan las 58. | Indicar en el README que la batería completa requiere `make all` antes. |
| H5 | Observación | `npm` informa 10 vulnerabilidades conocidas (4 moderadas, 6 altas) en dependencias del frontend. | Revisar con `npm audit` cuáles afectan al dashboard; corregirlas sin `--force` sería mantenimiento permitido, con aprobación. |
| H6 | Observación (ya atendida) | En el servidor ya existe `bioinfo`; `conda env create -f environment.yml` fallaría por el nombre. | Ya mencionado en el README (`324deb3`). |

## 8. Aislamiento: lo que no se tocó

| Comprobación | Resultado |
|---|---|
| `~/proyecto/data/results/` (lo que muestra el dashboard) | 46 archivos idénticos (sha256) antes y después |
| `~/proyecto/data/cache/atlas/` | 18 archivos idénticos, también tras borrar el clon que la enlazaba |
| Entorno `bioinfo` | Misma lista de 391 paquetes |
| Limpieza | Clon y entorno temporal borrados; `conda env list`: solo `base` y `bioinfo` |

## 9. Limitaciones

- **La caché no se exportó desde MariaDB** (opción a): la prueba demuestra la instalación y el análisis desde la caché.
- **Mismo servidor.** No se probó otra máquina ni otro sistema operativo; las descargas de conda pudieron venir de la
  caché de paquetes del servidor (por eso el entorno se creó en 22 s).
- Los casos del dashboard comprueban que cada función responde y muestra los datos esperados; no evalúan diseño ni
  usabilidad con usuarios.
- `make mvp` no se repitió (probado en las pruebas de aceptación de la semana 12).

## 10. Contenido de esta carpeta

| Archivo o carpeta | Contenido | En git |
|---|---|---|
| `prueba_desde_cero.md` | Este registro | Sí |
| `casos_de_prueba_v1.xlsx` | 109 casos: Resumen, Casos de prueba, Comparación de resultados, Entorno, Hallazgos | No (servidor) |
| `registros/` | Salida de cada comando, huellas, resultados de los casos en JSON | No |
| `capturas/` | 21 capturas: las 10 vistas a 1440 y 900 px y el dashboard sin backend | No |
| `manifiestos_nuevos/` | Los 5 manifiestos generados en el clon | No |
| `scripts/` | Catálogo de casos y ejecutores (`casos.py`, `ejecutar_shell.py`, `ejecutar_api.py`, `ejecutar_ui.cjs`), comparación, valores de control y generador del Excel | No |

**Cómo repetirla:** clonar la etiqueta, crear el entorno con `-p`, `npm ci`, enlazar la caché, `make all`, y correr los
ejecutores de `scripts/` contra la API y el frontend del clon (los argumentos están en la cabecera de cada script).

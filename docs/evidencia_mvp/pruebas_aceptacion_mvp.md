# Pruebas de aceptación del MVP (`mvp-semana8`)

*Ejecutadas el 26-10-2026 (entre las 08:52 y las 08:58, hora de Chile, UTC−3) sobre la etiqueta `mvp-semana8`, con
asistencia de Claude Code y revisión del estudiante.* Todos los valores de este documento salen de comandos ejecutados ese
día; la salida de cada comando está guardada en [`evidencia_mvp/`](./). Lo que no se pudo comprobar se marca
como "no verificado".

> **Dónde está la evidencia.** En git solo se versiona este documento. Los registros, las capturas, los scripts y la
> versión en Excel (`pruebas_aceptacion_mvp.xlsx`) se conservan en el servidor, en `~/proyecto/docs/evidencia_mvp/`,
> y están excluidos en `.gitignore` por decisión del estudiante (26-10-2026). Los enlaces de este documento funcionan
> en esa copia local, pero no en GitHub.

## 1. Objetivo

Comprobar, sobre la entrega del MVP y desde un clon limpio, los seis criterios de aceptación:

| ID | Criterio |
|---|---|
| CA1 | Reproducibilidad: un solo comando documentado reconstruye redes, métricas, validación e informe |
| CA2 | Determinismo: dos ejecuciones producen las mismas salidas |
| CA3 | Trazabilidad: los resultados registran fuente, versión, fecha y parámetros |
| CA4 | Validación de E. coli K-12 (GCF_000005845.2) contra RegPrecise con los valores informados |
| CA5 | El Dashboard (API + frontend) muestra datos reales en sus cinco vistas |
| CA6 | Los valores de control (genomas, redes, aristas de E. coli) coinciden con el Dashboard |

Reglas de la prueba: no se modificó el código del MVP ni de `dev`, y una prueba fallida se registraría como fallida, con su
causa, sin corregirla.

## 2. Entorno

Evidencia: [`registros/00_fecha.txt`](registros/00_fecha.txt),
[`registros/01_entorno.txt`](registros/01_entorno.txt).

| Elemento | Valor |
|---|---|
| Fecha de ejecución | 2026-10-26T08:52:10-03:00 (inicio) |
| Repositorio | `git@github.com:Yerko-Moscoso/Proyecto_Bioinfo.git`, clonado de nuevo en un directorio temporal |
| Etiqueta | `mvp-semana8` (etiqueta anotada, "Entrega MVP: pipeline reproducible, dashboard e informe") |
| Commit de la etiqueta | `d056fc96b24a8608127096dacd15c7382c316c84` (24-09-2026 08:48, "MVP: resultados regenerados tras limpiar el historial") |
| Estado del clon antes de ejecutar | 0 archivos modificados |
| Servidor | `devastator`, Ubuntu 22.04.5 LTS, kernel 6.8.0-136-generic, 48 CPU, 251 GiB RAM |
| Python | 3.11.15 (entorno conda `bioinfo`) |
| Paquetes Python | pandas 3.0.5, networkx 3.6.1, numpy 2.4.6, sqlalchemy 2.0.52, fastapi 0.141.1, uvicorn 0.52.3, pydantic 2.13.4, starlette 1.3.1 |
| Node / npm | v22.16.0 / 11.4.2 |
| Frontend (`npm ci`, del `package-lock.json` de la etiqueta) | react 19.2.8, vite 8.2.2, axios 1.19.0, cytoscape 3.34.1, recharts 3.10.1, tailwindcss 4.3.3 |
| Navegador para las capturas | Google Chrome 151.0.7922.75 (sin interfaz), controlado con `playwright-core` 1.48.2 instalado fuera del clon |

Los directorios `~/proyecto` y `~/proyecto-mvp` no se usaron para ejecutar; solo se consultaron como referencia.

## 3. Procedimiento

1. Clonar el repositorio en un directorio temporal nuevo y hacer `git checkout mvp-semana8`.
2. Ejecutar el comando que indica el README de la etiqueta, `make mvp`, con el entorno `bioinfo`
   (`conda run -n bioinfo make mvp`), cronometrado con `/usr/bin/time -v`.
3. Hacer un segundo clon nuevo, ejecutar otra vez `make mvp` y comparar ambas salidas con sha256 y `diff`. Comparar
   además la primera salida con los archivos versionados en la etiqueta (`git diff`).
4. Revisar los campos de `cache_manifest.json`, de los cuatro `*.provenance.json` y de `report.md`, y recalcular cada
   sha256 registrado ([`scripts/ca3_trazabilidad.py`](scripts/ca3_trazabilidad.py)).
5. Extraer de `validation.tsv` la fila de E. coli K-12 y recalcular la precisión y el recall
   ([`scripts/ca4_validacion.py`](scripts/ca4_validacion.py)).
6. Levantar la API de la etiqueta (`uvicorn src.api.main:app`, puerto 8765) y el frontend (`npm ci` y `vite`, puerto 5199,
   con `VITE_API_URL` apuntando a esa API), consultar con `curl` los endpoints que usan las vistas y tomar capturas de las
   cinco vistas ([`scripts/ca5_capturas.cjs`](scripts/ca5_capturas.cjs)). Se usaron puertos distintos de
   8000 y 5173 para no interferir con otros servicios del servidor.
7. Comparar los valores de control del Dashboard con los archivos del pipeline
   ([`scripts/ca6_control.py`](scripts/ca6_control.py)).
8. Detener la API y el frontend.

## 4. Casos de prueba

### CA1: Reproducibilidad

| Campo | Contenido |
|---|---|
| ID | CA1 |
| Criterio | Un solo comando documentado reconstruye redes, métricas, validación e informe desde el clon limpio |
| Pasos | Clon nuevo, `git checkout mvp-semana8`, `conda run -n bioinfo --no-capture-output make mvp` |
| Resultado esperado | El comando termina sin error y regenera `transfer_map/`, `networks/`, `metrics/`, `validation/` y `report.md` en `data/results/mvp/` |
| Resultado obtenido | Código de salida 0. Duración: 19,27 s (tiempo real; 34,56 s de CPU de usuario; memoria máxima 677 MB). Se generaron 19 archivos, todos con fecha posterior al inicio de la corrida: `transfer_map.tsv` y su procedencia, las 8 redes `*.edges.tsv` y su procedencia, `genomes.json`, `topology.json`, `topology.tsv` y su procedencia, `validation.json`, `validation.tsv` y su procedencia, y `report.md`. Ningún archivo de resultados quedó sin regenerar. La segunda corrida (CA2) tardó 19,79 s |
| Estado | **Aprobado** |
| Evidencia | [`registros/02_ca1_make_mvp_run1.txt`](registros/02_ca1_make_mvp_run1.txt), [`registros/03_ca1_archivos_generados.txt`](registros/03_ca1_archivos_generados.txt) (lista con sha256 y tamaño) |

`make cache` no se ejecutó: requiere acceso a MariaDB y sobrescribiría la caché versionada en la etiqueta. El README de
la etiqueta indica que la caché ya está en el repositorio y que el comando único es `make mvp`. Por lo tanto, este caso
verifica la reproducción **desde la caché**, no la exportación desde la base.

### CA2: Determinismo

| Campo | Contenido |
|---|---|
| ID | CA2 |
| Criterio | Dos ejecuciones del pipeline producen las mismas salidas, salvo fechas |
| Pasos | `make mvp` en dos clones nuevos e independientes; comparación sha256 archivo por archivo y `diff` de los que difieren; `git diff` de la primera corrida contra la etiqueta |
| Resultado esperado | Redes, métricas, validación e informe idénticos; las diferencias, si las hay, solo en marcas de tiempo |
| Resultado obtenido | De 19 archivos, **15 son idénticos** (sha256): `transfer_map.tsv`, las 8 redes, `genomes.json`, `topology.json`, `topology.tsv`, `validation.json`, `validation.tsv` y `report.md`. **4 difieren solo en fechas**: los `*.provenance.json` de las cuatro etapas, únicamente en `started_utc` y `finished_utc` (líneas 7–8). Frente a los archivos versionados en la etiqueta, solo cambian los 4 `*.provenance.json` (commit, `dirty` y fechas) y la línea "Generado" de `report.md`; los sha256 de entradas y salidas registrados en la etiqueta no cambian |
| Estado | **Aprobado** |
| Evidencia | [`registros/04_ca2_make_mvp_run2.txt`](registros/04_ca2_make_mvp_run2.txt), [`registros/05_ca2_comparacion_run1_run2.txt`](registros/05_ca2_comparacion_run1_run2.txt), [`registros/06_ca2_diff_vs_etiqueta.txt`](registros/06_ca2_diff_vs_etiqueta.txt) |

`report.md` salió idéntico entre las dos corridas porque ambas cayeron en el mismo minuto (`11:53 UTC`) y el informe
registra la fecha con precisión de minutos. En corridas de minutos distintos, este archivo diferiría en la línea
"Generado", igual que frente a la versión de la etiqueta.

### CA3: Trazabilidad

| Campo | Contenido |
|---|---|
| ID | CA3 |
| Criterio | Los resultados registran fuente, versión, fecha y parámetros |
| Pasos | Lectura de `data/cache/mvp/cache_manifest.json`, de los 4 `*.provenance.json` y de `report.md`; recálculo de cada sha256 registrado; consulta en git de los commits registrados |
| Resultado esperado | Cada archivo de procedencia trae fuente, versión, fecha y parámetros, y los sha256 coinciden con los archivos |
| Resultado obtenido | Ver la tabla de campos más abajo. Se recalcularon **54 sha256** (8 del manifiesto y 46 de las procedencias): **0 discrepancias** |
| Estado | **Aprobado con observaciones** (los campos faltantes se listan abajo) |
| Evidencia | [`registros/07_ca3_trazabilidad.txt`](registros/07_ca3_trazabilidad.txt), [`registros/14_ca3_commits_procedencia.txt`](registros/14_ca3_commits_procedencia.txt) |

| Campo | Manifiesto de la caché | 4 `*.provenance.json` | `report.md` |
|---|---|---|---|
| Fuente (gold standard) | Sí: "RegPrecise 3.2 (curated_regulons)" | Sí (en `params`) | Sí |
| Fuente de los datos | Sí: MariaDB `regulon_atlas`, 8 consultas SQL, conteo de filas | No (remiten a la caché por sha256) | Sí: fecha y versión de MariaDB |
| Versión del servidor de base | Sí: 10.6.23-MariaDB-0ubuntu0.22.04.1 | No aplica | Sí |
| Versión del software (commit, `dirty`) | Sí: `9e0b73c`, `dirty: true` | Sí: `d056fc9`, `dirty: false` (al regenerar) | Sí: commit |
| Fecha (`started_utc`, `finished_utc`) | Sí: 2026-09-23 | Sí | Sí: "Generado" |
| Parámetros (`params`, `params_file`) | Sí: 14 claves de `config/mvp_params.json` | Sí: 14 claves | Sí: umbral, reglas, propagación |
| sha256 de entradas | No (lee de la base) | Sí: 5 a 11 por etapa | No |
| sha256 de salidas | Sí: 8 | Sí: 1 a 8 por etapa | No |
| Versión y fecha de descarga de PRODORIC | **Falta** | **Falta** | **Falta** |
| Fecha de descarga de RegPrecise | **Falta** | **Falta** | **Falta** |
| Versiones de Python y paquetes | **Falta** | **Falta** | **Falta** |

Observaciones:

1. **Commit de la caché no resoluble.** El manifiesto registra `9e0b73c006add897b22b100cc3b020fd30fa8499` con
   `dirty: true`. Ese commit no existe en el historial actual (`git cat-file` falla), probablemente por la limpieza del
   historial del 24-09-2026. Los sha256 de la caché sí coinciden con los archivos versionados.
2. **La procedencia versionada en la etiqueta apunta al commit padre.** Los `*.provenance.json` y `report.md` que trae la
   etiqueta registran `483070c` con `dirty: true`, no `d056fc9`: se generaron con cambios sin commit y luego se
   commitearon en `d056fc9`. Al regenerar desde el clon limpio quedan `d056fc9` y `dirty: false`.

### CA4: Validación con números concretos

| Campo | Contenido |
|---|---|
| ID | CA4 |
| Criterio | La validación de E. coli K-12 (GCF_000005845.2) contra RegPrecise entrega TP, FP, FN, precisión y recall, y coincide con los valores informados |
| Pasos | Lectura de `validation/validation.tsv` (variante `with_operons`, la de la red del MVP) y recálculo de precisión = TP/(TP+FP) y recall = TP/(TP+FN) |
| Resultado esperado | p ≤ 1e-5: precisión 6,6 %, recall 59,5 %. p ≤ 1e-7: precisión 37,97 %, recall 26,52 %, TP/FP/FN = 418/683/1.158 |
| Resultado obtenido | Ver tabla. Ambos umbrales **coinciden**. TP + FN = 1.576 = pares del gold standard en los dos umbrales |
| Estado | **Aprobado** |
| Evidencia | [`registros/08_ca4_validacion_ecoli.txt`](registros/08_ca4_validacion_ecoli.txt); también en `report.md` (sección 4) y en el endpoint `/metrics/validation/GCF_000005845.2` (CA5) |

| Umbral | TP | FP | FN | Precisión | Recall | F1 | Informado | ¿Coincide? |
|---|---|---|---|---|---|---|---|---|
| p ≤ 1e-5 | 937 | 13.209 | 639 | 6,6238 % | 59,4543 % | 11,92 % | 6,6 % / 59,5 % | Sí |
| p ≤ 1e-7 | 418 | 683 | 1.158 | 37,9655 % | 26,5228 % | 31,23 % | 37,97 % / 26,52 % (418/683/1.158) | Sí |

Umbrales intermedios (misma variante): 1e-5,5 → 805/5.233/771; 1e-6 → 612/2.440/964; 1e-6,5 → 505/1.208/1.071.
`report.md` muestra el umbral 1e-7 redondeado a un decimal (38,0 % y 26,5 %).

### CA5: Dashboard

| Campo | Contenido |
|---|---|
| ID | CA5 |
| Criterio | La API y el frontend de la etiqueta se levantan, los endpoints que usa el Dashboard responden con datos reales y las cinco vistas se muestran |
| Pasos | `uvicorn` y `vite` de la etiqueta; `curl` a cada endpoint usado por las vistas; Chrome sin interfaz recorre Dashboard → Organisms → Regulatory Networks → Metrics → Validation y guarda una captura, el texto de cada vista y las respuestas HTTP |
| Resultado esperado | HTTP 200 con datos del pipeline en todos los endpoints y vistas con datos, sin errores |
| Resultado obtenido | 7 endpoints con **HTTP 200** (tabla abajo). En el navegador, todas las llamadas a `/api/v1/` devolvieron 200 y no hubo errores de consola ni de página ni solicitudes fallidas. Las 5 vistas muestran datos (8 genomas, red de E. coli con 754 nodos y 800 de 14.453 aristas, métricas y curva de validación) |
| Estado | **Aprobado** |
| Evidencia | [`registros/10_ca5_endpoints.txt`](registros/10_ca5_endpoints.txt), [`registros/09_ca5_api_uvicorn.txt`](registros/09_ca5_api_uvicorn.txt), [`registros/11_ca5_npm_ci.txt`](registros/11_ca5_npm_ci.txt), [`registros/12_ca5_vite.txt`](registros/12_ca5_vite.txt), [`capturas/navegador.txt`](capturas/navegador.txt), capturas abajo |

| Endpoint (`/api/v1`) | Vista | HTTP | Extracto de la respuesta |
|---|---|---|---|
| `/health` | Cabecera | 200 | `{"status":"healthy","version":"1.0.0"}` |
| `/metrics/topology-summary?accessions=…` (8) | Dashboard, Metrics | 200 | E. coli: `"nodos":4013,"n_tfs":149,"aristas":14453,"hubs":127` |
| `/metrics/validation/GCF_000005845.2` | Dashboard, Validation | 200 | `"true_positives":937,"false_positives":13209,"false_negatives":639,"precision":0.066238,"recall":0.594543` |
| `/genomes/?accessions=…` (8) | Organisms, Regulatory Networks | 200 | `"total":8`; E. coli: `"n_genes":4506,"n_operons":2403,"predicted_edges":14453,"curated_interactions":1576` |
| `/graphs/GCF_000005845.2` | Regulatory Networks | 200 | `"shown_edges":800,"total_edges":14453`, nodos `tf:AbgR`, `tf:AcrR`… |
| `/metrics/topology/GCF_000005845.2` | Metrics | 200 | `"nodos":4013,"aristas":14453,"densidad":0.000898,"grado_medio":3.6015` |
| `/genomes/GCF_000005845.2` | Ficha del organismo | 200 | `"genome_size_mb":4.64,"n_tfs":149` |

| Vista | Captura | Texto de la vista |
|---|---|---|
| Dashboard | [`capturas/1_dashboard.png`](capturas/1_dashboard.png) | [`1_dashboard.txt`](capturas/1_dashboard.txt) |
| Organisms | [`capturas/2_organisms.png`](capturas/2_organisms.png) | [`2_organisms.txt`](capturas/2_organisms.txt) |
| Regulatory Networks | [`capturas/3_networks.png`](capturas/3_networks.png) | [`3_networks.txt`](capturas/3_networks.txt) |
| Metrics | [`capturas/4_metrics.png`](capturas/4_metrics.png) | [`4_metrics.txt`](capturas/4_metrics.txt) |
| Validation | [`capturas/5_validation.png`](capturas/5_validation.png) | [`5_validation.txt`](capturas/5_validation.txt) |

Observaciones:

1. El frontend se probó con el servidor de desarrollo (`vite`, equivalente a `npm run dev` del README), no con un build de
   producción, y la API en el puerto 8765 en lugar del 8000 del README.
2. Las vistas del MVP leen de `data/results/mvp/` y no consultan MariaDB. El listado de genomas sin `?accessions=` sí
   consulta la base, pero ninguna de las cinco vistas lo usa, así que no se probó.
3. La tarjeta del Dashboard dice "1 Validated organisms (E. coli K-12 vs RegPrecise)", mientras que la vista Validation
   ofrece E. coli y Salmonella LT2, ambas con estado `ok` en `validation.tsv`. No es un error de datos, pero el número
   puede leerse de forma distinta en las dos vistas.

### CA6: Valores de control

| Campo | Contenido |
|---|---|
| ID | CA6 |
| Criterio | Número de genomas (8), redes construidas y aristas de E. coli coinciden con lo que muestra el Dashboard |
| Pasos | Contar los genomas de `config/mvp_genomes.txt` y las filas de cada `networks/*.edges.tsv` (comprobando que no hay pares TF–gen repetidos) y compararlos con el texto de la vista Dashboard capturada en CA5 |
| Resultado esperado | 8 genomas y 8 redes; aristas de E. coli y total iguales en los archivos y en el Dashboard |
| Resultado obtenido | Ver tabla. Los cuatro valores **coinciden**. En las 8 redes, filas = pares únicos (TF, gen) |
| Estado | **Aprobado** |
| Evidencia | [`registros/13_ca6_valores_control.txt`](registros/13_ca6_valores_control.txt), [`capturas/1_dashboard.txt`](capturas/1_dashboard.txt), [`capturas/1_dashboard.png`](capturas/1_dashboard.png) |

| Control | Esperado | Archivos del pipeline | Dashboard | Estado |
|---|---|---|---|---|
| Genomas analizados | 8 | 8 | 8 | Coincide |
| Redes construidas | 8 | 8 | 8 / 8 | Coincide |
| Aristas de E. coli K-12 | — | 14.453 | 14.453 | Coincide |
| Aristas totales (8 genomas) | — | 95.562 | 95.562 | Coincide |

## 5. Resumen

| ID | Criterio | Estado |
|---|---|---|
| CA1 | Reproducibilidad (`make mvp`, 19,3 s) | Aprobado |
| CA2 | Determinismo (15 idénticos, 4 solo fechas) | Aprobado |
| CA3 | Trazabilidad | Aprobado con observaciones |
| CA4 | Validación de E. coli K-12 | Aprobado |
| CA5 | Dashboard | Aprobado |
| CA6 | Valores de control | Aprobado |

**6 casos: 6 aprobados (uno con observaciones), 0 fallidos, 0 no verificados.** Ningún valor obtenido difiere de los
valores informados para el MVP.

## 6. Limitaciones

- **`make cache` no se probó.** La reproducibilidad se verificó desde la caché versionada, no desde la base de datos.
- **La trazabilidad de las fuentes externas es incompleta.** No se registran la versión ni la fecha de descarga de
  PRODORIC, la fecha de descarga de RegPrecise ni las versiones de Python y paquetes. El commit que generó la caché
  (`9e0b73c`) ya no está en el historial.
- **Los resultados versionados en la etiqueta no son de un árbol limpio** (`483070c`, `dirty: true`). Los regenerados en
  esta prueba sí lo son (`d056fc9`, `dirty: false`), con salidas idénticas.
- **Determinismo probado en un solo servidor y un solo entorno** (mismas versiones de Python y paquetes). No se probó en
  otra máquina ni con otras versiones de pandas o networkx.
- **El Dashboard se probó en modo desarrollo** (`vite`), con Chrome 151 sin interfaz y en puertos distintos de los del
  README. No se probaron otros navegadores ni el build de producción.
- **Commit citado en el índice.** La bitácora de `docs/README.md` (entrada "23 al 28-09-2026") cita `b628e54` como la
  entrega `mvp-semana8`, pero la etiqueta apunta a `d056fc9`. `b628e54` es posterior (28-09-2026): regenera las
  procedencias y cambia `src/database/connection.py`. Estas pruebas corresponden a la **etiqueta** (`d056fc9`), no a
  `b628e54` ([`registros/14_ca3_commits_procedencia.txt`](registros/14_ca3_commits_procedencia.txt)).
- Los registros contienen las rutas absolutas del directorio temporal en el que se ejecutó la prueba; ese directorio no
  se conserva.

## 7. Cómo repetir la prueba

```bash
git clone git@github.com:Yerko-Moscoso/Proyecto_Bioinfo.git /tmp/ca_mvp && cd /tmp/ca_mvp
git checkout mvp-semana8
conda run -n bioinfo make mvp
python -I docs/evidencia_mvp/scripts/ca3_trazabilidad.py /tmp/ca_mvp        # desde dev; ruta del clon como argumento
python -I docs/evidencia_mvp/scripts/ca4_validacion.py /tmp/ca_mvp/data/results/mvp/validation/validation.tsv
```

`ca5_capturas.cjs` necesita la API y el frontend levantados (puertos 8765 y 5199) y `playwright-core` instalado aparte;
`ca6_control.py` recibe la ruta del clon y el texto de la vista Dashboard que guarda `ca5_capturas.cjs`.

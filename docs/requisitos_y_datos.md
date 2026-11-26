# Requisitos del sistema y paquete de datos (v1.0)

*Medido el 26-11-2026 sobre la rama `dev` (código de la etiqueta `v1.0`), en un clon limpio y con un entorno conda nuevo.
Lo que no se pudo medir dice **Por confirmar**.*

Este documento sirve para instalar y probar RegulonAtlas desde cero en otro computador **sin acceso a MariaDB**: qué equipo
hace falta, cuánto tarda cada etapa, qué trae el paquete de datos y cómo descargarlo, verificarlo y descomprimirlo.

## 1. Requisitos mínimos y recomendados

| | Mínimo (medido) | Recomendado |
|---|---|---|
| Sistema operativo | Linux x86_64 (probado en Ubuntu 22.04) | Ubuntu 22.04 o 24.04 |
| CPU | 4 núcleos (`make all`, las ampliaciones y `make check` pasan con 4; `make all` tarda ≈ 47 min) | 8 núcleos o más (`robustness-atlas` usa 24 procesos) |
| RAM | 4 GB libres (pico medido: 3,4 GB en `make check`; 3,2 GB en `make robustness-atlas`) | 8 GB |
| Disco | 3,5 GB libres (detalle en la sección 3) | 5 GB |
| Software | git, GNU make, bash, curl, conda (Miniforge) | Lo mismo; Miniforge con `conda` ≥ 24 |
| Red | Para instalar: ~210 MB de paquetes conda, ~57 MB de pip, ~70 MB de npm, 199 MB de Chromium y 157 MB del paquete de datos | — |
| Puertos libres | 8000 (API) y 5173 (frontend) para usar el dashboard; 18000 y 15173 para `make test-ui` y `make check` | — |

Versiones instaladas por `environment.yml` en el entorno nuevo (26-11-2026): Python 3.11.17, Node.js 25.2.1 (npm 11.6.2),
pandas 3.1.1, numpy 2.4.6, scipy 1.17.1, pyarrow 26.0.1, FastAPI 0.165.0, meme 5.5.9. Chromium de Playwright:
Chrome for Testing 159.0.8154.6 (`@playwright/test` 1.65.1, revisión `chromium-1255`). Las versiones exactas pueden
cambiar con el tiempo porque `environment.yml` fija mínimos y no versiones exactas (ver la sección 6).

## 2. Tiempos y memoria por etapa

Medido con `/usr/bin/time -v` (tiempo de pared y RSS del proceso más grande) y con un muestreo cada 0,5 s de la memoria
**PSS** sumada de todo el árbol de procesos (la RAM real: reparte las páginas compartidas entre los procesos hijos de
`robustness-atlas`). Servidor: AMD Threadripper 3960X, 24 núcleos / 48 hilos, 251 GB de RAM, disco NVMe. "4 núcleos" =
el mismo comando con `taskset -c 0-3`.

### 2.1 Análisis del atlas (`make all`, cada objetivo por separado)

| Etapa | Servidor (48 hilos): tiempo | RSS máx. | RAM total (PSS) | 4 núcleos: tiempo | RAM total (PSS) |
|---|---|---|---|---|---|
| `make atlas-ready` | 0,03 s | 11 MB | — | — | — |
| `make validate-atlas` | 6,9 s | 1,6 GB | 1,4 GB | 6,9 s | 1,5 GB |
| `make metrics-atlas` | 19,9 s | 1,1 GB | 1,1 GB | 20,0 s | 1,0 GB |
| `make comparison-atlas` | 3,3 s | 362 MB | 349 MB | 3,2 s | 248 MB |
| `make robustness-atlas` (24 procesos) | 7 min 35 s | 1,4 GB | 3,2 GB (27 procesos) | **45 min 53 s** | 3,0 GB (27 procesos) |
| `make baseline-atlas` | 21,5 s | 3,1 GB | 3,1 GB | 20,8 s | 3,0 GB |
| **Total `make all`** | **≈ 8 min 26 s** | | **pico 3,2 GB** | **≈ 46 min 44 s** | **pico 3,0 GB** |

`robustness-atlas` con `--workers 4` (llamando al script directamente; `make` no permite cambiarlo):
**38 min 49 s** y 1,4 GB de RAM total (5 procesos), frente a 45 min 53 s y 3,0 GB con los 24 procesos fijos. Los resultados son idénticos byte a byte con 24 procesos en el servidor, con 24 procesos en 4 núcleos y con 4 procesos.

### 2.2 Pruebas, MVP, API e instalación

| Etapa | Servidor: tiempo | RAM total (PSS) | 4 núcleos: tiempo | Resultado |
|---|---|---|---|---|
| `make test` sin `data/results/` (recién descomprimido) | 3,1 s | 241 MB | — | 110 aprobadas, 63 omitidas (necesitan resultados) |
| `make test` (con los resultados de `make all`) | 4,5 s | 665 MB | 4,3 s | 150 aprobadas, 23 omitidas (las de RegulonDB y ampliaciones) |
| `make test-ui` solo con `make all` | 46 s | 3,3 GB | 42 s | **2 de 8 fallan**: la API responde 503 en las rutas de las ampliaciones (ver sección 6) |
| `make check` solo con `make all` | 56 s | 3,4 GB | — | Falla por las mismas 2 pruebas de interfaz |
| `make mvp` | 17,3 s | 671 MB | 17,2 s | Informe generado; modifica 5 archivos versionados (ver sección 6) |
| `make regulondb` | 4,1 s | 23 MB | — | Descarga 2,6 MB de RegulonDB a `data/raw/regulondb/` (uso académico; no se versiona ni se redistribuye) |
| `make extensions` (después de `make mvp` y `make regulondb`) | 22,4 s | 1,4 GB | 22,2 s | — |
| `make test-ui` con las ampliaciones | 43 s | 3,4 GB | 41 s | 8 de 8 aprobadas |
| `make check` con las ampliaciones | 1 min 5 s | 3,4 GB | Por confirmar (no se midió entero; sus partes sí) | 173 pruebas de pytest y 8 de interfaz aprobadas |
| API en reposo (`uvicorn`, sin `--reload`) | arranca en 0,7 s | 156 MB | arranca en 0,7 s, 155 MB | — |
| API con el grafo más grande (red 4 `permissive`, `GCF_000012945.1`, `max_edges=5000`) | 0,35 s la 1.ª vez, 0,21–0,25 s después | 1,33 GB | 0,38 s / 0,21–0,25 s, 1,13 GB | 3.285 aristas (todas; no llega al tope de 5000), 729 KB de JSON |
| `conda env create -f environment.yml` | 17 s (paquetes ya descargados en el servidor) | 390 MB | — | Desde cero: **Por confirmar** (depende de la red; ~270 MB de descarga) |
| `npm ci` (caché de npm vacía) | 4,8 s | 354 MB | — | 70 MB descargados |
| `npm run build` | 1,0 s | 474 MB (RSS máx. 1,1 GB) | — | — |
| `npx playwright install chromium` | 29 s | 328 MB | — | 199 MB descargados |

La API guarda en memoria las aristas de la red que se consulta: después del primer grafo grande se queda en ~1,3 GB, y
con varias redes consultadas puede subir más (**Por confirmar**: no se midió la API con las 5 redes cargadas).

## 3. Disco

| Componente | Tamaño |
|---|---|
| Clon del repositorio (con `.git`, sin datos ni dependencias) | 41 MB de `.git`; ~85 MB en total |
| Entorno conda nuevo (`environment.yml`) | 1,2 GB |
| `frontend/node_modules` (`npm ci`) | 271 MB (+70 MB de caché de npm en `~/.npm`) |
| Chromium de Playwright (`~/.cache/ms-playwright`: chromium, headless shell y ffmpeg) | 700 MB |
| Paquete de datos comprimido (`regulonatlas_cache_v1.0.tar.gz`) | 157 MB (se puede borrar después de descomprimir) |
| Caché descomprimida (`data/cache/atlas/`) | 273 MB (285,3 MB con los 2 archivos de control) |
| Resultados (`data/results/`) | 22 MB con `make all`; 30 MB con `make mvp` y `make extensions` (+2,6 MB de `data/raw/regulondb/`) |
| **Total** | **≈ 2,7 GB** (≈ 3 GB con el paquete y las cachés de descarga) |

## 4. Paquete de datos

### 4.1 Qué contiene

`regulonatlas_cache_v1.0.tar.gz` contiene **solo `data/cache/atlas/`**: lo que necesitan `make atlas-ready`, `make all`,
`make check`, la API y el dashboard. Se descomprime en la raíz del repositorio. No incluye:

- `data/results/`: se regenera con `make all`. Para comparar, aparte va `regulonatlas_results_v1.0.sha256` con el sha256 de
  los 70 resultados actuales del servidor (sin los `.log`).
- `data/raw/` (RegulonDB, RegPrecise, PRODORIC en bruto): no lo usa `make all`; RegulonDB solo lo usan las ampliaciones
  (`make extensions`, que lo descarga con `make regulondb`). **No se redistribuye nada de RegulonDB.**
- `data/cache/mvp/`: ya está versionado en git (lo usa `make mvp`).

| Archivo | Filas | Tamaño |
|---|---|---|
| `genes_all.parquet` | 9.440.405 | 124,4 MB |
| `fimo_hits_validation.parquet` | 7.376.281 (312 genomas) | 58,9 MB |
| `edges_net4.parquet` (`permissive`) | 2.551.734 | 56,9 MB |
| `genes_validation.parquet` | 1.415.837 | 25,1 MB |
| `edges_net3.parquet` (`balanced`) | 383.903 | 10,0 MB |
| `edges_net5.parquet` (`no-footprint`) | 133.241 | 4,5 MB |
| `edges_net1.parquet` (`validated`) | 77.503 | 2,8 MB |
| `curated_regulons.parquet` (RegPrecise) | 103.044 | 1,0 MB |
| `transfer_map_validation.parquet` | 320.938 (312 genomas) | 0,8 MB |
| `network_metrics.parquet` | 6.427 | 0,3 MB |
| `edges_net2.parquet` (`high-precision`) | 5.711 | 0,3 MB |
| `genomes.parquet` | 2.644 | 0,2 MB |
| `motifs.parquet` | 2.141 (1.808 RegPrecise, 333 PRODORIC) | 61 KB |
| `regprecise_genome_map.parquet` | 488 | 28 KB |
| `validation_genomes.tsv` | 381 genomas validables | 6,5 KB |
| `networks.parquet` | 5 | 6,5 KB |
| `provenance.parquet` | 7 | 5,3 KB |
| `manifest.json` | — (filas y fechas de exportación) | 1 KB |
| `SHA256SUMS` | sha256 de los 19 archivos anteriores | 1,7 KB |
| `FUENTES_Y_LICENCIAS.txt` | Fuentes y condiciones (resumen de la sección 4.4) | 1 KB |

Tamaño: **156.668.547 bytes comprimido (157 MB)** y **285.310.680 bytes descomprimido (285 MB)**, 20 archivos. La caché se
exportó de MariaDB (solo SELECT) el 14, 15 y 19-10-2026; es la misma con la que se generaron los resultados de la v1.0.

### 4.2 Descargar, verificar y descomprimir

Los archivos van adjuntos al release `v1.0` de GitHub:

```bash
git clone https://github.com/Yerko-Moscoso/RegulonAtlas.git
cd RegulonAtlas
git checkout v1.0

B=https://github.com/Yerko-Moscoso/RegulonAtlas/releases/download/v1.0
curl -LO $B/regulonatlas_cache_v1.0.tar.gz
curl -LO $B/regulonatlas_results_v1.0.sha256
curl -LO $B/SHA256SUMS

sha256sum -c SHA256SUMS                         # 2 "La suma coincide" / "OK" (en macOS: shasum -a 256 -c SHA256SUMS)
tar xzf regulonatlas_cache_v1.0.tar.gz          # crea data/cache/atlas/ en la raíz del repositorio
(cd data/cache/atlas && sha256sum -c SHA256SUMS)  # 19 archivos OK
make atlas-ready                                # "Caché completa y árbol limpio"
```

Después, en este orden:

```bash
make all                       # ≈ 8,5 min en el servidor; ≈ 47 min con 4 núcleos
make mvp                       # MVP de 8 genomas (lo necesita make extensions)
make regulondb                 # descarga RegulonDB (2,6 MB, uso académico) para las ampliaciones
make extensions                # ampliaciones E1-E7: sin ellas make check falla en 2 pruebas de interfaz
make check                     # 173 pruebas de pytest y 8 de interfaz
git checkout -- data/results/mvp   # deja el árbol limpio otra vez (make mvp modifica 5 archivos versionados)
make api                       # http://localhost:8000/docs
make web                       # http://localhost:5173 (en otra terminal)
```

### 4.3 Comparar los resultados

```bash
sha256sum -c regulonatlas_results_v1.0.sha256 2>/dev/null | grep -E '^data/results/(validation/regprecise|metrics|comparison|robustness|baseline)/'
```

Resultado esperado de `make all` (verificado el 26-11-2026 en el clon limpio con el entorno nuevo):

- **16 de los 20 archivos de datos idénticos byte a byte.** Los 5 `manifest.json` cambian siempre (fecha y commit).
- `metrics/atlas_metrics.parquet` y `robustness/subsampling_genomes.parquet`: sha256 distinto, pero **contenido idéntico**
  (`DataFrame.equals` exacto). Solo cambia la versión de pyarrow que escribe el archivo (23.0.1 en el servidor, 26.0.1 en el
  entorno nuevo).
- `metrics/metrics_vs_external.tsv` (20 valores de `spearman`) y `baseline/vs_networks.tsv` (35 valores de precisión,
  sensibilidad y F1): diferencias en el último decimal, como máximo 9×10⁻¹⁷ en valor absoluto (6×10⁻¹⁵ relativo), por
  versiones más nuevas de numpy/pandas. No cambia ninguna conclusión.
- Ampliaciones: `comparison_adjusted/*.tsv` con diferencias de redondeo (≤ 2×10⁻¹⁴ absoluto); `mvp/report.md` solo cambia
  la fecha y el commit de la línea "Generado"; el resto, idéntico.
- Los resultados de `make extensions` y `make mvp` también están en el archivo, pero no los produce `make all`.

Para comparar valor por valor, el procedimiento de `docs/evidencia_reproducibilidad/prueba_reproducibilidad_atlas.md`.

### 4.4 Fuentes y licencias

Las tablas de la caché vienen de la base `regulon_atlas` del investigador, que integró estas fuentes (`provenance.parquet`):

| Fuente | Qué aporta a la caché | Condición de redistribución |
|---|---|---|
| GTDB R232 | Taxonomía de `genomes.parquet` | CC BY-SA 4.0 (página de licencias de GTDB): se puede redistribuir citando la fuente y con la misma licencia |
| NCBI RefSeq | Genomas, genes y locus (`genes_*.parquet`, accesiones) | Dominio público según la política de NCBI; NCBI advierte que algunos autores pueden reclamar derechos sobre sus datos |
| NCBI COG 2020 | Clasificación de reguladores | Dominio público (NCBI) |
| Rfam | Familias de ARN reguladores | CC0 |
| eggNOG v7 | Grupos de ortólogos (`tf_og`, mapa de transferencia) | **Por confirmar** (no se encontró una licencia explícita de los datos; el artículo es CC BY 4.0) |
| PRODORIC 2021.9 | 333 motivos de `motifs.parquet` | **Por confirmar** (no se encontró una licencia publicada) |
| RegPrecise 3.0 | 1.808 motivos, regulones curados (`curated_regulons.parquet`) y mapa de genomas | **Por confirmar** (sin licencia publicada; el sitio no indica condiciones de reuso) |
| RegulonDB | Nada: no está en el paquete | Uso académico; no se redistribuye |

Las predicciones (`edges_net*`, `network_metrics`, `fimo_hits_validation`) son trabajo del pipeline del investigador:
publicarlas requiere su autorización (**Por confirmar** con él antes de publicar el release). Mientras PRODORIC, RegPrecise
y eggNOG estén "Por confirmar", lo prudente es dejar el release como privado o en borrador, o compartir el paquete solo con
los probadores.

## 5. Compatibilidad

| Plataforma | Estado |
|---|---|
| Linux x86_64 (Ubuntu 22.04) | **Probado**: todo lo de este documento |
| Linux aarch64 | El entorno conda se resuelve (simulación `conda create --dry-run`, con meme 5.5.9). Ejecutarlo: **Por confirmar** |
| Windows con WSL2 (Ubuntu) | Debería comportarse como Linux, pero **Por confirmar** (no probado). Clonar dentro del sistema de archivos de WSL (`~/`), no en `/mnt/c`, por velocidad y permisos de ejecución |
| Windows sin WSL | **No soportado**: el Makefile y `scripts/*.sh` necesitan bash y GNU make, y `robustness-atlas` usa `multiprocessing` con `fork`, que Windows no tiene |
| macOS Intel (osx-64) y Apple Silicon (osx-arm64) | El entorno conda se resuelve en ambos para macOS 14 (simulación, con y sin meme). Ejecutarlo: **Por confirmar**. Puntos a revisar: `fork` en `robustness-atlas` (macOS lo permite, pero lo desaconseja con algunas bibliotecas), `sha256sum` (usar `shasum -a 256`) y que el bash de macOS es 3.2 |

**Qué requiere Linux o un sistema tipo Unix:** el Makefile (GNU make), `scripts/check_atlas_ready.sh`,
`scripts/check_commit.sh`, `scripts/check_ui.sh` y `scripts/githooks/pre-commit` (bash, `mktemp`, `grep -E`, `awk`);
`robustness-atlas` (`fork`). `taskset` solo se usó para medir; el proyecto no lo necesita.

**meme 5.5.9 (bioconda):** existe para linux-64, linux-aarch64, osx-64 y **osx-arm64** (consultado con `conda search` el
26-11-2026). **Ni `make all`, ni `make check`, ni `make mvp` lo usan**: ningún archivo de `src/` ni de `scripts/` llama a
FIMO; el MVP lee los hits de FIMO ya calculados de `data/cache/mvp/fimo_hits.tsv.gz`. Solo lo usa el código histórico
`legacy/pipeline_piloto/run_fimo.py`. Se comprobó ejecutando todas las mediciones con `fimo`, `meme`, `tomtom` y otros
programas de MEME reemplazados por versiones falsas que registran cada llamada: no hubo ninguna.

**Propuesta (no aplicada) para dejar meme como opcional:** sacar `meme=5.5.9` de `environment.yml` y dejarlo en un archivo
aparte, por ejemplo `environment-legacy.yml` con solo `meme=5.5.9`, que se agrega con
`conda env update -n <entorno> -f environment-legacy.yml` si alguien quiere correr `legacy/`. Antes de aplicarla hay que
repetir `make all` y `make check`: sin meme el resolvedor elige otras versiones (en la simulación, Node.js 26 en vez de 25
y Python 3.11.18 en vez de 3.11.17).

## 6. Limitaciones

- Medido en un solo servidor; "4 núcleos" son 4 hilos del mismo procesador (Threadripper 3960X), más rápido por núcleo que
  un portátil común. En un equipo común los tiempos pueden ser mayores (**Por confirmar**).
- `make robustness-atlas` siempre lanza 24 procesos: el número está como valor por defecto de `--workers` en
  `src/networks/atlas_robustness.py` y el Makefile no lo pasa. Con pocos núcleos funciona igual, pero más lento; el
  script acepta `--workers N` si se llama directamente.
- **`make check` necesita los resultados de las ampliaciones.** Con solo `make all`, 2 de las 8 pruebas de interfaz fallan
  ("las 10 vistas cargan sin errores" y "todas las vistas se traducen al español") porque la API responde 503 en
  `/atlas/extensions/*` y en la validación contra RegulonDB, y la prueba cuenta esas respuestas como errores. Se resuelve
  corriendo `make mvp`, `make regulondb` y `make extensions` antes (sección 4.2). No se cambió el código: es un hallazgo
  para el plan de pruebas.
- **`make mvp` deja el árbol con cambios:** reescribe 5 archivos versionados (`data/results/mvp/report.md` y los
  `*.provenance.json`, con fecha y commit nuevos). Después, `make atlas-ready` se detiene hasta hacer
  `git checkout -- data/results/mvp`.
- `environment.yml` fija versiones mínimas: un entorno creado más adelante puede traer versiones más nuevas y diferencias
  en el último decimal (sección 4.3).
- El tiempo de instalación desde cero (descarga de conda, pip, npm y Chromium) depende de la conexión: **Por confirmar**.
- No se probó macOS, WSL2 ni Linux aarch64 (sección 5).
- Las condiciones de redistribución de RegPrecise, PRODORIC, eggNOG y de las predicciones del investigador están
  **Por confirmar** (sección 4.4).

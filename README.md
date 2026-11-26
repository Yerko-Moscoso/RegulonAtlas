# RegulonAtlas

Dashboard, validación y métricas sobre redes de regulación transcripcional bacteriana (factor de transcripción →
operón) predichas en **2.224 genomas** (uno por género de GTDB R232, más 3 referencias). Proyecto de título de Ingeniería
Informática (Universidad de las Américas, NIDS).

Las cinco redes las generó un pipeline externo del investigador del proyecto y están en la base MariaDB `regulon_atlas`.
Este repositorio las audita, las valida contra RegPrecise, calcula métricas topológicas propias, compara los genomas
entre taxones, mide la robustez de las métricas y las muestra en un dashboard web.

**Documentación:** este README y [`docs/requisitos_y_datos.md`](docs/requisitos_y_datos.md) (requisitos medidos,
instalación sin base de datos y paquete de datos).

## Estructura

| Carpeta | Contenido |
|---|---|
| `src/atlas_common.py` | Definiciones comunes (redes, regla de genomas del atlas, lectura de la caché, trazabilidad) |
| `src/validation/atlas.py` | Validación de las 5 redes contra RegPrecise (semana 10) |
| `src/networks/atlas_*.py` | Métricas propias, comparación entre taxones, robustez y línea base (semanas 11–12) |
| `src/api/` | API FastAPI, solo de lectura (no consulta MariaDB) |
| `frontend/` | Dashboard: Vite + React + Tailwind + Recharts + Cytoscape.js |
| `scripts/` | Exportación de la caché desde MariaDB (`export_*`), exploraciones previas (`explore_*`) y verificaciones |
| `legacy/` | Código histórico que ya no se usa (ingesta y pipeline piloto); ver `legacy/README.md` |
| `tests/` | Pruebas unitarias y de humo de la API |
| `docs/` | Requisitos del sistema, instalación y paquete de datos (`requisitos_y_datos.md`) |

## Instalación

Requisitos (medidos; detalle en [`docs/requisitos_y_datos.md`](docs/requisitos_y_datos.md)): Linux x86_64 (o WSL2, por
confirmar), 4 núcleos, 4 GB de RAM libres, 3,5 GB de disco, git, GNU make, bash, curl y conda (Miniforge).

No hace falta acceso a MariaDB: la caché del atlas se descarga como archivo adjunto del release `v1.0`.

```bash
git clone https://github.com/Yerko-Moscoso/RegulonAtlas.git && cd RegulonAtlas
                                          # rama main: versión actual (la etiqueta v1.0 es la versión final del 26-11-2026)

conda env create -f environment.yml      # entorno "bioinfo"
conda activate bioinfo
cd frontend && npm ci && cd ..           # instala exactamente lo de package-lock.json, sin modificarlo
(cd frontend && npx playwright install chromium)  # navegador de las pruebas de interfaz de make check
make hooks                                # una vez por clon: verificación antes de cada commit

# Caché del atlas (157 MB; 285 MB descomprimida en data/cache/atlas/)
B=https://github.com/Yerko-Moscoso/RegulonAtlas/releases/download/v1.0
curl -LO $B/regulonatlas_cache_v1.0.tar.gz
curl -LO $B/regulonatlas_results_v1.0.sha256
curl -LO $B/SHA256SUMS
sha256sum -c SHA256SUMS                   # los 2 archivos deben coincidir
tar xzf regulonatlas_cache_v1.0.tar.gz    # crea data/cache/atlas/
(cd data/cache/atlas && sha256sum -c SHA256SUMS)
make atlas-ready                          # caché completa y árbol limpio
make all                                  # ~8,5 min con 24 núcleos; ~47 min con 4
make regulondb && make extensions         # make check también prueba las vistas de las ampliaciones
make check
```

`regulonatlas_results_v1.0.sha256` trae el sha256 de los resultados de la v1.0 para compararlos con los de `make all`
(diferencias esperadas en `docs/requisitos_y_datos.md`, sección 4.3). Solo quien tenga acceso a la base necesita
`cp .env.example .env` (credenciales de MariaDB) para regenerar la caché.

Si ya existe un entorno llamado `bioinfo` (por ejemplo, en el servidor `devastator`), `conda env create -f environment.yml`
fallará por el nombre repetido. En ese caso se crea con otro nombre (`conda env create -n <nombre> -f environment.yml`) o
en una carpeta (`-p <carpeta>`), y se activa ese.

## Uso

```bash
make help                 # lista de comandos
make api                  # backend en http://localhost:8000 (documentación en /docs)
make web                  # frontend en http://localhost:5173
make extensions           # ampliaciones (intervalos, comparación ajustada, precisión esperada, RegulonDB); fuera de make all; antes: make regulondb
make check                # antes de cada commit: API, frontend, ESLint, pytest e interfaz
make test-ui              # solo las pruebas de interfaz (Playwright, puertos 18000 y 15173)
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

Desde la ficha de Organisms se descarga un Excel con la información del genoma y sus 5 redes; desde Regulatory Networks, un Excel
con la red elegida. Ambos incluyen las imágenes del dashboard. El botón inferior del menú cambia el dashboard y el Excel entre
inglés y español; los datos e identificadores no se traducen.

## Resultados principales

| Tema | Resultado |
|---|---|
| Validación | `balanced` es la mejor red: F1 = 0,431 (0,318 sin autoevaluación) |
| Métricas propias | Las métricas de tamaño ordenan los taxones igual que la tabla externa (ρ ≥ 0,94) |
| Comparación entre taxones | El efecto del filo es en un 88 % metodológico (tamaño del genoma y origen de los motivos) |
| Robustez | Las métricas de tamaño resisten perder la mitad de las aristas; las de estructura no |
| Línea base | El pipeline externo es umbral + tier + footprinting; `no-footprint` se reproduce exactamente |

## Etiquetas

`semana09-auditoria`, `semana10-validacion`, `semana11-metricas`, `congelamiento-v1` (funciones congeladas al cierre de la
semana 13) y `v1.0` (versión final, 26-11-2026). `main`, `dev` y `v1.0` apuntan al mismo commit.

Respaldos (26-11-2026), por si hay que volver al estado anterior: rama `respaldo/main-semana11` y etiqueta
`respaldo-main-semana11` (el `main` anterior, hasta la semana 11), y etiquetas `respaldo-v1.0-original` y
`respaldo-v1.0-7371404` (posiciones anteriores de la `v1.0`). Quien haya descargado una `v1.0` anterior la actualiza con
`git fetch --tags --force`.

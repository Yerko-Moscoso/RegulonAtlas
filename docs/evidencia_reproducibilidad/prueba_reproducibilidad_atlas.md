# Prueba de reproducibilidad del análisis del atlas (`make all`)

*Ejecutada el 29-10-2026 (09:19 a 09:28, hora de Chile, UTC−3) con asistencia de Claude Code, a pedido y con aprobación
del estudiante.* Todos los valores salen de comandos ejecutados ese día. La evidencia (registros, huellas, comparación
completa, manifiestos nuevos y scripts) está en esta carpeta y queda **solo en el servidor** (`.gitignore`); en git se
versiona únicamente este registro.

## 1. Objetivo

Comprobar que `make all`, ejecutado desde un clon limpio del repositorio, reproduce los resultados que hoy muestra el
dashboard, **sin modificar esos resultados ni la caché**.

## 2. Resultado

**Aprobada.** Los 20 archivos de datos de los cinco análisis salieron **idénticos byte a byte** (mismo sha256) y los
cinco manifiestos coinciden en todo salvo la fecha y el commit, como se esperaba. Los 5 valores de control y las
58 pruebas automáticas pasan sobre los resultados nuevos. Los resultados y la caché del proyecto quedaron idénticos
(verificado con sha256 antes, después y tras borrar el clon). La revisión previa de `make all` se detuvo cuando debía.

## 3. Entorno

| Elemento | Valor |
|---|---|
| Código | Rama `dev`, commit `7521118`, clonada desde `git@github.com:Yerko-Moscoso/Proyecto_Bioinfo.git` en un directorio temporal; 0 cambios en el clon |
| Caché | `~/proyecto/data/cache/atlas` (18 archivos, 273 MB), enlazada en el clon y solo leída. No se usó MariaDB |
| Servidor | `devastator`, 48 CPU |
| Python y paquetes (conda `bioinfo`) | Python 3.11.15, pandas 3.0.5, numpy 2.4.6, networkx 3.6.1, pyarrow 23.0.1, scipy 1.17.1 |

Evidencia: `registros/00_inicio.txt`, `registros/03_entorno.txt`, `registros/04_clon_y_revision_sin_cache.txt`.

## 4. Procedimiento

1. **Huellas de lo actual:** sha256 de los 46 archivos de `~/proyecto/data/results/` y de los 18 de la caché, y estado
   de las 8 etapas del pipeline (`src/atlas_status.py`, el mismo que usa `/atlas/status`). → `registros/01_antes.*`,
   `registros/02_status_antes.json`.
2. **Clon limpio** de la rama `dev` desde GitHub en un directorio temporal.
3. **Revisión previa** (`make atlas-ready`, nueva en `7521118`) en el clon: sin caché, con un cambio sin commit y con todo
   listo. → `registros/04_*`, `registros/05_*`.
4. **Caché enlazada** (`data/cache/atlas` → la del proyecto). Las rutas de salida son relativas, así que los resultados
   se escriben en el clon.
5. **`make all`** en el clon, en segundo plano, con hora por línea y `/usr/bin/time -v`. → `registros/06_make_all.log`.
6. **Comprobación de que no se tocó nada:** huellas y estado del pipeline otra vez. → `registros/07_*`,
   `registros/08_sin_cambios.txt`, `registros/09_status_despues.json`.
7. **Comparación** archivo por archivo con `scripts/comparar_resultados.py` (reglas en la sección 6).
   → `registros/10_comparacion.*`, `registros/11_manifiestos_cache.txt`.
8. **Valores de control y pruebas** sobre los resultados nuevos: `scripts/valores_control.py` y `pytest` en el clon.
   → `registros/12_control_y_pruebas.txt`.
9. **Limpieza:** se guardaron los manifiestos nuevos y las huellas de los resultados nuevos (`manifiestos_nuevos/`,
   `registros/13_nuevos.results.sha256`), se borró el clon y se verificó de nuevo la caché y los resultados.

## 5. Revisión previa de `make all`

| Caso | Esperado | Obtenido |
|---|---|---|
| Clon sin caché | Se detiene y nombra lo que falta por regla | Se detuvo en el primer segundo: indicó los 14 archivos de `make cache-atlas`, 1 de `make cache-genes` y 3 de `make cache-fimo` |
| Caché enlazada y un cambio sin commit (`Makefile`) | Se detiene | Se detuvo y nombró `Makefile` |
| Caché enlazada y árbol limpio | Continúa | "Caché completa y árbol limpio (7521118)" |

## 6. Comparación de resultados

Reglas: (1) mismo sha256 → idéntico; (2) tablas distintas en bytes → valor por valor (textos iguales, números con
diferencia ≤ 1e-9); (3) `manifest.json` → iguales salvo `created_at` y los commits (`git_commit`, `metrics_manifest`),
con `git_dirty: false` en el nuevo. Se excluyen dos registros `*.log` de ejecuciones manuales, que no son resultados.

| Análisis | Archivos de datos | Resultado | Manifiesto |
|---|---|---|---|
| Validación (`validation/regprecise`) | `by_genome`, `by_origin`, `by_tier`, `locus_mapping`, `pr_curve`, `summary` (.tsv) | 6 idénticos | Igual salvo fecha/commit y la nota de abajo |
| Métricas (`metrics`) | `atlas_metrics.parquet`, `atlas_metrics.tsv`, `metrics_vs_external.tsv` | 3 idénticos | Igual salvo fecha/commit y la nota de abajo |
| Comparación (`comparison`) | `by_taxon.tsv`, `taxon_tests.tsv` | 2 idénticos | Igual salvo fecha y commits (`3ce0f17` → `7521118`) |
| Robustez (`robustness`) | `footprint_effect`, `nesting`, `rank_between_networks`, `subsampling_summary` (.tsv), `subsampling_genomes.parquet` | 5 idénticos | Igual salvo fecha y commits (`38222a8` → `7521118`) |
| Línea base (`baseline`) | `reproduction`, `reproduction_edges`, `summary`, `vs_networks` (.tsv) | 4 idénticos | Igual salvo fecha y commit (`251811b` → `7521118`) |
| **Total** | **20** | **20 idénticos byte a byte** | **5 sin diferencias de contenido** |

**Nota sobre los manifiestos de validación y métricas.** Guardan una copia del manifiesto de la caché. La copia nueva
nombra además las tablas `fimo_hits_validation` y `transfer_map_validation`, que se exportaron el 19-10-2026 a las
12:46 UTC, **después** de generar los resultados originales (validación: 19-10 12:05; métricas: 15-10). El resto de la
copia es idéntico y esas dos tablas no las usan ni la validación ni las métricas. No es una diferencia de resultados.

Valores de control (resultados nuevos):

| Control | Esperado | Obtenido |
|---|---|---|
| Validación balanced, `all` / `genome_tf`: P / R / F1 | 0,612 / 0,332 / 0,431 | 0,612 / 0,332 / 0,431 |
| E. coli K-12 en balanced: TF / operones / pares | 118 / 342 / 485 | 118 / 342 / 485 |
| Genomas del atlas con métricas, por red | 2.224 | 2.224 en las 5 redes |
| Taxones con ≥ 5 genomas (balanced): filos / clases / órdenes / familias | 10 / 13 / 48 / 83 | 10 / 13 / 48 / 83 |
| Línea base: `no-footprint` reproducida exactamente | 29.807 aristas, exacta | 29.807, exacta |

Pruebas automáticas en el clon, sobre los resultados nuevos: **58 de 58 pasan**.

## 7. Tiempos

| Etapa | Duración |
|---|---|
| Revisión previa | < 1 s |
| Validación | 8 s |
| Métricas | 21 s |
| Comparación | 3 s |
| Robustez (24 procesos) | 7 min 19 s |
| Línea base | 26 s |
| **Total `make all`** | **8 min 17 s** (memoria máxima 3,3 GB) |

La robustez emite 4 avisos `ConstantInputWarning` de scipy (métricas sin variación en alguna combinación). Son los
mismos 4 de la corrida original de la semana 12 (`logs/robustness_atlas_semana12.log`).

## 8. Lo que no se tocó

- `~/proyecto/data/results/`: 46 archivos idénticos (sha256) antes, después y tras borrar el clon.
- `~/proyecto/data/cache/atlas/`: 18 archivos idénticos en los mismos tres momentos.
- Estado del pipeline (`/atlas/status`): 8 de 8 etapas en `ok`, con los mismos commits y fechas. El dashboard sigue
  mostrando exactamente los mismos resultados.

## 9. Limitaciones

- **No se probó la exportación desde MariaDB** (`make cache-atlas`, `cache-genes`, `cache-fimo`): se reutilizó la
  caché. La prueba demuestra que el análisis se reproduce **desde la caché**.
- **Mismo servidor y mismo entorno conda.** No se probó crear el entorno desde cero (`conda env create`) ni otra
  máquina u otras versiones de los paquetes; eso queda para la prueba de la semana 14.
- La robustez usa números aleatorios con semilla fija (`SEED = 12`, por red y genoma); la igualdad exacta confirma que
  esa semilla hace el resultado determinista en este entorno.

## 10. Cómo repetirla

```bash
git clone --branch dev git@github.com:Yerko-Moscoso/Proyecto_Bioinfo.git <tmp>/clon && cd <tmp>/clon
ln -s ~/proyecto/data/cache/atlas data/cache/atlas
nohup conda run -n bioinfo make all > make_all.log 2>&1 &
python -I ~/proyecto/docs/evidencia_reproducibilidad/scripts/comparar_resultados.py ~/proyecto <tmp>/clon salida.json
python -I ~/proyecto/docs/evidencia_reproducibilidad/scripts/valores_control.py <tmp>/clon
```

Los scripts están en `scripts/` (solo en el servidor).

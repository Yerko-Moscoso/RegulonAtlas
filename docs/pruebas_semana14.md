# Ampliación de las pruebas automáticas de RegulonAtlas v1.0 (semana 14)

*Ejecutada el 09-11-2026 con asistencia de Claude Code, según la propuesta aprobada por el estudiante ese día (bloques
A, B y C, con la condición de no afectar nada de lo que ya existía).* Todos los valores salen de comandos ejecutados ese
día. Las pruebas viven en `tests/` y se versionan; no hay evidencia aparte, porque el registro de cada ejecución es la
salida de `make check`.

## 1. Resultado

**Aprobada, con un hallazgo menor (H2) ya corregido.** Se agregaron **65 pruebas** en 3 archivos nuevos. La suite pasa
de **58 a 123 pruebas**. Al principio quedaron 121 aprobadas y 2 marcadas como *falla esperada* (`xfail`) por el
hallazgo H2; el estudiante aprobó corregirlo el mismo día y ahora pasan **123 de 123**. `make check` pasa.

| | Antes (`6b2867c`) | Después (`fb11872`) |
|---|---|---|
| Pruebas en el proyecto | 58 aprobadas | 123 aprobadas (121 + 2 fallas esperadas hasta la corrección de H2, `71771e2`) |
| Pruebas que corren en un clon sin `data/` | 23 (35 se omiten) | **88** (las mismas 35 se omiten) |
| Funciones de cálculo con prueba propia | normalización, métricas, submuestreo, `safe_div`, `f1` | además: toda la cadena de la validación, la línea base, la comparación y la robustez |
| Comportamiento de la API sin datos | revisado a mano (semana 13) | 32 endpoints comprobados en cada `make check` |

**Nada de lo existente cambió:** las pruebas no modificaron ningún archivo de `src/`, del frontend ni de las pruebas anteriores;
las 58 pruebas anteriores siguen pasando, y los 75 archivos de `data/results/` y `data/cache/` quedaron idénticos
(sha256 antes y después).

**Hallazgo H2:** sin la caché, `/atlas/networks` y `/atlas/provenance` respondían 500 (error interno) en lugar de 503
con la instrucción `make cache-atlas`. Corregido con aprobación del estudiante en `71771e2`, el único cambio en `src/`
(sección 7).

## 2. Objetivo y alcance

**Objetivo:** que las funciones que producen las cifras de la tesis (TP, FP, precisión, recall, F1, ε², ρ) tengan
pruebas propias con resultado calculado a mano, y no solo pruebas sobre los resultados finales; y que el
comportamiento de la API sin datos quede comprobado en cada commit.

| Incluido | No incluido |
|---|---|
| A. Validación contra RegPrecise: `collapse`, `evaluable`, `summarize`, `pr_curve`, `by_genome`, `build_gold_regprecise` | Pruebas del frontend (requieren una dependencia nueva, Vitest; las vistas se revisaron a mano en las semanas 13 y 14) |
| B. Línea base (`collapse`, `variant_hits`, `CEILINGS`, `compare_edges`), comparación (`kruskal`, `epsilon_sq`, `spearman`, `agreement`) y robustez (`nesting`, `robustness_class`, `subsample`) | Medición de cobertura (`pytest-cov` no está en `environment.yml`) |
| C. Los 25 endpoints que leen `data/results/` y los 7 que leen la caché, sin datos | Funciones que solo leen archivos o escriben resultados (`main`, `load_*`): ya se prueban con los resultados reales en `tests/test_api_*.py` |
| | Corregir lo que encontraran las pruebas (regla acordada: se informa y decide el estudiante) |

## 3. Entorno

| Elemento | Valor |
|---|---|
| Código | Rama `dev`, desde `6b2867c` (equivalente a `congelamiento-v1` más correcciones de documentación) |
| Entorno | `bioinfo`: Python 3.11.15, pandas 3.0.5, numpy 2.4.6, scipy 1.17.1, FastAPI 0.141.1, Starlette 1.3.1, pytest 9.1.1 |
| Servidor | `devastator`, Ubuntu 22.04 |

## 4. Cómo se evitó afectar lo existente

1. **Solo archivos nuevos en `tests/`.** Ningún cambio en `src/`, el frontend, el `Makefile` ni las pruebas anteriores.
2. **Datos inventados en memoria.** Los bloques A y B no leen `data/`. Donde una función lee la caché
   (`build_gold_regprecise`), se reemplaza `load` por una función falsa con `monkeypatch`, que pytest deshace al
   terminar la prueba.
3. **Carpeta vacía temporal para el bloque C.** Cada router se apunta a `tmp_path` (vacía) con `monkeypatch`. Tres
   routers guardan la caché en memoria (`lru_cache`): se vacía antes y después de cada prueba, para que las pruebas
   siguientes vuelvan a leer los datos reales.
4. **Comprobaciones del aislamiento:**
   - sha256 de los 75 archivos de `data/results/` y `data/cache/` antes y después: idénticos;
   - el bloque C corrido *antes* de las pruebas con datos reales (`test_api_atlas_metrics`, `_validation`, `_status`):
     todas pasan;
   - una prueba temporal (fuera del repositorio) corrida justo después del bloque C, en el mismo proceso: `/genomes/`,
     `/motifs/`, `/atlas/networks`, `/atlas/networks/3/genomes` y `/atlas/metrics/summary` responden 200 con los
     datos reales;
   - clon limpio del repositorio, sin `data/`: 86 aprobadas, 35 omitidas, 2 fallas esperadas, 0 fallidas. Clon borrado.
     Después de corregir H2: 88 aprobadas y 35 omitidas.
5. **Un commit por bloque**, cada uno después de `make check` (y del hook pre-commit), con push a `origin/dev`.

## 5. Pruebas agregadas

### 5.1 Bloque A: validación contra RegPrecise (`tests/test_unit_validation.py`, 12 pruebas)

Caso de juguete común (red 3 = balanced). Gold standard: g1 lexa→op10, g1 lexa→op11, g1 fur→op20, g2 crp→op30,
g4 lexa→op50 (5 pares). Predicciones: g1 lexa→op10 (0,90, TP), g1 lexa→op12 (0,80, FP), g1 arca→op40 (0,70; arca no
tiene regulón en g1), g1 fur→op20 (0,40, TP), g2 crp→op31 (0,60, FP), g3 lexa→op10 (0,95; g3 no tiene gold standard).

| Prueba | Qué comprueba | Esperado (a mano) |
|---|---|---|
| `test_collapse_keeps_most_confident_edge_per_pair` | Un par por (genoma, TF, operón), el de mayor `confidence` (D10) | 3 aristas → 2 pares; se conserva la de 0,8 |
| `test_collapse_tie_keeps_first_row` | Con empate se conserva la primera fila (orden estable) | Resultado reproducible |
| `test_evaluable_genome_tf_keeps_only_tfs_with_curated_regulon` | Universo `genome_tf`: fuera los TF sin regulón y los genomas sin gold | 4 evaluables, 2 en el gold |
| `test_evaluable_genome_keeps_every_pair_of_validable_genomes` | Universo `genome`: todos los pares de genomas validables | 5 evaluables (arca entra) |
| `test_summarize_genome_tf_counts_by_hand` | TP, FP, FN, P, R, F1, pares no evaluables, medianas por genoma | TP 2, FP 2, FN 3; P 0,5; R 0,4; F1 0,444 |
| `test_summarize_genome_universe_counts_by_hand` | Lo mismo en el universo `genome`; el recall no cambia | TP 2, FP 3; P 0,4; R 0,4 |
| `test_safe_div_and_f1_without_predictions` | Sin pares evaluables, precisión y F1 vacías (NaN), no 0 | NaN |
| `test_pr_curve_at_zero_matches_summarize` | La curva con umbral 0 es igual al resumen | TP 2, FP 2, 4 evaluables, 6 pares |
| `test_pr_curve_threshold_is_inclusive_and_counts_by_hand` | `confidence ≥ t` incluye el borde; conteos a 0,5 y 0,9 | 0,5: 3 evaluables, 1 TP; 0,9: 1 y 1 |
| `test_pr_curve_is_monotone` | 101 puntos; pares, TP y recall nunca suben al subir el umbral; TP + FP = evaluables | Monótona |
| `test_by_genome_includes_genomes_without_predictions` | Un genoma con gold y sin predicciones aparece con TP 0 y FN = n_gold | g4: FN 1, recall 0, precisión NaN |
| `test_build_gold_regprecise_maps_locus_and_counts_rows` | Proyección del gold standard: `locus_tag`, `old_locus_tag`, prefijo `gene-`, duplicados, filas sin genoma o sin locus, pertenencia regulog→genoma y tasa de mapeo | 3 pares; 1 sin genoma, 3 por `locus_tag`, 1 por `old_locus_tag`, 1 sin locus; tasa 0,75 y 1,0 |

### 5.2 Bloque B: línea base, comparación y robustez (`tests/test_unit_baseline_comparison.py`, 19 pruebas)

| Prueba | Qué comprueba | Esperado |
|---|---|---|
| `test_baseline_collapse_keeps_best_p_value` | Un par por (genoma, TF, operón) con el mejor −log10 p | Se conserva 7,9 |
| `test_variant_hits_respects_tier_ceiling` | `scan` sin filtro; `order_ceiling` hasta `same_order`; `class_ceiling` hasta `same_class` | 5, 2 y 4 hits |
| `test_ceilings_follow_tier_order` | Los techos son prefijos de `TIERS` y están anidados | `order` ⊂ `class` ⊂ `TIERS` |
| `test_compare_edges_exact_and_not_exact` | Reproducción exacta solo con las mismas aristas, sin importar el orden | (3, 3, 3, True); una de más o de menos → False |
| `test_epsilon_sq_matches_scipy_kruskal` | H y p iguales a scipy; ε² = (H − k + 1)/(n − k) | ε² = 0,872 en el caso de prueba |
| `test_kruskal_undefined_cases_return_nan` | Un solo grupo, valores constantes o n ≤ k → NaN | NaN |
| `test_kruskal_ignores_missing_values` | Los NaN no cuentan como observaciones | n = 4 en vez de 6 |
| `test_spearman_undefined_cases_return_nan` | Menos de 3 datos o una serie constante → NaN; relación perfecta → 1 | NaN, NaN, 1 |
| `test_agreement_thresholds` (6 casos) | Concordancia: alta ≥ 0,85, moderada ≥ 0,60, baja; NaN indefinida; `density` con otra definición | Bordes incluidos |
| `test_nesting_share_between_networks` | Fracción de pares de una red contenida en otra | validated ⊂ balanced: 1,0; al revés: 0,5 |
| `test_robustness_class_borders` (3 casos) | Robusta ≥ 0,90, moderada ≥ 0,70 | Bordes incluidos |
| `test_subsample_extreme_rates` | Eliminar 0 %, 100 % y casi todo | 5, 0 y 0 aristas |

### 5.3 Bloque C: la API sin resultados ni caché (`tests/test_api_sin_resultados.py`, 34 pruebas)

| Prueba | Qué comprueba | Resultado |
|---|---|---|
| `test_results_endpoint_without_results_is_503` (25 casos) | Cada endpoint de validación (7), métricas (5), comparación (3), robustez (6) y línea base (4) responde 503 y nombra su regla de `make` | 25/25 |
| `test_cache_endpoint_without_cache_is_503` (7 casos) | `/atlas/networks`, `/atlas/provenance`, `/atlas/networks/3/genomes`, `/atlas/networks/3/metrics`, `/atlas/networks/3/graph/…`, `/genomes/` y `/motifs/` responden 503 con `make cache-atlas` | 7/7 (los 2 primeros, desde la corrección de H2; antes eran una prueba aparte con `xfail`) |
| `test_health_and_status_work_without_data` | `/health` y `/atlas/status`, que el dashboard usa para avisar qué falta, responden sin datos | 200 |
| `test_every_results_endpoint_is_listed` | Las rutas de resultados de la API coinciden con la lista de la prueba: un endpoint nuevo obliga a agregarlo | Coinciden (24 rutas) |

## 6. Correcciones hechas a las pruebas durante la ejecución

Dos pruebas fallaron la primera vez por errores en la prueba, no en el sistema. Se corrigieron antes del commit:

- **ε² con grupos sin solapamiento:** la prueba suponía que valía 1. Con la fórmula del proyecto, (H − k + 1)/(n − k),
  el máximo para 3 grupos de 4 es 0,872. Se quitó esa línea y se mantuvo la comparación con scipy.
- **Lista de rutas de la API:** en esta versión de FastAPI, `app.routes` agrupa los routers; la prueba lee las rutas
  del esquema OpenAPI (`app.openapi()`).

## 7. Hallazgos

La numeración sigue la de la prueba desde cero (H1, `evidencia_instalacion/prueba_desde_cero.md`).

| ID | Tipo | Descripción | Estado |
|---|---|---|---|
| H2 | Error menor | Sin `data/cache/atlas/`, `GET /api/v1/atlas/networks` y `GET /api/v1/atlas/provenance` leían `manifest.json` sin comprobar si existe y respondían **500** sin mensaje, en vez de **503** con `make cache-atlas` como los otros 30 endpoints. Solo ocurría si faltaba la caché (no en el uso normal ni en la revisión de la semana 13, que retiró los resultados pero no la caché). El dashboard mostraba entonces su texto genérico (*"Check that the backend is running"*), engañoso porque la API sí estaba corriendo. | **Corregido el 09-11-2026** (`71771e2`), con aprobación del estudiante |

### 7.1 Corrección de H2

Corrección de error, permitida por el congelamiento (`congelamiento_v1.md`, sección 4, regla 1); no es una función
nueva ni cambia ningún dato.

- **Cambio:** función nueva `_manifest()` en `src/api/routers/atlas.py`. Lee `manifest.json` y, si falta, responde 503
  con `Missing manifest.json; run 'make cache-atlas'.`, igual que `_tabla()`. Los dos endpoints la usan en lugar de
  leer el archivo directamente.
- **Pruebas:** se quitó la marca `xfail`; los dos endpoints pasan a la lista `CACHE_ENDPOINTS` del bloque C, que
  además comprueba el mensaje. Resultado: 123 de 123.
- **Verificación:** con la caché presente, las respuestas de `/atlas/networks` y `/atlas/provenance` son idénticas
  byte a byte a las de antes del cambio; los 75 archivos de `data/results/` y `data/cache/` quedaron idénticos (sha256);
  `make check` pasa. No hay que recalcular ningún resultado.
- **Cómo revertirla:** `git revert 71771e2` (vuelve el 500 y la prueba con `xfail`).

## 8. Limitaciones

- Las pruebas unitarias usan casos pequeños: comprueban la lógica (qué se cuenta y cómo), no el volumen real. Las
  cifras reales siguen protegidas por los valores de control de `tests/test_api_*.py`, que necesitan `data/results/`.
- No se mide la cobertura del código ni se prueba el frontend (sección 2).
- `build_gold_regprecise` se prueba con la función de lectura reemplazada; la lectura real de la caché se prueba
  solo en las pruebas con datos.

## 9. Commits

| Commit | Contenido |
|---|---|
| `9586f67` | Bloque A: `tests/test_unit_validation.py` (12 pruebas) |
| `6a77bfa` | Bloque B: `tests/test_unit_baseline_comparison.py` (19 pruebas) |
| `fb11872` | Bloque C: `tests/test_api_sin_resultados.py` (34 pruebas, 2 con falla esperada) |
| `8b819a1` | Este documento, índice y bitácora en `docs/README.md` y contexto |
| `71771e2` | Corrección de H2 en `src/api/routers/atlas.py`; se quita el `xfail` |

## 10. Cómo repetirla

```bash
cd ~/proyecto && conda activate bioinfo
make check                                   # todas: 123 aprobadas
make test                                    # solo pytest, muestra las omitidas
PYTHONPATH=. pytest -q tests/test_unit_validation.py tests/test_unit_baseline_comparison.py tests/test_api_sin_resultados.py
```

En un clon sin `data/` se espera: 88 aprobadas y 35 omitidas.

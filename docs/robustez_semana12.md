# Robustez de las métricas propias (semana 12)

*19 de octubre de 2026. Primera parte de la semana 12: robustez de las métricas. La línea base del pipeline propio desde
`fimo_hits` (segunda parte) queda pendiente de aprobación (sección 8).*

## 1. Objetivo

Saber **cuánto se puede confiar en las métricas propias** de la semana 11 frente a dos fuentes de incertidumbre:

1. **La elección de la red.** Las cinco redes son filtros distintos del mismo escaneo. ¿Cambian los valores y el orden de los
   genomas al pasar de una a otra?
2. **Una red incompleta.** Toda red predicha pierde interacciones reales (en la semana 10, el recall de `balanced` fue
   0,33). Si faltaran aristas, ¿las métricas seguirían ordenando a los genomas igual?

## 2. Dos análisis complementarios

| Análisis | Pregunta | Origen |
|---|---|---|
| A. Entre redes | ¿Depende la conclusión de la red elegida? | Plan del proyecto (contexto, sección 14) |
| B. Submuestreo de aristas | ¿Es estable la métrica si la red está incompleta? | Prototipo de `Robustness.jsx` (Figma) |

Exploración previa: `scripts/explore_robustness.py` (salida en `logs/explore_robustness.log` y `data/audit/robustness_*`).
Módulo final: `src/networks/atlas_robustness.py` (`make robustness-atlas`).

## 3. Definición

| Aspecto | Decisión |
|---|---|
| Grafo y métricas | Los mismos de la semana 11 (`metricas_semana11.md`, secciones 4 y 5). Se analizan 15 métricas; se excluyen las de cota inferior por nombre. |
| Genomas (A) | Del atlas, con aristas en las dos redes comparadas |
| Anidamiento (A1) | Fracción de los pares (genoma, TF, operón) de una red que también están en otra |
| Orden entre redes (A2) | Spearman del valor por genoma entre cada par de redes |
| Footprinting (A3) | `validated` frente a `no-footprint`: mismo umbral (p ≤ 1e-7) y tier (`same_order`); solo cambia el footprinting (≥ 10 frente a 0). Es el único par de redes que difiere en un solo parámetro. |
| Genomas (B) | Del atlas, con al menos 10 pares TF–operón. Con menos, al quitar el 75 % quedan 2 aristas o menos. |
| Tasas (B) | 10, 25, 50 y 75 % de los pares eliminados |
| Estrategias (B) | `random`: uniforme. `degree_biased`: probabilidad de eliminar proporcional al grado del TF (pierde primero los hubs). `low_confidence`: se eliminan los de menor `confidence`, como si se subiera el umbral; es determinista. |
| Réplicas (B) | 10 para `random` y `degree_biased`; se promedia el valor por genoma. Semilla `[12, red, genoma]`: el resultado no depende del orden ni del número de procesos. |
| Retención (B) | Valor submuestreado (media de réplicas) / valor original |
| Estabilidad (B) | Spearman entre el valor original y el submuestreado entre los genomas: ¿se conserva el orden? |
| Clases (B) | Robusta ≥ 0,90; moderada ≥ 0,70; no robusta < 0,70. `n_edges` con `random` y `degree_biased` es **trivial**: se elimina una fracción fija, así que la retención es 1 − tasa y el orden no cambia. |

## 4. Resultados A: entre redes

### 4.1 Las redes están anidadas

Fracción de los pares de la red de la fila que también están en la red de la columna:

| De \ En | validated | high-precision | balanced | permissive | no-footprint |
|---|---|---|---|---|---|
| validated | 1,000 | 0,084 | **1,000** | **1,000** | **1,000** |
| high-precision | **1,000** | 1,000 | **1,000** | **1,000** | **1,000** |
| balanced | 0,295 | 0,025 | 1,000 | **1,000** | 0,300 |
| permissive | 0,049 | 0,004 | 0,167 | 1,000 | 0,058 |
| no-footprint | 0,567 | 0,048 | 0,578 | 0,666 | 1,000 |

- `high-precision` ⊂ `validated` ⊂ `balanced` ⊂ `permissive`, y `validated` ⊂ `no-footprint`. Las redes son filtros
  sucesivos del mismo escaneo: ninguna agrega aristas que una red más permisiva no tenga.
- `no-footprint` **no** está dentro de `balanced`: el 42 % de sus pares no pasa el filtro de footprinting de `balanced`,
  aunque `balanced` tenga un umbral de p más permisivo.

### 4.2 El orden de los genomas cambia con la red

Spearman del valor por genoma entre pares de redes (genomas del atlas con aristas en ambas):

| Métrica | val–bal | val–no-f | bal–perm | bal–no-f | val–perm | high–bal | Mediana de los 10 pares |
|---|---|---|---|---|---|---|---|
| `n_targets` | 0,91 | 0,97 | 0,84 | 0,90 | 0,76 | 0,49 | 0,76 |
| `n_edges` | 0,89 | 0,96 | 0,84 | 0,87 | 0,69 | 0,48 | 0,69 |
| `n_tf` | 0,81 | 0,97 | 0,75 | 0,81 | 0,58 | 0,50 | 0,58 |
| `out_degree_gini` | 0,62 | 0,74 | 0,77 | 0,57 | 0,53 | 0,14 | 0,52 |
| `frac_multi_reg` | 0,49 | 0,87 | 0,72 | 0,49 | 0,30 | 0,06 | 0,31 |
| `frac_largest` | 0,20 | 0,85 | −0,18 | 0,36 | −0,30 | −0,52 | 0,01 |

- **Entre redes vecinas el orden se mantiene en las métricas de tamaño** (`balanced` frente a `validated`, `permissive` o
  `no-footprint`: ρ entre 0,75 y 0,91).
- **Entre redes alejadas no se mantiene** (`validated` frente a `permissive`: ρ entre 0,58 y 0,76). `high-precision` casi no
  se relaciona con las demás (ρ ≤ 0,51): con medianas de 6 TF y 9 aristas, su orden es sobre todo ruido.
- **Las métricas de estructura dependen de la red**: `frac_largest` y `frac_multi_reg` llegan a invertir el orden de los
  genomas (ρ negativo). Un resultado sobre estructura solo vale para la red en que se calculó.

### 4.3 Efecto del footprinting (`validated` frente a `no-footprint`, 1.039 genomas)

| Métrica | Mediana validated | Mediana no-footprint | Cociente mediano | Spearman |
|---|---|---|---|---|
| `n_tf` | 12 | 16 | 0,78 | 0,96 |
| `n_targets` | 30 | 50 | 0,60 | 0,96 |
| `n_edges` | 31 | 52 | 0,60 | 0,96 |
| `density` | 0,083 | 0,067 | 1,26 | 0,96 |
| `max_out_degree` | 6 | 10 | 0,63 | 0,84 |
| `frac_multi_reg` | 0,000 | 0,025 | — | 0,88 |
| `out_degree_gini` | 0,329 | 0,388 | 0,87 | 0,74 |
| `frac_largest` | 0,195 | 0,198 | 0,99 | 0,82 |

- El footprinting elimina alrededor del 40 % de los pares y una de cada cinco TF (prueba de Wilcoxon con p < 10⁻¹⁵⁰ en las
  métricas de tamaño).
- **Pero conserva el orden de los genomas** (ρ = 0,96 en tamaño). El footprinting funciona como un filtro casi
  proporcional: quita aristas en todos los genomas por igual.
- Junto con la validación de la semana 10 (precisión 1,30 veces mayor con footprinting), esto indica que el footprinting
  mejora la precisión **sin distorsionar la comparación entre genomas**.

### 4.4 El efecto del taxón depende de la red

ε² de Kruskal–Wallis (mediana de `n_tf`, `n_edges` y `max_out_degree`; datos de `make comparison-atlas`):

| Nivel | validated | high-precision | balanced | permissive | no-footprint |
|---|---|---|---|---|---|
| Filo | 0,206 | 0,067 | **0,390** | 0,331 | 0,246 |
| Clase | 0,302 | 0,530 | **0,574** | 0,371 | 0,364 |
| Orden | 0,603 | 0,570 | **0,720** | 0,544 | 0,609 |
| Familia | 0,652 | 0,636 | **0,729** | 0,583 | 0,594 |

En todas las redes la familia y el orden explican más que el filo, pero la magnitud cambia: el efecto del filo va de 0,07 a
0,39. `balanced` es la red donde el taxón pesa más, de acuerdo con su mayor dependencia de la oferta de motivos cercanos
(`metricas_semana11.md`, sección 8.5).

## 5. Resultados B: submuestreo de aristas

Genomas del atlas con al menos 10 pares: 939 (`validated`), 103 (`high-precision`), 1.259 (`balanced`), 2.149
(`permissive`) y 1.030 (`no-footprint`). En total son 986.400 filas de resultados por genoma.

### 5.1 Estabilidad del orden en `balanced`

Spearman entre el valor original y el submuestreado (media de 10 réplicas) entre los 1.259 genomas:

| Métrica | Random 25 % | Random 50 % | Random 75 % | Degree-biased 50 % | Low confidence 25 % | Low confidence 50 % |
|---|---|---|---|---|---|---|
| `n_targets` | 0,999 | 0,998 | 0,994 | 0,997 | 0,999 | 0,996 |
| `frac_genome_targeted` | 0,999 | 0,995 | 0,988 | 0,992 | 0,994 | 0,982 |
| `n_tf` | 0,998 | 0,993 | 0,981 | 0,995 | 0,992 | 0,980 |
| `density` | 0,996 | 0,985 | 0,964 | 0,986 | 0,987 | 0,968 |
| `max_out_degree` | 0,995 | 0,986 | 0,957 | 0,850 | 0,950 | 0,843 |
| `mean_in_degree` | 0,995 | 0,983 | 0,927 | 0,910 | 0,963 | 0,868 |
| `edges_per_tf` | 0,994 | 0,972 | 0,909 | 0,992 | 0,940 | 0,805 |
| `hub_share` | 0,991 | 0,972 | 0,921 | 0,793 | 0,928 | 0,814 |
| `frac_multi_reg` | 0,985 | 0,957 | 0,876 | 0,880 | 0,948 | 0,832 |
| `n_components` | 0,982 | 0,930 | 0,849 | 0,934 | 0,958 | 0,903 |
| `out_degree_gini` | 0,977 | 0,933 | 0,881 | 0,751 | 0,891 | 0,718 |
| `out_degree_entropy` | 0,969 | 0,900 | 0,769 | 0,465 | 0,792 | 0,469 |
| `frac_largest` | 0,941 | 0,714 | 0,175 | 0,397 | 0,775 | 0,284 |
| `n_edges` | trivial | trivial | trivial | trivial | trivial | trivial |

*`mean_out_degree` coincide con `edges_per_tf` (es la misma cantidad).*

### 5.2 Retención en `balanced` (eliminación aleatoria)

Mediana del valor submuestreado / original:

| Métrica | 10 % | 25 % | 50 % | 75 % |
|---|---|---|---|---|
| `n_tf` | 0,96 | 0,89 | 0,73 | 0,48 |
| `n_targets` | 0,92 | 0,78 | 0,55 | 0,29 |
| `frac_multi_reg` | 0,93 | 0,81 | 0,59 | 0,32 |
| `out_degree_gini` | 0,98 | 0,93 | 0,81 | 0,58 |
| `n_components` | 0,99 | 0,96 | 0,86 | 0,62 |
| `density` | 1,02 | 1,08 | 1,27 | 1,87 |
| `hub_share` | 1,01 | 1,03 | 1,09 | 1,26 |
| `out_degree_entropy` | 1,00 | 1,01 | 1,02 | 1,04 |

### 5.3 Clases en las 5 redes (50 % eliminado)

Combinaciones (5 redes × 14 métricas no triviales) por estrategia:

| Estrategia | Robusta | Moderada | No robusta | No definida |
|---|---|---|---|---|
| `random` | 65 | 5 | 0 | 0 |
| `degree_biased` | 43 | 18 | 9 | 0 |
| `low_confidence` | 28 | 28 | 12 | 2 |
| **Total** | **136** | 51 | 21 | 2 |

Fracción de combinaciones (3 estrategias × 5 redes) en que la métrica es robusta con el 50 % eliminado:
`n_tf`, `n_targets` y `frac_genome_targeted` 100 %; `density` 93 %; `n_components` 80 %; `edges_per_tf` y
`mean_out_degree` 73 %; `mean_in_degree` 67 %; `frac_multi_reg` 53 %; `max_out_degree` 47 %; `out_degree_gini` 40 %;
`hub_share` 33 %; `out_degree_entropy` 27 %; `frac_largest` 20 %. Las 2 "no definidas" son métricas de grado de entrada en
`high-precision`, que son casi constantes.

## 6. Hallazgos

1. **Las métricas de tamaño son robustas a una red incompleta.** `n_tf`, `n_targets` y `frac_genome_targeted` conservan el
   orden de los genomas con ρ ≥ 0,98 aunque falte la mitad de las aristas, con cualquier estrategia y en las 5 redes. Una
   comparación entre genomas basada en ellas no depende de que la red esté completa.
2. **Los valores absolutos no son robustos; el orden sí.** Con la mitad de las aristas, `n_targets` baja al 55 % y `n_tf` al
   73 %. `density` y `hub_share` suben, porque se normalizan por un denominador que también baja. Las cifras de una red
   deben leerse como relativas.
3. **Las métricas de estructura no son robustas.** `frac_largest` (ρ 0,71 → 0,18 entre el 50 % y el 75 %) y
   `out_degree_entropy` cambian el orden de los genomas, sobre todo cuando se pierden los hubs (`degree_biased`) o las
   aristas de menor confianza. No se deben usar para comparar genomas.
4. **La estrategia importa más que la tasa.** La eliminación aleatoria es la más benigna. Perder las aristas de menor
   `confidence`, que equivale a usar una red más estricta, degrada la estructura casi tanto como perder los hubs. Esto
   coincide con el análisis A: cambiar de red modifica la estructura más que el tamaño.
5. **Una lista corta de métricas sirve para la tesis.** Robustas en las dos pruebas (A y B): `n_tf`, `n_targets`,
   `frac_genome_targeted` y, con menos margen, `density` y `n_components`. Son las mismas que mejor coinciden con el
   pipeline externo (`metricas_semana11.md`, sección 8.3). Coincidir con el externo y ser robustas son pruebas
   independientes, y señalan las mismas métricas.

## 7. Reproducibilidad

```bash
make robustness-atlas    # PYTHONPATH=. python src/networks/atlas_robustness.py  (24 procesos, ~8 min)
make check               # incluye tests/test_api_atlas_robustness.py
```

Se ejecutó con el árbol limpio sobre `38222a8` (`logs/robustness_atlas_semana12.log`): manifiesto con `git_dirty: false`,
creado el 19-10-2026 a las 12:40 UTC.

**Corrección durante la semana (`38222a8`):** la primera versión marcaba `n_edges` como trivial solo con `random` y
`degree_biased`. Con `low_confidence` también se elimina una fracción fija de pares, así que allí contaba como "robusta"
sin serlo. Se corrigió, se repitió el cálculo y ahora lo comprueba `test_n_edges_is_trivial_in_every_strategy`. Los
valores de Spearman no cambiaron (misma semilla); solo cambió la clase de `n_edges`.

| Archivo | Contenido |
|---|---|
| `data/results/robustness/nesting.tsv` | Anidamiento de los pares entre las 5 redes |
| `data/results/robustness/rank_between_networks.tsv` | Spearman por métrica y par de redes |
| `data/results/robustness/footprint_effect.tsv` | `validated` frente a `no-footprint` |
| `data/results/robustness/subsampling_genomes.parquet` | Por (red, genoma, estrategia, tasa, métrica): valor original, media, DE y retención |
| `data/results/robustness/subsampling_summary.tsv` | Por (red, estrategia, tasa, métrica): retención mediana y percentiles 10 y 90, Spearman y clase |
| `data/results/robustness/manifest.json` | Definición, parámetros, commit y `git_dirty` |

## 8. Pendiente: línea base desde `fimo_hits`

El plan incluye una red simple del pipeline propio (umbral de p de 1e-5 a 1e-8, sin footprinting ni tiers) para medir cuánto
aportan los filtros externos. Necesita exportar `fimo_hits` desde MariaDB (54,6 millones de filas), una consulta pesada sobre
una base compartida, y está **pendiente de aprobación del usuario**. Según el plan, es lo primero que se recorta si falta
tiempo. Una alternativa menor es hacerla solo para los 312 genomas validables.

## 9. Integración en el sistema

- API (solo lectura): `/api/v1/atlas/robustness/{manifest, nesting, between, footprint, subsampling, subsampling/genome}` en
  `src/api/routers/atlas_robustness.py`. El router antiguo `/robustness` del MVP sigue respondiendo "pending".
- Vista `Robustness.jsx` (*Metric Robustness*), en el menú lateral:
  - curva de estabilidad del orden por estrategia;
  - curva de degradación del genoma elegido frente a la mediana del atlas;
  - tabla de todas las métricas por tasa, con su clase;
  - ficha del genoma (original, media ± DE, retención);
  - matrices de anidamiento y de orden entre redes, y tabla del efecto del footprinting.
- Hasta esta semana, la vista llamaba a `getNetworkRobustness` y `getEdgeSubsampling`, que no existían en `api.js`.

## 10. Limitaciones

- El submuestreo simula una red incompleta, pero no una red con **falsos positivos**. Agregar aristas falsas es otra
  pregunta y no se probó.
- La eliminación `random` supone que las aristas que faltan están repartidas al azar. En una red real faltan sobre todo las
  de TF poco estudiados, un caso intermedio entre `random` y `low_confidence`.
- Solo entran los genomas con al menos 10 pares. Las conclusiones no aplican a las redes casi vacías (por ejemplo,
  Bacteroidota en `balanced`).
- `high-precision` tiene solo 103 genomas con 10 pares o más, y algunas métricas de grado de entrada quedan sin definir.

# Preguntas pendientes

Preguntas abiertas sobre los datos y el pipeline externo, que solo puede resolver el investigador que generó
las redes. Cada una indica qué se sabe, qué se probó y qué decisión se tomó mientras tanto.

*Creado el 15-10-2026 (semana 11).*

## Abiertas

### P1. ¿Cómo se calcularon `n_edges` y `n_tf` de `network_metrics`?

- **Qué se observa** (E. coli K-12, `balanced`):

  | Fuente | TF | Aristas |
  |---|---|---|
  | `network_metrics` (externo) | 68 | 919 |
  | Caché `edges_net3`, filas crudas | — | 832 |
  | Caché, pares únicos (motivo, operón) | 218 motivos | 832 |
  | Caché, pares únicos (TF normalizado, operón) = métricas propias | 118 | 485 |

- **Lo que se probó:** el `n_edges` externo es mayor que el número de filas crudas de la caché, así que no sale
  de las aristas que tenemos. En los 1.704 genomas con aristas en `balanced`, la mediana del cociente
  externo / filas crudas es 1,0, pero solo coinciden exactamente en el 6,3 %. El `n_tf` externo no corresponde
  a motivos únicos (coincide en el 8,6 %; mediana 0,54) ni a nombres de TF.
- **Hipótesis:** `network_metrics` se calculó sobre otra versión de las aristas, de antes o después de un
  filtro que no conocemos.
- **Decisión mientras tanto:** `network_metrics` solo se muestra como referencia externa (D33). Las
  comparaciones usan las métricas propias. `metrics_vs_external.tsv` informa la mediana del cociente y la
  correlación de Spearman (ρ entre 0,90 y 0,99 en `n_edges`), no la coincidencia exacta.

### P2. ¿Con qué definición de precisión se calculó el benchmark D33?

Viene de la semana 10 (`validacion_semana10.md`, hallazgo 2): la precisión propia es entre 0,04 y 0,12 más alta
que la de D33, y ninguno de los dos universos (`genome_tf`, `genome`) la reproduce. Falta saber el nivel de
comparación y el universo de falsos positivos de D33.

### P3. ¿Cómo se calibró `confidence`?

Si se calibró con RegPrecise, la curva P/R de la validación también tiene algo de circularidad
(`validacion_semana10.md`, sección 8).

### P4. ¿Hay una columna canónica para la categoría de `genomes.selection`?

El genoma de reemplazo (`genome_id` 2224, `GCF_002993285.1`, *Gordonia iterans*) tiene
`selection = "replacement (GCF_050942165.1 suppressed in RefSeq 2026)"`: la categoría y una nota en el mismo
campo. Se resolvió comparando la primera palabra (ver `correcciones_semana11.md`, C2). Conviene confirmar que
ningún otro valor lleva notas y que *G. iterans* es el reemplazo previsto de `GCF_050942165.1`.

## Resueltas

### R1. Definición de `density` en `network_metrics` (15-10-2026)

`density = n_edges / (n_tf × n_operons)`, donde `n_operons` son **todos** los operones del genoma, no solo
las dianas. Se cumple en las 6.427 filas de `network_metrics` (tolerancia relativa 10⁻³). La densidad propia
usa `n_edges / (n_tf × n_targets)` (solo operones diana). Por eso la propia es entre 3,7 y 170 veces mayor y la
correlación entre ambas es negativa: son dos métricas distintas, no un error. Detalle en
`correcciones_semana11.md`, C5.

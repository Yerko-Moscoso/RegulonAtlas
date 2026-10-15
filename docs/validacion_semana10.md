# Validación de las redes del atlas contra RegPrecise (semana 10)

*7 al 14 de octubre de 2026. Objetivo específico OE5.*

## 1. Objetivo

Medir qué tan bien las cinco redes materializadas en `regulon_atlas` recuperan las interacciones curadas de RegPrecise 3.0, con una evaluación **propia, documentada y reproducible**, independiente del pipeline externo que generó las redes.

## 2. Por qué una evaluación propia

El código del pipeline externo no está disponible (sección 6 del contexto). Los valores P/R/F1 de la decisión D33 se conocen, pero no cómo se calcularon: nivel de comparación, universo de falsos positivos ni tratamiento de motivos construidos con los mismos datos de RegPrecise. Por eso:

- La validación se define desde cero, a partir de la caché `data/cache/atlas/`.
- Los valores de D33 se usan solo como **referencia externa**. No se busca reproducirlos exactamente.
- Las diferencias con D33 se documentan como hallazgos.

## 3. Datos de entrada (caché del atlas, 14-10-2026)

| Archivo | Filas | Uso |
|---|---|---|
| `curated_regulons` | 103.044 | Gold standard (regulog, TF, genoma, locus) |
| `regprecise_genome_map` | 488 | Nombre de genoma de RegPrecise → accesión |
| `genes_validation` | 1.415.837 | Genes de los genomas cubiertos por RegPrecise (`locus_tag`, `old_locus_tag`, `operon_id`) |
| `motifs` | 2.141 | `motif_key` (`RGnnn` = regulog nnn de RegPrecise; `MX…` = PRODORIC) |
| `edges_net1` a `edges_net5` | 77.503 a 2.551.734 | Predicciones de cada red |

## 4. Definición de la evaluación

| Aspecto | Decisión |
|---|---|
| Nivel | TF → operón. Los genes curados se proyectan a su operón con `genes.operon_id` (las aristas apuntan a operones, D10). |
| Emparejamiento de genes | Primero `locus_tag` y después `old_locus_tag`. Se quita el prefijo `gene-`/`gene_` y se pasa a mayúsculas. |
| Emparejamiento de TF | Nombre normalizado en minúsculas. |
| Agrupación de predicciones | Un par por (genoma, TF, operón); se conserva la arista de mayor `confidence`. |
| Universo principal (`genome_tf`) | Solo se evalúan las predicciones de pares (genoma, TF) que tienen regulón curado. El resto se informa como "no evaluable", no como falso positivo, porque el gold standard es incompleto. |
| Universo estricto (`genome`) | Se evalúan todas las predicciones de los genomas validables. Es la cota inferior de la precisión. |
| Recall | Sobre **todos** los pares curados proyectados, tengan o no aristas en la red. |
| Modo `all` | Todas las aristas. |
| Modo `independent` | Excluye las aristas cuyo motivo de RegPrecise proviene de un regulog que contiene al genoma evaluado. Así ningún genoma valida motivos construidos con sus propios sitios. |
| Curva P/R | Barrido de `confidence` de 0 a 1 en pasos de 0,01, dentro de cada red y modo. |
| Agregación | Micro (todos los pares) como cifra principal; mediana por genoma (macro) como complemento. |

## 5. Proyección del gold standard

| Concepto | Valor |
|---|---|
| Filas curadas | 103.044 |
| Sin genoma en la base | 11.450 (11,1 %) |
| Emparejadas por `locus_tag` | 3.483 |
| Emparejadas por `old_locus_tag` | 70.424 |
| Locus sin emparejar | 17.687 (17,2 %) |
| **Pares TF–operón curados** | **37.266** |
| Pares (genoma, TF) curados | 8.361 |
| Genomas validables | 312 |
| Genomas con mapeo de locus < 90 % | 82 de 381 |

- En total se pierde el 28 % de las filas curadas antes de evaluar. Esto fija un techo al recall.
- El emparejamiento por `old_locus_tag` resolvió el 95 % de las filas emparejadas: sin la tabla `gene_old_locus` la validación no sería posible.
- 136 TF curados no tienen ningún motivo con el mismo nombre, pero suman solo 277 pares (0,7 %). Casi todos llevan nombre de locus (por ejemplo `xcc4129`, `dvu0379`). No se armó una tabla de alias.

## 6. Resultados

### 6.1 Universo `genome_tf`, modo `all` (comparable con D33)

| Red | Pares TF–operón | Evaluables | P | R | F1 | D33 P / R / F1 |
|---|---|---|---|---|---|---|
| validated | 61.149 | 10.449 (17,1 %) | 0,784 | 0,220 | 0,343 | 0,682 / 0,231 / 0,345 |
| high-precision | 5.136 | 1.845 (35,9 %) | 0,861 | 0,043 | 0,081 | 0,742 / 0,041 / 0,078 |
| **balanced** | 207.505 | 20.222 (9,7 %) | 0,612 | 0,332 | **0,431** | 0,545 / 0,343 / 0,421 |
| permissive | 1.245.159 | 47.245 (3,8 %) | 0,342 | 0,434 | 0,383 | 0,307 / 0,446 / 0,364 |
| no-footprint | 107.754 | 19.196 (17,8 %) | 0,601 | 0,309 | 0,408 | 0,548 / 0,317 / 0,402 |

### 6.2 Las cuatro combinaciones (F1)

| Red | `all` / `genome_tf` | `all` / `genome` | `independent` / `genome_tf` | `independent` / `genome` |
|---|---|---|---|---|
| validated | 0,343 | 0,331 | 0,160 | 0,154 |
| high-precision | 0,081 | 0,081 | 0,019 | 0,018 |
| balanced | **0,431** | 0,342 | **0,318** | **0,247** |
| permissive | 0,383 | 0,157 | 0,314 | 0,123 |
| no-footprint | 0,408 | **0,376** | 0,179 | 0,163 |

### 6.3 Efecto de excluir la autoevaluación (universo `genome_tf`)

| Red | P `all` | P `independent` | R `all` | R `independent` | Recall perdido |
|---|---|---|---|---|---|
| validated | 0,784 | 0,762 | 0,220 | 0,089 | −60 % |
| high-precision | 0,861 | 0,755 | 0,043 | 0,009 | −79 % |
| balanced | 0,612 | 0,582 | 0,332 | 0,219 | −34 % |
| permissive | 0,342 | 0,301 | 0,434 | 0,329 | −24 % |
| no-footprint | 0,601 | 0,555 | 0,309 | 0,107 | −65 % |

### 6.4 Precisión por tier (`permissive`, modo `all`)

| Tier | Evaluables | Precisión |
|---|---|---|
| within_family | 4.733 | 0,74 |
| within_order | 7.409 | 0,62 |
| same_order | 2.290 | 0,42 |
| within_phylum | 10.992 | 0,40 |
| same_class | 4.853 | 0,21 |
| same_phylum | 2.410 | 0,11 |
| cross_phylum | 13.110 | 0,05 |

El desglose completo de todas las redes y modos está en `by_tier.tsv` y `by_origin.tsv`.

## 7. Hallazgos

1. **Nuestra evaluación reproduce el recall de D33** (diferencia ≤ 0,012 en las cinco redes) y el mismo orden de F1. La validación propia es comparable con la externa.
2. **La precisión propia es 0,04 a 0,12 más alta que la de D33** en todas las redes. La variante estricta (`genome`) tampoco la explica: en `balanced` y `permissive` D33 queda entre ambos universos. Se registra como diferencia de definición no resuelta.
3. **La circularidad infla el recall, no la precisión.** Al excluir los motivos construidos con el mismo regulog, el recall cae entre 24 % y 79 %, mientras la precisión baja como mucho 0,11. Como el recall de D33 coincide con el modo `all`, el benchmark externo casi seguro incluye autoevaluación y sobreestima el recall.
4. **`balanced` es la red recomendada:** mejor F1 en tres de las cuatro combinaciones y la que menos recall pierde sin autoevaluación (su tier `same_class` transfiere motivos desde otros regulogs). En `all` / `genome` gana `no-footprint`.
5. **El footprinting filogenético mejora la precisión de forma robusta:** `validated` frente a `no-footprint` (mismo umbral y tier) da 1,30× en modo `all` y 1,37× en modo `independent` (D33 informa 1,24×).
6. **La precisión cae con la distancia taxonómica de la transferencia del motivo:** de 0,74 dentro de la familia a 0,05 entre filos. En `permissive`, los pares `cross_phylum` son el 28 % de lo evaluable y casi la mitad de los falsos positivos.

## 8. Limitaciones

- La validación describe solo la fracción evaluable de cada red: 9,7 % de los pares en `balanced` y 3,8 % en `permissive`.
- El 28 % del gold standard se pierde al mapear genomas y locus.
- RegPrecise es incompleto: un "falso positivo" puede ser una interacción real no curada.
- Los motivos de PRODORIC no se marcan como circulares, aunque algunos provienen de organismos que también están en RegPrecise.
- Se desconoce cómo se calibró `confidence`. Si se usó RegPrecise, la curva P/R también tiene algo de circularidad.
- No se puede verificar la definición exacta de D33 sin el código del pipeline externo.

## 9. Reproducibilidad

```bash
make validate-atlas     # PYTHONPATH=. python src/validation/atlas.py --gold regprecise
```

Salidas en `data/results/validation/regprecise/` (no versionadas):

| Archivo | Contenido |
|---|---|
| `summary.tsv` | P/R/F1 por red, modo y universo, con los valores de D33 |
| `pr_curve.tsv` | Curva P/R por red y modo (101 umbrales de `confidence`) |
| `by_tier.tsv` / `by_origin.tsv` | Precisión por tier y por origen del motivo |
| `by_genome.tsv` | TP/FP/FN, precisión y recall por genoma |
| `locus_mapping.tsv` | Tasa de emparejamiento de locus por genoma |
| `manifest.json` | Definición, estadísticas del gold standard, commit y fecha de la caché |

La exploración previa está en `scripts/explore_validation.py` (salidas en `data/audit/validation_*`).

## 10. Integración en el sistema

- API (solo lectura de los TSV): `/api/v1/atlas/validation/{manifest, summary, curve, breakdown/{tier|origin}, genomes, locus-mapping}` en `src/api/routers/atlas_validation.py`.
- Vista `Validation.jsx`: tabla de las cinco redes con D33, curvas P/R, curva de umbral de `confidence`, desglose por tier y origen, y ficha por genoma para los 312 genomas validables.
- El parámetro `--gold regulondb` queda preparado para la validación con RegulonDB (si se aprueba).
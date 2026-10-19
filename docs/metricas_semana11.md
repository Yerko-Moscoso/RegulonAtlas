# Métricas topológicas propias y comparación entre taxones (semana 11)

*15 al 19 de octubre de 2026. Objetivo específico OE4. La sección 8.5 (origen de los motivos) se agregó el 19-10-2026.*

## 1. Objetivo

Calcular métricas topológicas **propias, documentadas y reproducibles** para las cinco redes del atlas, desde la caché y no
desde la tabla externa `network_metrics`. Con ellas se comparan los genomas entre taxones de GTDB, y se mide cuánto se parece
esa comparación a la que darían los valores del pipeline externo.

## 2. Por qué métricas propias

En la semana 9 (sección 9.6 del contexto) se comprobó que `network_metrics` **no se puede reproducir desde `edges`**. Para
E. coli K-12 en `balanced`, la tabla externa da 68 TF, 310 dianas y 919 aristas, mientras que `edges` tiene 832 filas,
118 TF y 485 pares TF–operón. No hay acceso al código del pipeline. Por eso:

- Las métricas se definen y se calculan aquí con NetworkX, con la misma definición de grafo que la validación y la API.
- `network_metrics` se usa solo como **referencia externa**. Las diferencias se documentan (sección 7 y
  `correcciones_semana11.md`, C5).

## 3. Datos de entrada (caché del atlas, 14 y 15-10-2026)

| Archivo | Filas | Uso |
|---|---|---|
| `edges_net1` a `edges_net5` | 77.503 a 2.551.734 | Aristas de cada red |
| `genes_all` | 9.440.405 | Genes por genoma y tamaño de los operones (`frac_genome_targeted`); nombre de gen para ubicar TF |
| `genomes` | 2.644 | Taxonomía GTDB, `selection` |
| `network_metrics` | 6.427 | Referencia externa |

## 4. Definición del grafo

| Aspecto | Decisión |
|---|---|
| Nodos TF | Nombre normalizado (minúsculas). Los motivos de un mismo TF forman un solo nodo. |
| Nodos diana | Operones (las aristas apuntan a operones, D10). |
| Arista | Un par (TF, operón) por genoma; se conserva la de mayor `confidence`. |
| Tipo | Grafo dirigido bipartito TF → operón, uno por (red, genoma). |
| Genomas | Los 2.644 en cada red. Los que no tienen aristas quedan con `has_edges = false`. `in_atlas` marca los 2.224 del atlas. |

## 5. Métricas

| Grupo | Métrica | Definición |
|---|---|---|
| Tamaño | `n_tf`, `n_targets`, `n_edges` | Nodos TF, nodos operón, pares TF–operón |
| | `n_target_genes` | Genes de los operones diana |
| Normalizadas | `density` | `n_edges / (n_tf × n_targets)` |
| | `edges_per_tf` | `n_edges / n_tf` |
| | `frac_multi_reg` | Fracción de dianas con 2 o más TF |
| | `frac_genome_targeted` | Genes en operones diana / genes del genoma |
| | `frac_largest` | Nodos del mayor componente débilmente conexo / nodos |
| Grado | `mean_out_degree`, `median_out_degree`, `max_out_degree` | Dianas por TF |
| | `mean_in_degree`, `max_in_degree` | TF por diana |
| | `out_degree_entropy` | Entropía de Shannon del grado de salida, normalizada por `log(n_tf)` |
| | `out_degree_gini` | Desigualdad del grado de salida |
| | `hub_share` | Aristas del TF con más dianas / `n_edges` |
| Estructura | `n_components` | Componentes débilmente conexos |
| Cota inferior | `tf_resolved_rate`, `n_tf_tf_edges`, `n_autoreg` | Ver el párrafo siguiente |

Las métricas jerárquicas (aristas TF → TF y autorregulación) necesitan ubicar el gen de cada TF en su genoma. Eso solo se
puede hacer por nombre (`genes.gene_name`), y la mediana de TF ubicados en el atlas es del 18 % en `balanced`
(`scripts/explore_metrics.py`). Se informan como **cota inferior** junto a `tf_resolved_rate` y **no se usan para comparar
genomas**. Los FFL y las cascadas no se calcularon por el mismo motivo.

## 6. Resultados de las métricas

### 6.1 Cobertura

| Red | Genomas con aristas | Del atlas | Del atlas con fila en `network_metrics` |
|---|---|---|---|
| validated | 1.427 | 1.127 | 1.122 |
| high-precision | 338 | 207 | 207 |
| **balanced** | 2.088 | 1.717 | 1.704 |
| permissive | 2.634 | 2.214 | 2.205 |
| no-footprint | 1.515 | 1.203 | 1.189 |

### 6.2 Medianas en el atlas (genomas con aristas)

| Red | TF | Dianas | Pares | `density` | `frac_multi_reg` | `frac_genome_targeted` | Gini salida |
|---|---|---|---|---|---|---|---|
| validated | 11 | 27 | 28 | 0,093 | 0,000 | 0,018 | 0,329 |
| high-precision | 6 | 9 | 9 | 0,167 | 0,000 | 0,006 | 0,229 |
| **balanced** | 24 | 57 | 64 | 0,048 | 0,107 | 0,035 | 0,389 |
| permissive | 100 | 172 | 281,5 | 0,018 | 0,333 | 0,106 | 0,454 |
| no-footprint | 13 | 44 | 46 | 0,080 | 0,013 | 0,028 | 0,385 |

### 6.3 Valores de control: E. coli K-12 (`GCF_000005845.2`) en `balanced`

118 TF, 342 operones diana, 485 pares TF–operón, `density` 0,012, `frac_multi_reg` 0,295, 48 componentes. En este genoma
se ubica por nombre el 77 % de los TF (bien anotado): 73 aristas TF → TF y 44 autorregulaciones, como cota inferior.

### 6.4 Concordancia genoma a genoma con `network_metrics`

Spearman entre el valor propio y el externo de cada genoma (genomas del atlas con fila en ambas fuentes):

| Métrica | validated | high-precision | balanced | permissive | no-footprint |
|---|---|---|---|---|---|
| `n_tf` | 0,932 | 0,898 | 0,959 | 0,879 | 0,920 |
| `n_targets` | 0,956 | 0,945 | 0,992 | 0,998 | 0,958 |
| `n_edges` | 0,957 | 0,905 | 0,987 | 0,990 | 0,950 |
| `max_out_degree` | 0,898 | 0,932 | 0,962 | 0,933 | 0,915 |
| `n_components` | 0,915 | 0,938 | 0,822 | 0,585 | 0,904 |
| `mean_in_degree` | 0,550 | −0,006 | 0,593 | 0,897 | 0,489 |
| `frac_multi_reg` | 0,412 | 0,002 | 0,263 | 0,623 | 0,351 |
| `density` | −0,250 | −0,214 | −0,612 | −0,267 | −0,224 |

Mediana del cociente propia / externa: `n_targets` entre 1,03 y 1,13; `n_edges` entre 0,50 y 0,61; `n_tf` entre 0,60 y 1,77.

## 7. Diferencias con `network_metrics`

1. **`density` usa otra definición.** La externa es `n_edges / (n_tf × n_operons)`, con todos los operones del genoma. Se
   cumple en las 6.427 filas. La propia usa solo las dianas. Por eso los valores difieren entre 3,7 y 170 veces y la
   correlación es negativa. No es un error (`correcciones_semana11.md`, C5).
2. **Las métricas de tamaño ordenan igual, pero con otra escala.** `n_targets` coincide casi 1:1. `n_edges` propio es
   alrededor de 0,55 veces el externo, aunque el externo es **mayor** que el número de filas de `edges` (919 frente a 832 en
   E. coli). Por lo tanto, no sale de las aristas que tenemos (`preguntas_pendientes.md`, P1).
3. **Las métricas de grado de entrada casi no se parecen** (`mean_in_degree`, `frac_multi_reg`). Son las más sensibles a
   cómo se agrupan los TF: con nodos por motivo, un operón con dos motivos del mismo TF cuenta como multirregulado; con
   nodos por nombre, no.

## 8. Comparación entre taxones

### 8.1 Elección del método

Se evaluaron tres opciones: (A) distribución por taxón con una prueba estadística, (B) A más una proyección PCA y (C) B más
clusters de arquitectura regulatoria. **Se eligió A** porque el criterio fue obtener resultados lo más cercanos posible a los
del pipeline externo, y A es la única que se puede calcular igual con `network_metrics`. Así se puede medir la concordancia.
PCA y clusters no tienen referencia externa y dependen de cómo se elijan y escalen las métricas.

### 8.2 Definición

| Aspecto | Decisión |
|---|---|
| Genomas | Del atlas, con aristas en la red y con fila en `network_metrics`. Son **los mismos** para el valor propio y el externo. |
| Niveles | Filo, clase, orden y familia de GTDB |
| Tamaño mínimo | 5 genomas por taxón. En `balanced` quedan 10 filos, 13 clases, 48 órdenes y 83 familias. |
| Métricas | Las 11 con columna equivalente en `network_metrics` |
| Resumen por taxón | Mediana, cuartiles y percentiles 10 y 90 (propios); mediana y cuartiles externos |
| Prueba | Kruskal–Wallis entre taxones. Tamaño de efecto ε² = (H − k + 1) / (n − k). |
| Concordancia | Spearman entre las medianas por taxón propias y externas: alta ≥ 0,85, moderada ≥ 0,60, baja < 0,60. `density` se marca como "definición distinta". |

### 8.3 Concordancia con el pipeline externo

Spearman entre medianas por taxón, `balanced`:

| Métrica | Filo | Clase | Orden | Familia |
|---|---|---|---|---|
| `n_targets` | 0,988 | 0,989 | 0,990 | 0,986 |
| `n_edges` | 0,979 | 0,977 | 0,986 | 0,983 |
| `max_out_degree` | 0,969 | 0,981 | 0,977 | 0,960 |
| `n_tf` | 0,936 | 0,971 | 0,973 | 0,955 |
| `n_components` | 0,966 | 0,932 | 0,915 | 0,817 |
| `frac_largest` | 0,890 | 0,747 | 0,825 | 0,815 |
| `mean_out_degree` | 0,870 | 0,878 | 0,891 | 0,782 |
| `max_in_degree` | 0,757 | 0,870 | 0,892 | 0,896 |
| `mean_in_degree` | 0,369 | 0,529 | 0,734 | 0,628 |
| `frac_multi_reg` | −0,033 | 0,144 | 0,383 | 0,270 |
| `density` (definición distinta) | −0,590 | −0,716 | −0,722 | −0,712 |

En todas las redes y niveles:

| Red | Alta | Moderada | Baja | No definida | Misma conclusión de Kruskal–Wallis |
|---|---|---|---|---|---|
| validated | 22 | 7 | 11 | 0 | 100 % |
| high-precision | 10 | 13 | 5 | 12 | 75 % |
| **balanced** | **26** | 8 | 6 | 0 | **100 %** |
| permissive | 32 | 5 | 3 | 0 | 100 % |
| no-footprint | 21 | 8 | 11 | 0 | 100 % |

*(10 métricas comparables × 4 niveles = 40 combinaciones por red. En `high-precision`, "no definida" corresponde a las
métricas de grado de entrada, que son casi constantes porque cada diana tiene un solo TF.)*

### 8.4 ¿Explica el taxón la arquitectura de la red?

ε² de Kruskal–Wallis, `balanced` (propia / externa):

| Nivel | `n_tf` | `n_targets` | `n_edges` |
|---|---|---|---|
| Filo | 0,417 / 0,348 | 0,375 / 0,372 | 0,390 / 0,358 |
| Clase | 0,644 / 0,620 | 0,568 / 0,583 | 0,574 / 0,564 |
| Orden | 0,759 / 0,719 | 0,718 / 0,709 | 0,720 / 0,692 |
| Familia | 0,770 / 0,733 | 0,725 / 0,718 | 0,729 / 0,704 |

Medianas por filo en `balanced` (propia / externa):

| Filo | Genomas | TF | Pares TF–operón |
|---|---|---|---|
| Pseudomonadota | 838 | 39 / 36 | 110 / 200 |
| Bacillota | 313 | 34 / 39 | 75 / 142 |
| Actinomycetota | 224 | 19 / 28 | 52 / 89,5 |
| Desulfobacterota | 30 | 10,5 / 14,5 | 32 / 39,5 |
| Thermotogota | 15 | 11 / 11 | 16 / 21 |
| Chloroflexota | 6 | 6 / 7 | 11 / 13 |
| Bacteroidota | 174 | 2 / 4 | 4 / 9 |
| Chlamydiota | 8 | 1,5 / 1,5 | 3 / 3 |
| Campylobacterota | 32 | 1 / 2 | 2 / 2 |
| Cyanobacteriota | 64 | 1 / 3 | 2 / 6 |

### 8.5 ¿El efecto del taxón se explica por el origen de los motivos?

**Hipótesis.** Los motivos se transfieren por cercanía taxonómica (D13). Por eso, los genomas cercanos a los organismos donde
se describieron los motivos (los modelos de PRODORIC y RegPrecise) reciben más TF, y eso infla el efecto del taxón.

**Cómo se probó** (`scripts/explore_motif_origin.py`):

1. **Origen de cada motivo en GTDB.**
   - RegPrecise (`RGnnn`): regulog nnn → genomas del regulog (`curated_regulons`) → accesión (`regprecise_genome_map`) →
     taxonomía. Ubica 1.773 de 1.808 motivos (98,1 %).
   - PRODORIC: `source_taxon` contra `ncbi_organism`, primero por especie (301 motivos) y después por género (32). Ubica
     los 333 (100 %).
2. **Oferta de motivos de cada genoma del atlas:** número de motivos con al menos un genoma de origen en su misma familia,
   orden, clase o filo.
3. **Regresión lineal** sobre los genomas del atlas con aristas, con `y = log(1 + n_tf)`. Se compara el R² del filo solo con
   el R² que el filo **agrega** después de controlar por el tamaño del genoma (`log n_genes`) y por la oferta de familia,
   orden y clase.

**Origen de los motivos por filo** (un motivo cuenta en cada filo de sus genomas de origen): Pseudomonadota 1.101,
Bacillota 510, Actinomycetota 262, Desulfobacterota 85, Thermotogota 39, Bacteroidota 38, Chloroflexota 25,
Cyanobacteriota 23, Campylobacterota 10. Es el mismo orden que el tamaño de las redes: Spearman entre la mediana de TF del
filo y los motivos originados en él = **0,936**.

**R² de los modelos** (`y = log(1 + n_tf)`):

| Red | Genomas | Filo solo | Tamaño del genoma | Oferta | Tamaño + oferta | + filo | R² que agrega el filo | Efecto del filo explicado |
|---|---|---|---|---|---|---|---|---|
| validated | 1.127 | 0,288 | 0,193 | 0,291 | 0,457 | 0,592 | 0,135 | 53 % |
| high-precision | 207 | 0,077 | 0,076 | 0,346 | 0,370 | 0,741 | 0,370 | no interpretable* |
| **balanced** | 1.717 | 0,475 | 0,157 | 0,601 | 0,768 | 0,824 | **0,056** | **88 %** |
| permissive | 2.214 | 0,318 | 0,653 | 0,141 | 0,747 | 0,837 | 0,089 | 72 % |
| no-footprint | 1.203 | 0,348 | 0,118 | 0,330 | 0,489 | 0,626 | 0,137 | 61 % |

*"Efecto del filo explicado" = 1 − (R² que agrega el filo / R² del filo solo). Con `n_edges` los resultados son casi
iguales (88 % en `balanced`). \*En `high-precision` hay solo 207 genomas: con las variables de filo el modelo se sobreajusta
y el R² que agrega el filo supera al del filo solo.*

**Lectura:**

- **Se confirma la hipótesis.** En `balanced`, la oferta de motivos sola (R² 0,60) explica más que el filo (0,48). Después
  de controlar por tamaño y oferta, el filo agrega apenas 0,056.
- **El factor dominante depende de la red.** En `balanced`, `validated` y `no-footprint` (transferencia hasta clase u orden)
  domina la oferta cercana. En `permissive` (transferencia entre filos) domina el tamaño del genoma (R² 0,65), porque casi
  cualquier TF con ortólogo recibe un motivo y el número de TF crece con el genoma.
- **Dentro de los filos también se ve:** en `balanced`, más oferta en el mismo orden significa más TF en Bacillota
  (ρ = 0,67), Desulfobacterota (0,60) y Pseudomonadota (0,40), pero casi no en Actinomycetota (0,12) ni en Bacteroidota
  (0,08).
- **Qué no se puede separar:** el tamaño del genoma es en parte biológico (los genomas grandes tienen más TF), y la oferta
  está ligada a qué grupos se estudiaron más. Con estos datos no se puede saber cuánto de la diferencia que queda es
  biología.

## 9. Hallazgos

1. **Las métricas de tamaño propias reproducen la comparación externa.** `n_targets`, `n_edges`, `max_out_degree` y `n_tf`
   ordenan los taxones igual que `network_metrics`: ρ ≥ 0,936 en los cuatro niveles en `balanced`, y la mediana por red va
   de 0,87 (`high-precision`, con pocos genomas) a 0,98. Kruskal–Wallis da la misma conclusión en el 95 % de todas las combinaciones (100 % en cuatro de
   las cinco redes).
2. **Coinciden en el orden, no en el valor absoluto.** `n_edges` propio es alrededor de la mitad del externo, porque se
   agrupa por (TF, operón). Las conclusiones de la comparación no cambian, pero las cifras externas no deben mezclarse con
   las propias.
3. **El taxón explica gran parte del tamaño de la red.** El filo explica alrededor del 40 % de la variación del número de
   TF y de pares (ε² ≈ 0,4), la clase alrededor del 60 % y el orden o la familia más del 70 %. La red regulatoria predicha
   se parece más entre genomas cercanos. **Pero ese efecto es sobre todo metodológico** (sección 8.5): en `balanced`, el
   tamaño del genoma y la cantidad de motivos que vienen de su misma familia, orden o clase explican el 88 % del efecto del
   filo sobre el número de TF. Las diferencias entre taxones de la vista *Taxon Comparison* reflejan más dónde se
   estudiaron los reguladores que la biología de cada grupo.
4. **Las métricas de grado de entrada no son comparables con la tabla externa** (ρ < 0,6 en la mayoría de los niveles).
   Dependen de cómo se definen los nodos TF, que es justamente lo que no se puede verificar del pipeline externo.
5. **Bacteroidota, Campylobacterota y Cyanobacteriota tienen redes casi vacías en `balanced`** (mediana de 1 a 2 TF). Su
   arquitectura no se puede comparar con esta red. Para ellos conviene `permissive`, con la precisión más baja que se midió
   en la semana 10.

## 10. Limitaciones

- Las métricas describen la **red predicha**, no la red biológica: heredan los sesgos de cobertura de los motivos (sección 9,
  hallazgo 3) y la precisión de cada red (semana 10).
- Sin la ubicación de los genes de los TF, la estructura jerárquica (FFL, cascadas, autorregulación) queda fuera.
- `network_metrics` no se puede reproducir. La concordancia mide parecido de orden, no igualdad.
- Kruskal–Wallis supone genomas independientes. Dentro de un taxón, los genomas comparten motivos transferidos, así que los
  valores p son optimistas. Por eso se informa ε² y no solo p.
- La comparación usa solo los taxones con al menos 5 genomas, así que los géneros con un solo representante no aparecen.
- Las diferencias entre taxones dependen sobre todo de la oferta de motivos cercanos y del tamaño del genoma (sección 8.5).
  No deben presentarse como diferencias biológicas de arquitectura regulatoria sin esa advertencia.
- El 1,9 % de los motivos de RegPrecise (35) no se pudo ubicar en GTDB: sus genomas del regulog no están en `regprecise_genome_map`.

## 11. Reproducibilidad

```bash
make metrics-atlas       # PYTHONPATH=. python src/networks/atlas_metrics.py
make comparison-atlas    # PYTHONPATH=. python src/networks/atlas_comparison.py
make check               # incluye tests/test_api_atlas_metrics.py y tests/test_api_atlas_comparison.py
```

Ambas se ejecutaron con el árbol limpio. El manifiesto de las métricas apunta a `ceeb831` y el de la comparación a
`3ce0f17`, los dos con `git_dirty: false`.

| Archivo | Contenido |
|---|---|
| `data/results/metrics/atlas_metrics.{parquet,tsv}` | 13.220 filas (2.644 genomas × 5 redes), 35 columnas |
| `data/results/metrics/metrics_vs_external.tsv` | Concordancia genoma a genoma de `n_tf`, `n_targets`, `n_edges` y `density` |
| `data/results/comparison/by_taxon.tsv` | Distribución propia y externa por (red, nivel, taxón, métrica) |
| `data/results/comparison/taxon_tests.tsv` | Kruskal–Wallis, ε² y concordancia por (red, nivel, métrica) |
| `manifest.json` (en cada carpeta) | Definición, parámetros, commit y `git_dirty` |

Exploración previa: `scripts/explore_metrics.py`, `scripts/explore_comparison.py` y `scripts/explore_motif_origin.py`
(salidas en `data/audit/metrics_*`, `data/audit/comparison_*` y `data/audit/motif_origin_*`).

## 12. Integración en el sistema

- API (solo lectura):
  - `/api/v1/atlas/metrics{,/definitions,/summary,/compare-external,/genomes}` en `src/api/routers/atlas_metrics.py`.
  - `/api/v1/atlas/comparison/{manifest,taxa,tests}` en `src/api/routers/atlas_comparison.py`.
- Vistas:
  - `Metrics.jsx`: métricas propias por genoma, histograma, ranking y concordancia con la tabla externa.
  - `Fingerprints.jsx`: percentiles y radar del genoma frente a su familia y al atlas.
  - `Comparison.jsx` (*Taxon Comparison*): mediana propia con su rango intercuartílico por taxón y mediana externa como
    punto. Incluye la tabla de concordancia por métrica y la tabla completa de taxones. Desde el 19-10-2026 muestra una
    advertencia: el efecto del taxón es en buena parte metodológico (sección 8.5).
- `Fingerprints` y `Comparison` vuelven al menú lateral. Hasta esta semana, `Fingerprints` no estaba enrutada.

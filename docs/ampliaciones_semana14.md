# Ampliaciones de la v1.0 (semana 14, 23-11-2026)

*Excepciones E1 a E7 al congelamiento, aprobadas por el estudiante el 23-11-2026 (`congelamiento_v1.md`, sección 5).
Código en los commits `548a306` a `80f3974`; todos los resultados se generaron con el árbol limpio en `80f3974`.*

## 1. Resumen

| Punto | Qué se agregó | Comando | Resultado | Dónde se ve |
|---|---|---|---|---|
| E1 | Intervalos de confianza del 95 % de P, R y F1 | `make ci-atlas` | `data/results/validation_ci/` | Validation |
| E2 | Modos `all` e `independent` lado a lado | (usa E1) | | Validation |
| E3 | Comparación entre taxones ajustada | `make adjusted-atlas` | `data/results/comparison_adjusted/` | Taxon Comparison |
| E4 | Precisión esperada por genoma | `make reliability-atlas` | `data/results/reliability/` | OrganismDetail, Fingerprints |
| E5 | Validación con RegulonDB (*E. coli* K-12) | `make regulondb`, `make validate-regulondb` | `data/results/validation/regulondb*/` | Validation |
| E6 | MVP frente al atlas en los mismos 8 genomas | `make mvp-point` | `data/results/validation_mvp/` | Validation |
| E7 | Avisos de cobertura | (usa la validación) | | Metrics, Fingerprints, Comparison, Regulatory Network |

`make extensions` corre E1, E3, E4, E5 y E6. **No forma parte de `make all`**, para no cambiar lo que se probó en la
reproducibilidad. Los resultados congelados no cambiaron: sha256 idénticos antes y después, y `make validate-atlas` repetido
en otra carpeta da los mismos 6 archivos byte a byte.

## 2. E1 y E2: intervalos de confianza

**Método.** Bootstrap de 10.000 réplicas sobre `by_genome.tsv` (universo `genome_tf`), con semilla fija e intervalo percentil.
Dos esquemas: por genoma y **por familia GTDB**. El segundo es el que se recomienda citar, porque los genomas de una familia
no son independientes. Las réplicas son las mismas para todas las redes, así que la diferencia de F1 se evalúa pareada.

| Red | F1 `all` (IC 95 %, familia) | F1 `independent` (IC 95 %, familia) |
|---|---|---|
| validated | 0,343 (0,306–0,387) | 0,160 (0,120–0,201) |
| high-precision | 0,081 (0,047–0,113) | 0,019 (0,003–0,036) |
| **balanced** | **0,431 (0,397–0,469)** | **0,318 (0,284–0,356)** |
| permissive | 0,383 (0,347–0,413) | 0,314 (0,279–0,345) |
| no-footprint | 0,408 (0,377–0,439) | 0,179 (0,137–0,218) |

**Hallazgo que cambia la redacción.** `balanced` tiene el F1 más alto, pero **no siempre se distingue de la segunda red**:

- En `all`, por familia, no se distingue de `no-footprint` (diferencia 0,022; IC −0,016 a 0,062).
- En `independent`, no se distingue de `permissive` con ninguno de los dos esquemas (diferencia 0,004; IC por familia −0,031 a 0,040).

Se puede afirmar que `balanced` está entre las mejores redes y que tiene mejor precisión que `permissive` con un F1 similar.
No se debe afirmar que es la mejor en todos los escenarios.

## 3. E3: comparación entre taxones ajustada

**Método.** Por red y métrica (`n_tf`, `n_targets`, `n_edges`), con los mismos genomas de `make comparison-atlas`:
`log(1 + métrica) ~ log(n_genes) + log(1 + oferta de familia) + log(1 + oferta de orden) + log(1 + oferta de clase)`.
El residuo dice cuántas veces está un taxón por sobre o bajo lo esperado. La oferta de motivos se movió a
`src/networks/motif_supply.py` sin cambiar su definición (verificado: idéntica a `data/audit/motif_origin_supply.tsv`).

**Parte del efecto del taxón sobre `n_tf` explicada por tamaño y oferta:**

| Red | Filo | Clase | Orden | Familia |
|---|---|---|---|---|
| validated | 54 % | 36 % | 41 % | 34 % |
| high-precision | no interpretable | 40 % | 40 % | 44 % |
| **balanced** | **89 %** | **82 %** | **81 %** | **84 %** |
| permissive | 71 % | 72 % | 76 % | 77 % |
| no-footprint | 61 % | 46 % | 46 % | 37 % |

- Reproduce el 88 % de `metricas_semana11.md` (8.5). Aquí da 89 % porque usa los genomas de la comparación (1.704, no 1.717).
- **El efecto metodológico domina en `balanced` y `permissive`, pero no en las demás redes.**
- En `balanced`, por filo, quedan sobre lo esperado Chlamydiota (×4,4), Thermotogota (×3,1) y Desulfobacterota (×2,8), y bajo
  lo esperado Cyanobacteriota (×0,42). Son grupos pequeños (Chlamydiota: 8 genomas, mediana de 1,5 TF): **son candidatos a
  revisar, no hallazgos biológicos**. El residuo puede ser biología o sesgo de muestreo.

## 4. E4: precisión esperada por genoma

**Método.** Precisión de cada tier en modo `independent` (suavizada hacia la precisión global de la red con 20 pares), promediada
según la composición de tiers de cada genoma. Se comprobó con validación cruzada de 5 grupos **por familia GTDB**.

| Red | Genomas en la prueba | Spearman predicha/observada | Error absoluto medio | Calidad |
|---|---|---|---|---|
| validated | 79 | 0,31 | 0,094 | débil |
| high-precision | 6 | no aplica | 0,169 | insuficiente |
| balanced | 184 | 0,38 | 0,117 | débil |
| permissive | 257 | 0,46 | 0,119 | débil |
| no-footprint | 118 | −0,01 | 0,104 | no informativa |

**El indicador sirve poco para comparar genomas dentro de una red.** Estima bien el nivel medio de la red (sesgo entre −0,07 y
0,01, salvo `high-precision`), pero no ordena bien los genomas. Por eso se quitaron las etiquetas alta/media/baja que se habían
planeado, y la vista muestra la estimación con su error típico y su calidad. **No se recomienda usarlo como resultado de la tesis.**

## 5. E5: RegulonDB

**Datos.** RegulonDB 14.5.1 (`NetworkRegulatorGene`, 11-11-2026), descargado por su API GraphQL el 23-11-2026. Solo reguladores
de tipo TF. Genes por número b hacia su operón (99,3 % de las filas). 4.017 pares TF–operón; 2.473 con evidencia fuerte o confirmada.

**Alias.** 12 nombres, tomados de los sinónimos de la propia RegulonDB (`scripts/explore_regulondb.py`), por ejemplo FruR = Cra.
Casi no influyen: en `balanced`, P = 0,578 con alias y 0,569 sin alias.

| Red | Toda la evidencia: P / R / F1 | Fuerte + confirmada: P / R / F1 |
|---|---|---|
| validated | 0,737 / 0,040 / 0,076 | 0,612 / 0,052 / 0,095 |
| high-precision | 0,778 / 0,005 / 0,010 | 0,704 / 0,008 / 0,015 |
| balanced | 0,578 / 0,060 / 0,108 | 0,458 / 0,074 / 0,128 |
| permissive | 0,404 / 0,070 / 0,120 | 0,321 / 0,089 / 0,139 |
| no-footprint | 0,649 / 0,058 / 0,106 | 0,543 / 0,076 / 0,133 |

*(`genome_tf`, modo `all`.)*

- **La precisión de `balanced` se sostiene con una fuente independiente de RegPrecise** (0,578 frente a 0,612), pero baja a
  0,458 si solo cuenta la evidencia fuerte o confirmada.
- **El recall es muy bajo (4–9 %):** la red `balanced` de *E. coli* tiene 485 pares y RegulonDB 4.017.
- **Aquí `balanced` no tiene el mejor F1:** lo tiene `permissive`.
- Es un solo genoma, el mejor estudiado. No se generaliza al atlas ni lleva intervalo de confianza.
- El modo `independent` solo quita la autoevaluación de RegPrecise; los motivos de PRODORIC de *E. coli* pueden compartir
  evidencia con RegulonDB.

**Licencia.** RegulonDB es libre para uso académico y no comercial, y no permite integrarlo en otras bases de datos sin
consentimiento escrito de CCG-UNAM. Por eso `data/raw/regulondb/` no se versiona, y la API y el dashboard solo entregan cifras
agregadas. Conviene que el profesor confirme si esto basta antes de publicar el sistema. Cita: Salgado et al., *Nucleic Acids
Research*, 2023, doi:10.1093/nar/gkad1072.

## 6. E6: MVP frente al atlas

Las curvas de Validation cubren 312 genomas y el MVP 8, así que poner el MVP sobre esas curvas compararía poblaciones distintas.
**Por eso va en un gráfico propio**, con el MVP y las 5 redes evaluados en los mismos 8 genomas (4.312 pares curados).

| | F1 `all` | F1 `independent` |
|---|---|---|
| Mejor umbral del MVP (p ≤ 1e-6,5) | 0,364 | 0,307 |
| `balanced` | 0,445 | 0,321 |

Los filtros externos superan al MVP con todas las aristas, pero **sin autoevaluación la ventaja casi desaparece** (0,321 frente a
0,307). Son 8 genomas de Enterobacteriaceae: es un punto de referencia, no una comparación general.

## 7. E7: avisos de cobertura

`CoverageNote.jsx` indica qué parte de la red elegida se puede comprobar contra regulones curados (en `balanced`, 9,7 % en los 2.644 genomas y 1,8 % en
los 2.224 del atlas; separación agregada en la excepción E12). En Metrics,
la nota de las métricas jerárquicas ahora dice que el gen del TF se ubica en cerca del 18 % de los casos (mediana, `balanced`).

## 8. Verificación

- `make check`: **147 de 147 pruebas** al cerrar E1–E7 (24 nuevas en `tests/test_extensions.py`; 149 tras E8), ESLint sin errores.
- Los 6 manifiestos nuevos tienen `git_dirty: false` (commit `80f3974`).
- `data/results/` congelado: sha256 idéntico en validación, métricas, comparación, robustez y línea base.
- Navegador (Chromium) a 1440 y 900 px: Validation, Comparison, Fingerprints, Metrics, Regulatory Network y Organisms sin errores
  de consola, sin respuestas 4xx/5xx y sin desborde horizontal. OrganismDetail, comprobada a 1440 px.

## 9. Limitaciones y pendientes

- Data Provenance y `/atlas/status` **no** siguen estas 6 salidas nuevas: siguen mostrando las 8 etapas congeladas.
- `make extensions` necesita los resultados de `make all`, de `make mvp` y la descarga de `make regulondb`. Como RegulonDB se
  actualiza, una descarga futura puede cambiar sus cifras; `data/raw/regulondb/manifest.json` guarda versión y sha256.
- La API pasa de 35 a 43 rutas GET; la lista de la sección 2.2 del congelamiento describe la v1.0 original.
- El mensaje del commit `80f3974` dice "E1-E8"; son E1 a E7.

## 10. E8: solo información explícita

**Motivo.** Las notas de `networks.params.source` traen valores P/R/F1 que remiten a un registro de decisiones del investigador
al que no tenemos acceso. Quien replique el proyecto tampoco lo tendría, así que el sistema muestra solo lo que consta en los datos
o se calcula aquí (commits `1305636` y `f88b0c2`).

| Antes | Ahora |
|---|---|
| Valores P/R/F1 externos en Validation, Dashboard, Metrics y Regulatory Network | Filtros de cada red (p, techo de tier y footprint) y, en Dashboard, pares evaluables |
| Puntos externos en la curva P/R | Solo las curvas propias |
| La API entregaba esas columnas y la nota `params.source` | Entrega solo columnas propias (`SUMMARY_COLUMNS`) y filtros |
| `src/validation/atlas.py` escribía esas columnas | Ya no las escribe |

**No cambió ningún dato propio:**

- Los 72 archivos de `data/results/` tienen el mismo sha256 antes y después. No se regeneró ninguno.
- En 97 consultas a las 43 rutas de la API, lo único que desaparece son las 3 columnas externas y la nota `source`. Las otras
  diferencias son la hora de la consulta y el indicador de cambios sin commit de `/atlas/status`.
- Repetir la validación en otra carpeta da los mismos valores en las 16 columnas del resumen y los otros 5 archivos byte a byte.
- Las 10 vistas se revisaron a 1440 y 900 px, sin errores de consola.

**Para quien replique.** Los `summary.tsv` ya generados conservan 3 columnas antiguas que la API ignora. Una corrida nueva los crea
con 16 columnas, así que **esos archivos ya no serán iguales byte a byte a los de esta copia**, aunque sus valores sí lo sean. La nota
sigue en la base y en `data/cache/atlas/networks.parquet`, porque son datos externos de solo lectura.

**Qué se pierde.** Ya no se compara nuestra validación con los valores anotados por el investigador. Esa diferencia queda solo como
pregunta abierta (P2 de `preguntas_pendientes.md`).

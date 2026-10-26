# Preguntas pendientes

Preguntas abiertas sobre los datos, el pipeline externo y el alcance del proyecto. Cada una indica qué se sabe, qué se probó
y qué decisión se tomó mientras tanto. Al final hay un borrador de mensaje para el investigador y otro para el profesor.

*Creado el 15-10-2026 (semana 11). Última actualización: 19-10-2026.*

**Estado de los mensajes:** borradores listos el 19-10-2026, **pendientes de envío por el usuario** (Claude no tiene
acceso a correo). Al enviarlos, anotar aquí la fecha; al recibir respuesta, pasar la pregunta a "Resueltas".

## Para el investigador

### P1. ¿Cómo se calcularon `n_edges` y `n_tf` de `network_metrics`?

- **Qué se observa** (E. coli K-12, `balanced`):

  | Fuente | TF | Aristas |
  |---|---|---|
  | `network_metrics` (externo) | 68 | 919 |
  | Caché `edges_net3`, filas crudas | — | 832 |
  | Caché, pares únicos (motivo, operón) | 218 motivos | 832 |
  | Caché, pares únicos (TF normalizado, operón) = métricas propias | 118 | 485 |

- **Lo que se probó:** el `n_edges` externo es mayor que el número de filas crudas de la caché, así que no sale de las
  aristas que tenemos. En los 1.704 genomas con aristas en `balanced`, la mediana del cociente externo / filas crudas es 1,0,
  pero solo coinciden exactamente en el 6,3 %. El `n_tf` externo no corresponde a motivos únicos (coincide en el 8,6 %;
  mediana 0,54), ni a nombres de TF, ni a `tf_og` (37 en E. coli).
- **Hipótesis:** `network_metrics` se calculó sobre otra versión de las aristas, de antes o después de un filtro que no
  conocemos.
- **Decisión mientras tanto:** `network_metrics` solo se muestra como referencia externa. La comparación entre taxones de la
  semana 11 mide la concordancia por rangos (`metricas_semana11.md`, sección 8).

### P2. ¿Con qué definición se calculó el benchmark D33?

Viene de la semana 10 (`validacion_semana10.md`, hallazgo 2): la precisión propia es entre 0,04 y 0,12 más alta que la de
D33, y ninguno de los dos universos (`genome_tf`, `genome`) la reproduce. Falta saber:

- el nivel de comparación (TF → gen o TF → operón) y la versión de RegPrecise;
- cómo se contaron los falsos positivos (qué universo);
- si se excluyó la autoevaluación (motivos construidos con el mismo regulog). El recall de D33 coincide con nuestro modo
  `all`, lo que sugiere que no se excluyó.

### P3. ¿Cómo se calibró `confidence`?

Si se calibró con RegPrecise, la curva P/R de la validación también tiene algo de circularidad (`validacion_semana10.md`,
sección 8).

**Avance (19-10-2026):** la calibración y el método convergent-empirical **no eliminan pares**. Las 5 redes son el umbral
de p más el techo de tier más el footprinting, y `no-footprint` se reproduce exactamente desde `fimo_hits`
(`robustez_semana12.md`, sección 8.4). La pregunta queda solo sobre cómo se asigna el valor de `confidence`.

### P4. ¿Hay una columna canónica para la categoría de `genomes.selection`?

El genoma de reemplazo (`genome_id` 2224, `GCF_002993285.1`, *Gordonia iterans*) tiene
`selection = "replacement (GCF_050942165.1 suppressed in RefSeq 2026)"`: la categoría y una nota en el mismo campo. Se
resolvió comparando la primera palabra (`correcciones_semana11.md`, C2). Conviene confirmar que ningún otro valor lleva notas
y que *G. iterans* es el reemplazo previsto de `GCF_050942165.1`.

### P5. ¿Qué diferencia hay entre los tiers `within_*` y `same_*`?

En `edges` aparecen los dos (por ejemplo, `within_order` y `same_order`) y su precisión es distinta: en `permissive`,
`within_order` = 0,62 y `same_order` = 0,42 (`validacion_semana10.md`, sección 6.4). La diferencia no está documentada.

**Pista (19-10-2026):** en `transfer_map`, los tiers `within_*` aparecen con la regla `ortholog` y también con las reglas
de respaldo taxonómico (`tax_fallback_*`); los `same_*` aparecen solo con `ortholog` (`robustez_semana12.md`, sección 8.2).
Puede que `same_X` signifique "ortólogo del TF en un genoma del mismo X" y `within_X` "dentro del mismo X, por ortólogo o
por respaldo taxonómico", pero hay que confirmarlo.

### P6. ¿Se puede acceder al código del pipeline y al registro completo de decisiones (D1–D33)?

El código no está en ningún lugar accesible del servidor (contexto, sección 6). Con él se podrían resolver P1 a P3 y P5.

## Para el profesor

### Q1. ¿Se aprueba el cambio de alcance?

Las redes de la base (pipeline externo) pasan a ser la fuente principal, y el pipeline propio pasa a validador independiente
(contexto, sección 9.3).

### Q2. ¿Se puede presentar `balanced` como red principal, con las cifras del modo `independent`?

Es la mejor red en 3 de las 4 combinaciones de la validación. Las cifras se presentarían como rangos: precisión entre los
universos `genome` y `genome_tf`, y recall entre los modos `independent` y `all`.

### Q3. ¿RegulonDB es obligatorio o complementario?

El plan está listo (contexto, sección "Plan de RegulonDB"), pero solo cubre E. coli K-12.

### Q4. ¿Cuáles son las fechas y el formato del informe y de la defensa?

## Resueltas

### R1. Definición de `density` en `network_metrics` (15-10-2026)

`density = n_edges / (n_tf × n_operons)`, donde `n_operons` son **todos** los operones del genoma, no solo las dianas. Se
cumple en las 6.427 filas de `network_metrics` (tolerancia relativa 10⁻³). La densidad propia usa
`n_edges / (n_tf × n_targets)`. Por eso la propia es entre 3,7 y 170 veces mayor y la correlación entre ambas es negativa:
son dos métricas distintas, no un error. Detalle en `correcciones_semana11.md`, C5.

### R2. ¿Las métricas propias llevan a las mismas conclusiones que `network_metrics`? (19-10-2026)

En la comparación entre taxones, sí para las métricas de tamaño. `n_targets`, `n_edges`, `max_out_degree` y `n_tf` ordenan
los taxones igual (ρ ≥ 0,936 en `balanced`), y Kruskal–Wallis da la misma conclusión en el 95 % de las combinaciones. No pasa
lo mismo con las métricas de grado de entrada. Detalle en `metricas_semana11.md`, sección 8.

### R3. ¿El tamaño de la red por taxón refleja el origen de los motivos? (19-10-2026)

En gran parte, sí. En `balanced`, el tamaño del genoma y la oferta de motivos de su misma familia, orden o clase explican el
88 % del efecto del filo sobre el número de TF. Detalle en `metricas_semana11.md`, sección 8.5.

### R4. ¿Qué filtros aplica el pipeline externo? (19-10-2026)

Umbral de p, techo de tier de transferencia y footprinting filogenético. A nivel de arista (genoma, motivo, operón),
`no-footprint` se reproduce exactamente desde `fimo_hits`, y `validated`, `high-precision` y `balanced` se reproducen
exactamente desde su red madre con el mínimo de footprint de `networks.params`. `permissive` no se puede comprobar.
Detalle en `robustez_semana12.md`, sección 8.4. Queda abierto cómo se calcula `footprint_enrichment` y la `confidence`.

## Borradores de mensaje

*Actualizados el 26-10-2026 con los resultados de la semana 12 (`robustez_semana12.md`, sección 8) y las pruebas de
aceptación del MVP (`evidencia_mvp/pruebas_aceptacion_mvp.md`). Los envía el estudiante.*

**Al investigador:**

> Hola. Estoy terminando la validación y las métricas del atlas. Te cuento un avance: desde `fimo_hits` logré reproducir
> exactamente `no-footprint` (p ≤ 1e-7 y tier hasta `same_order`), y `validated`, `high-precision` y `balanced` salen
> exactamente de su red madre con el mínimo de footprint de `networks.params`. O sea, entiendo las redes como umbral + techo
> de tier + footprinting. Me quedaron dudas que solo puedes resolver tú:
> (1) cómo se calcularon `n_edges` y `n_tf` de `network_metrics`, porque no logro reproducirlos desde `edges`
> (E. coli en balanced: 919 aristas frente a 832 filas en `edges`); (2) cómo se calcularon P/R/F1 de D33: nivel TF → gen o
> TF → operón, versión de RegPrecise, universo de falsos positivos y si se excluyeron los motivos construidos con el mismo
> regulog; (3) cómo se calculan `footprint_enrichment` y el valor de `confidence` (vi que la calibración no elimina pares,
> pero no sé si se calibró con RegPrecise); (4) la diferencia entre los tiers `within_*` y `same_*` (mi hipótesis:
> `same_X` = ortólogo del TF en un genoma del mismo X; `within_X` = dentro del mismo X, por ortólogo o por respaldo
> taxonómico); (5) si `GCF_002993285.1` es el reemplazo previsto de `GCF_050942165.1`; y (6) si puedo ver el código del
> pipeline o el registro de decisiones D1–D33. También quiero confirmar cómo quieres que te cite en el informe. ¡Gracias!

**Al profesor:**

> Hola, profesor. Le cuento el estado del proyecto: terminé la validación propia de las 5 redes contra RegPrecise, las
> métricas topológicas y la comparación entre taxones, y el análisis de robustez (semanas 10 a 12). Además, las pruebas de
> aceptación del MVP dieron 6 de 6 aprobadas desde un clon limpio. Le escribo para confirmar cuatro puntos:
> (1) si aprueba que las redes generadas por el investigador sean la fuente principal y que mi pipeline quede como
> validador independiente (ya reproduce exactamente una de las redes externas); (2) si puedo presentar `balanced` como red
> principal, con las cifras de validación como rangos (incluido el modo sin autoevaluación: P = 0,58–0,61,
> F1 = 0,32–0,43); (3) si la validación con RegulonDB es obligatoria o complementaria; y (4) las fechas y el formato del
> informe y de la defensa. Saludos.

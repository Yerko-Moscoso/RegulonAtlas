# Congelamiento de funciones de RegulonAtlas v1.0

*Congelado el 29-10-2026, al cierre de la semana 13, a pedido del estudiante. La etiqueta **`congelamiento-v1`** (creada
el 04-11-2026, en `dev` y en GitHub; no en `main`) marca el estado congelado: commit `d9bcf58`.* El sistema se congela después de la revisión completa y sus correcciones
(`revision_semana13.md`) y de la prueba de reproducibilidad (`evidencia_reproducibilidad/prueba_reproducibilidad_atlas.md`).

## 1. Qué significa

Desde esta fecha **no se agregan funciones nuevas**. Las semanas 14 a 16 son de pruebas, correcciones, documentación y
redacción de la tesis. Lo que está en la sección 2 es la versión 1.0 completa; lo que no está, no entra salvo como
excepción (sección 4).

## 2. Qué incluye la v1.0 (lista cerrada)

### 2.1 Análisis (calculados offline, con manifiesto y commit)

| Análisis | Comando | Resultado | Documento |
|---|---|---|---|
| Caché del atlas desde MariaDB (solo SELECT) | `make cache-atlas`, `cache-genes`, `cache-fimo` | `data/cache/atlas/` | `auditoria_semana9.md`, `robustez_semana12.md` (8) |
| Validación de las 5 redes contra RegPrecise (modos `all` e `independent`, curva P/R, desgloses) | `make validate-atlas` | `data/results/validation/` | `validacion_semana10.md` |
| Métricas topológicas propias (NetworkX) | `make metrics-atlas` | `data/results/metrics/` | `metricas_semana11.md` |
| Comparación entre taxones GTDB y concordancia con `network_metrics` | `make comparison-atlas` | `data/results/comparison/` | `metricas_semana11.md` |
| Robustez entre redes y frente a submuestreo de aristas | `make robustness-atlas` | `data/results/robustness/` | `robustez_semana12.md` |
| Línea base del pipeline propio (red de prueba, 312 genomas validables) | `make baseline-atlas` | `data/results/baseline/` | `robustez_semana12.md` (8) |
| Todo el análisis en orden, con revisión previa | `make all` (= `make atlas`, con `make atlas-ready`) | Los cinco anteriores | `sistema_semana13.md` (6), prueba de reproducibilidad |
| MVP de 8 genomas (congelado en su etiqueta `mvp-semana8`) | `make mvp` | `data/results/mvp/` | `evidencia_mvp/pruebas_aceptacion_mvp.md` |

### 2.2 API (FastAPI, solo lectura; 35 rutas GET)

| Grupo | Rutas | Qué sirve |
|---|---|---|
| Sistema | `/`, `/api/v1/health` | Estado del backend |
| Genomas y motivos | `/api/v1/genomes/`, `/genomes/{accession}`, `/motifs/` | Catálogo desde la caché |
| Redes | 4 en `/atlas/networks…` | Lista de redes, genomas por red, grafo de un genoma, `network_metrics` (externo) |
| Validación | 6 en `/atlas/validation/…` | Resumen, curva, desgloses, por genoma, mapeo de loci, manifiesto |
| Métricas | 5 en `/atlas/metrics…` | Métricas propias, definiciones, resumen, por genomas, comparación con la tabla externa |
| Comparación | 3 en `/atlas/comparison/…` | Taxones, pruebas, manifiesto |
| Robustez | 6 en `/atlas/robustness/…` | Anidamiento, entre redes, footprinting, submuestreo (atlas y genoma), manifiesto |
| Línea base | 4 en `/atlas/baseline/…` | Resumen, reproducción por pares y por aristas, manifiesto |
| Trazabilidad | `/atlas/provenance`, `/atlas/status` | Fuentes externas y estado de las 8 etapas |

La API nunca consulta MariaDB. Sin resultados responde 503 con el comando `make` a correr (`revision_semana13.md`).

### 2.3 Dashboard (10 vistas en el menú, más la ficha de genoma)

Dashboard, Organisms (con la ficha OrganismDetail), Regulatory Networks, Metrics, Fingerprints, Taxon Comparison,
Robustness, Validation (con la línea base) y, en SYSTEM, Pipeline y Data Provenance. Qué responde cada una: `README.md`,
"Vistas del dashboard".

### 2.4 Calidad

| Elemento | Estado al congelar |
|---|---|
| Pruebas (`tests/`) | 58: unitarias, de humo de la API, valores de control y revisión previa de `make all` |
| `make check` y hook pre-commit | API importa, sin `get_db` en `src/api`, frontend compila, ESLint sin errores, pytest |
| ESLint | 0 errores; 18 advertencias del React Compiler aceptadas (`revision_semana13.md`, sección 4) |
| Reproducibilidad | `make all` desde un clon limpio reproduce byte a byte los 20 archivos de resultados |
| Trazabilidad | Cada resultado con `manifest.json` (commit y `git_dirty: false`), visible en Data Provenance |

## 3. Qué queda fuera explícitamente

| Función | Motivo |
|---|---|
| Vista MVP | Descartada por el estudiante (26-10-2026); el MVP vive en su etiqueta y en `make mvp` |
| Vista Settings | Descartada por el estudiante (29-10-2026) |
| Enriquecimiento funcional de las redes | Opcional de la semana 11; no se hizo |
| Validación contra RegulonDB | Depende de la respuesta del profesor (pregunta Q3). Ver la excepción prevista en la sección 4 |
| Regenerar la caché o cambiar las redes externas | Las redes son del investigador; la caché actual es la del análisis congelado |

## 4. Reglas después del congelamiento

1. **Se permite sin pedir permiso:** corregir errores (algo que no funciona o muestra un dato falso), agregar pruebas,
   mejorar textos y documentación, y redactar la tesis. Cada cambio con `make check`, en su commit y en la bitácora.
2. **Una función nueva solo entra si el estudiante la aprueba explícitamente.** Se registra como excepción en la
   sección 5, con fecha, motivo y commit.
3. **Excepción ya prevista:** si el profesor exige la validación contra RegulonDB (Q3), entra con el plan de la sección
   14 del contexto (*E. coli* K-12, `make regulondb`, rama `--gold regulondb`).
4. **No se recalculan los resultados congelados** salvo para corregir un error. Si se recalculan, se comparan con los
   actuales como en la prueba de reproducibilidad y se documenta la diferencia.
5. Las ramas no cambian: todo en `dev`; nada a `main` hasta que el estudiante lo indique.

## 5. Registro de excepciones

| Fecha | Función | Motivo | Aprobación | Commit |
|---|---|---|---|---|
| 23-11-2026 | E1. Intervalos de confianza (bootstrap) de P, R y F1 | Saber si las diferencias entre redes son reales | Estudiante, 23-11-2026 (punto 1) | Ver bitácora |
| 23-11-2026 | E2. Validation: modos `all` e `independent` lado a lado | No mostrar solo la cifra más favorable | Estudiante, 23-11-2026 (punto 2) | Ver bitácora |
| 23-11-2026 | E3. Comparación entre taxones ajustada por tamaño del genoma y oferta de motivos | Separar el efecto metodológico del taxón | Estudiante, 23-11-2026 (punto 3) | Ver bitácora |
| 23-11-2026 | E4. Indicador de confiabilidad por genoma | Orientar en los genomas sin gold standard | Estudiante, 23-11-2026 (punto 4) | Ver bitácora |
| 23-11-2026 | E5. Validación con RegulonDB (*E. coli* K-12) | Segundo gold standard, con evidencia experimental | Estudiante, 23-11-2026 (punto 6) | Ver bitácora |
| 23-11-2026 | E6. Red del MVP frente a las redes del atlas | Pendiente desde la semana 10 | Estudiante, 23-11-2026 (punto 7) | Ver bitácora |
| 23-11-2026 | E7. Avisos de cobertura junto a las cifras | Evitar leer las cifras como cobertura total | Estudiante, 23-11-2026 (punto 8) | Ver bitácora |

## 6. Limitaciones con las que se congela

- Sin acceso al código del pipeline externo ni a su registro de decisiones (D1–D33); la trazabilidad llega hasta la
  tabla `provenance`.
- Definición exacta del benchmark D33 desconocida, con autoevaluación; `network_metrics` no se reproduce desde `edges`.
- 28 % de las filas curadas de RegPrecise no se pueden usar (sin genoma o sin locus) y solo una fracción de cada red es
  evaluable (por ejemplo, 9,7 % de los pares de `balanced`).
- Versión de RegPrecise por confirmar (3.0 en `provenance`, 3.2 en el MVP; P7).
- Las exportaciones de la caché registran fecha y filas, pero no el commit del script.
- Reproducibilidad probada desde la caché, en el mismo servidor y entorno; crear el entorno desde cero (`conda env
  create`) queda para la semana 14.
- 18 advertencias de ESLint aceptadas (patrón de carga de las vistas y caché del dibujo de redes).

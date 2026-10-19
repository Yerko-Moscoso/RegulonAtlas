# Documentación de RegulomeAtlas

**Este es el punto de entrada de toda la documentación del proyecto.** Toda la documentación vive en `docs/`. Cada documento
nuevo y cada bloque de trabajo terminado se registran aquí: el índice dice *qué* hay en cada documento y la bitácora dice
*cuándo* se hizo cada cosa y en qué commit.

*Creado el 19-10-2026. Se actualiza en cada commit que agregue o cambie documentación.*

## Por dónde empezar

1. **`contexto_regulomeatlas.md`**: el documento maestro. Contiene el proyecto, los datos, las decisiones, lo hecho cada
   semana, la arquitectura, el plan y los pendientes. Si solo se lee un documento, debe ser este.
2. **Este archivo**: para encontrar el detalle de cada tema.
3. **`../CLAUDE.md`**: reglas de trabajo y valores de control. Lo lee Claude Code al empezar, pero también sirve como resumen
   de las reglas.

## Índice

### Documentos generales

| Documento | Qué contiene | Actualizado |
|---|---|---|
| [`contexto_regulomeatlas.md`](contexto_regulomeatlas.md) | Documento maestro: proyecto, infraestructura, datos, esquema de la base, redes externas, decisiones (D1–D33 y semanales), historia semana a semana, arquitectura, plan de semanas 12–16, cómo presentarlo en el informe, pendientes, lecciones y comandos | 19-10-2026 |
| [`preguntas_pendientes.md`](preguntas_pendientes.md) | Preguntas abiertas al investigador (P1–P6) y al profesor (Q1–Q4), preguntas resueltas (R1–R3) y borradores de mensaje | 19-10-2026 |
| [`../CLAUDE.md`](../CLAUDE.md) | Reglas del proyecto, definiciones del dominio, comandos y valores de control | 19-10-2026 |
| [`../README.md`](../README.md) | README del MVP (semana 8): requisitos y cómo reproducir `make mvp` | 28-09-2026 |

### Documentos por semana (resultados para la tesis)

| Semana | Documento | Objetivo | Qué contiene |
|---|---|---|---|
| 9 | [`auditoria_semana9.md`](auditoria_semana9.md) | — | Auditoría de `fimo_hits`, cobertura del atlas, decisión de usar las redes de la base, diagnóstico de `network_metrics` |
| 10 | [`validacion_semana10.md`](validacion_semana10.md) | OE5 | Validación propia de las 5 redes contra RegPrecise: definición, proyección del gold standard, P/R/F1, modo `independent`, precisión por tier, hallazgos y limitaciones |
| 11 | [`metricas_semana11.md`](metricas_semana11.md) | OE4 | Métricas topológicas propias, diferencias con `network_metrics`, comparación entre taxones, concordancia con el pipeline externo y prueba del origen de los motivos (8.5) |
| 11 | [`correcciones_semana11.md`](correcciones_semana11.md) | — | Correcciones C1–C6: import roto, genoma replacement, trazabilidad, verificación pre-commit, `density` externa y documentación |

### Material de referencia

| Archivo | Qué contiene |
|---|---|
| [`esquemas.txt`](esquemas.txt) | Salida de `SHOW CREATE TABLE` de `edges`, `motifs`, `operons`, `genes` y `curated_regulons` (copiada de la terminal; tiene códigos de escape al inicio) |
| `../data/results/mvp/report.md` | Informe generado por `make mvp` (MVP de la semana 8) |

### Dónde están los resultados (no versionados, se regeneran)

| Carpeta | Se genera con | Documentado en |
|---|---|---|
| `data/cache/atlas/` | `make cache-atlas`, `make cache-genes` | Contexto, sección 9.4 |
| `data/results/validation/regprecise/` | `make validate-atlas` | `validacion_semana10.md`, sección 9 |
| `data/results/metrics/` | `make metrics-atlas` | `metricas_semana11.md`, sección 11 |
| `data/results/comparison/` | `make comparison-atlas` | `metricas_semana11.md`, sección 11 |
| `data/audit/` | `scripts/explore_*.py`, `scripts/audit_summary.py` | Docstring de cada script |
| `logs/` | Ejecuciones con `> logs/….log` | Bitácora (abajo) |

Cada carpeta de resultados tiene un `manifest.json` con el commit que la generó y `git_dirty` (debe ser `false`).

## Bitácora

Una entrada por bloque de trabajo, la más reciente arriba. Al agregar una entrada se indica qué se hizo, el commit y dónde
quedó documentado.

### 19-10-2026: pendientes de la semana 11

- **Validación repetida con el árbol limpio.** Resultados idénticos a los de la semana 10 (diferencia 0,0). Manifiesto en
  `63469d5`, `git_dirty: false`. Nueva prueba `tests/test_api_atlas_validation.py` (22 pruebas en total).
  → `correcciones_semana11.md`, C3.
- **Hipótesis del origen de los motivos comprobada** (`scripts/explore_motif_origin.py`). En `balanced`, el tamaño del
  genoma y la oferta de motivos cercanos explican el 88 % del efecto del filo sobre el número de TF. `Comparison.jsx`
  muestra la advertencia. → `metricas_semana11.md`, sección 8.5; `preguntas_pendientes.md`, R3.
- **Mensajes al investigador y al profesor listos**, pendientes de que el usuario los envíe. → `preguntas_pendientes.md`,
  final.
- **Se creó este índice** (`docs/README.md`).

### 19-10-2026: comparación entre taxones y documentación de la semana 11

- `3ce0f17`: `scripts/explore_comparison.py`, `src/networks/atlas_comparison.py` (`make comparison-atlas`), API
  `/atlas/comparison/*`, `Comparison.jsx` reescrita, `Fingerprints` y `Comparison` en el menú.
- `63469d5`: `metricas_semana11.md`, contexto actualizado con la sección 11, preguntas al investigador y al profesor.
- `f46562d`: se agregó `contexto_regulomeatlas.md`.

### 15-10-2026: verificación y correcciones de la semana 11

- `73c7a34`: import roto en `main.py`. `a1b5dfc`: genoma replacement y `git_dirty`. `ceeb831`: `make check`, hook
  pre-commit y pruebas. `9801b4f`: `correcciones_semana11.md` y `preguntas_pendientes.md`.
- `06e5140`: métricas propias (`src/networks/atlas_metrics.py`), vistas Metrics y Fingerprints.

### 14 y 15-10-2026: semana 10

- `7ef945d`: validación propia contra RegPrecise, API y `Validation.jsx`. → `validacion_semana10.md`.
- `16b243b`: vistas con la caché, routers sin MariaDB.

### 28-09-2026: semana 9

- `c4ad722`: auditoría de `fimo_hits` y decisión de fuente de datos. → `auditoria_semana9.md`.
- `53d24d9`, `448e6f5`: `RegulatoryNetwork` con datos reales y layout determinista.

### 23 al 28-09-2026: MVP (semanas 1–8)

- `c5216c6`, `4745f58`: pipeline reproducible del MVP e informe. `b628e54`: entrega `mvp-semana8`. → `../README.md`,
  contexto, sección 8.

## Cómo mantener esta documentación

- **Documento nuevo:** agregarlo al índice, con su sección y qué contiene.
- **Bloque de trabajo terminado:** agregar una entrada a la bitácora con la fecha, qué se hizo, el commit y el documento
  donde quedó.
- **Resultados nuevos:** documentarlos en el documento de la semana y resumirlos en el contexto (sección de la semana).
- **Pregunta nueva o resuelta:** `preguntas_pendientes.md`.
- Todo esto entra en el mismo commit que el trabajo, que antes pasa por `make check`.

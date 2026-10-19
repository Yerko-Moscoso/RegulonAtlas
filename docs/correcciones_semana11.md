# Correcciones de la semana 11 (verificación de OE4)

*15 de octubre de 2026. Revisión del bloque de métricas propias (`06e5140`) antes de documentar la semana 11.*

Cada corrección indica qué falló, la causa, qué se cambió, en qué commit y cómo se verificó. El documento de
resultados de la semana (`metricas_semana11.md`) se escribe aparte.

| # | Problema | Commit |
|---|---|---|
| C1 | La API no arrancaba desde una copia limpia de `dev` | `73c7a34` |
| C2 | El genoma *replacement* quedaba fuera del atlas (2.223 en vez de 2.224) | `a1b5dfc` |
| C3 | `manifest.json` apuntaba a un commit que no contenía el módulo | `a1b5dfc` + nueva ejecución |
| C4 | No había ninguna verificación antes de hacer commit | `ceeb831` |
| C5 | `density` propia y externa parecían contradictorias | documentación |
| C6 | Archivos de documentación faltantes o duplicados | `ceeb831` y este commit |

## C1. Import roto en `src/api/main.py`

- **Síntoma:** en `06e5140`, `main.py` importaba `atlas_metrics_router`, pero el módulo versionado es
  `src/api/routers/atlas_metrics.py`. Al hacer checkout de ese commit, la API fallaba con `ImportError` y no arrancaba.
- **Causa:** la corrección del nombre estaba en la copia de trabajo, pero no entró en el commit. Además,
  `origin/dev` ya tenía el commit roto.
- **Cambio:** un commit que solo corrige la línea del import y la de `include_router`.
- **Verificación:** `git show HEAD:src/api/main.py` ya no contiene `atlas_metrics_router`, y
  `scripts/check_commit.sh` sobre `06e5140` reproduce el error (ver C4).
- No se reescribió el historial porque `06e5140` ya estaba publicado en `origin/dev`. El arreglo es un commit
  nuevo encima.

## C2. Genoma de reemplazo excluido del atlas

- **Síntoma:** `in_atlas` marcaba 2.223 genomas por red. CLAUDE.md, `auditoria_semana9.md` y las vistas dicen
  2.224 (2.220 representative + 3 forced + 1 replacement).
- **Causa:** el genoma `genome_id` 2224 (`GCF_002993285.1`, *Gordonia iterans*) tiene
  `selection = "replacement (GCF_050942165.1 suppressed in RefSeq 2026)"`. La comparación exacta
  `isin({"representative", "forced", "replacement"})` no lo reconocía.
- **Cambio:** se compara la primera palabra de `selection`.
  - `src/networks/atlas_metrics.py`: `own["selection"].str.split().str[0].isin(ATLAS_SELECTIONS)`.
  - `scripts/explore_metrics.py`: el mismo cambio en el filtro de la mediana de TF ubicables.
  - `frontend/src/utils/atlas.js`: nueva función `isAtlasSelection(selection)` con la misma regla.
    `ATLAS_SELECTIONS` todavía no se usa en ninguna vista. Las vistas actuales usan `in_atlas` de la API, que ya
    viene corregido.
  - CLAUDE.md documenta la regla.
- **Alcance revisado:** `src/validation/atlas.py` y los routers de `src/api` no filtran por `selection`. La
  validación no se ve afectada.
- **Verificación:** después de ejecutar `make metrics-atlas` otra vez, `in_atlas` da 2.224 en las 5 redes
  (`test_atlas_has_2224_genomes`, `test_replacement_genome_is_in_atlas`).
- **Efecto en resultados:** solo se suma un genoma a las medianas y percentiles del atlas
  (`/atlas/metrics/summary`). Las métricas por genoma no cambian.
- Queda una pregunta abierta al investigador: `preguntas_pendientes.md`, P4.

## C3. Trazabilidad de los resultados

- **Síntoma:** el primer `manifest.json` de `data/results/metrics/` registraba `git_commit: 16b243b`.
  `atlas_metrics.py` no existía en ese commit, porque el cálculo se hizo antes de `06e5140`.
- **Causa:** `git_commit()` registra `HEAD` aunque haya cambios sin commit, y nada avisaba.
- **Cambio:**
  - `src/networks/atlas_metrics.py` y `src/validation/atlas.py` tienen ahora `git_dirty()`, que ejecuta
    `git status --porcelain --untracked-files=no`. El resultado se guarda como `git_dirty` en `manifest.json`
    y, si es `true`, se muestra un aviso al iniciar.
  - CLAUDE.md: `make metrics-atlas` y `make validate-atlas` se ejecutan con el árbol limpio.
- **Nueva ejecución:** `make metrics-atlas` sobre `ceeb831` con el árbol limpio
  (log en `logs/metrics_atlas_semana11.log`). El manifiesto queda así: `created_at 2026-10-15T13:42:38+00:00`,
  `git_commit ceeb831`, `git_dirty false`.
- **Verificación:** `test_manifest_is_traceable`. Los valores de control de E. coli no cambiaron (118 / 342 / 485).
- **Validación (19-10-2026):** se ejecutó `make validate-atlas` otra vez con el árbol limpio
  (`logs/validate_atlas_semana11.log`). El manifiesto quedó con `git_commit 63469d5` y `git_dirty false`. `summary.tsv` es
  **idéntico** al de la semana 10 (diferencia máxima 0,0 en las 20 filas), así que las cifras de `validacion_semana10.md`
  siguen valiendo. Ahora lo comprueba `tests/test_api_atlas_validation.py`: control de balanced 0,612 / 0,332 / 0,431,
  `balanced` como mejor F1 y manifiesto trazable.

## C4. Verificación antes de cada commit

- **Problema:** nada impedía hacer commit de un estado en que la API no arrancaba. La comprobación existía
  solo sobre la copia de trabajo, que es justamente donde el error no aparecía.
- **Cambio (`ceeb831`):**
  - `scripts/check_commit.sh`. Por defecto exporta el **índice** a un directorio temporal
    (`git checkout-index`) y comprueba ahí:
    1. que `src.api.main` importa;
    2. que `src/api` no usa `get_db` ni `get_engine`;
    3. si hay cambios en `frontend/`, que `vite build` compila.

    Con `--worktree` hace lo mismo sobre la copia de trabajo.
  - `scripts/githooks/pre-commit` (versionado) llama al script. Se activa con `make hooks`
    (`git config core.hooksPath scripts/githooks`) una vez por clon. En este clon ya está activado.
  - `make check`: el script con `--worktree` y luego `pytest`. `make test`: solo `pytest`.
  - `tests/test_api_atlas_metrics.py` y `pytest.ini`: pruebas de humo con `TestClient`, que no necesitan levantar
    uvicorn. Se omiten si falta `data/results/metrics/`.
  - Se instalaron en el entorno `bioinfo` `pytest 9.1.1` y `httpx 0.28.1`, que `TestClient` necesita.
    `environment.yml` no está versionado (`.gitignore`), así que hay que instalarlos a mano en otro clon:
    `pip install pytest httpx`. Starlette prefiere `httpx2` y avisa de que `httpx` está obsoleto. El aviso se
    filtra en `pytest.ini` y no afecta a las pruebas.
- **Verificación:**
  - Con un índice temporal igual a `06e5140` (`GIT_INDEX_FILE=… git read-tree 06e5140`), el script falla con
    `ImportError: cannot import name 'atlas_metrics_router'` y código de salida 1. Habría bloqueado el commit roto.
  - Sobre el estado actual da `OK`. El hook se ejecutó en el commit `ceeb831` y en el de este documento.
  - `pytest`: 11 pruebas pasan.

## C5. `density` propia frente a `network_metrics`

- **Observación:** en `metrics_vs_external.tsv`, la mediana del cociente propia / externa de `density` va de
  3,7 a 170 según la red, con Spearman negativo (−0,21 a −0,61).
- **Causa (resuelta):** son definiciones distintas.
  - Externa: `n_edges / (n_tf × n_operons)`, con **todos** los operones del genoma. Se comprobó en las 6.427
    filas de `network_metrics` (tolerancia relativa 10⁻³).
  - Propia: `n_edges / (n_tf × n_targets)`, solo con los operones diana (`manifest.json`, `graph_definition`).
    Mide qué fracción de las combinaciones TF × diana posibles se usa. No depende del tamaño del genoma.
- **Por qué la correlación es negativa:** la densidad externa crece con la fracción del genoma que está regulada.
  La propia baja cuando un genoma tiene muchas dianas con pocos reguladores cada una. Es una diferencia de
  definición, no un error del cálculo.
- **Lo que no se resolvió:** `n_edges` y `n_tf` externos no se pueden reproducir con las aristas de la caché
  (ver `preguntas_pendientes.md`, P1). La relación de `n_edges` propio / externo (alrededor de 0,54 a 0,60)
  no se explica solo por agrupar las aristas por (TF, operón).
- **Decisión:** no se cambia la definición propia. Se explica en `metricas_semana11.md`, y la vista
  Metrics/Comparison debe mostrar la densidad externa con su definición y no compararla directamente.

## C6. Documentación

- `docs/Claude.md` era una copia idéntica byte a byte de `CLAUDE.md` (comprobado con `cmp`) y no tenía
  seguimiento. Se eliminó.
- Se creó `docs/preguntas_pendientes.md`, que CLAUDE.md citaba pero no existía.
- `docs/contexto_regulomeatlas.md` también lo cita CLAUDE.md y no está en el repositorio. Lo agregará
  el usuario.

## Estado final

```text
73c7a34 fix(api): importar el router atlas_metrics con su nombre real
a1b5dfc fix(metrics): contar el genoma replacement en el atlas; registrar git_dirty
ceeb831 chore: make check, hook pre-commit versionado y pruebas de humo de la API
(este)  docs: correcciones de la semana 11 y preguntas pendientes
```

- `make check`: OK (API importa, sin `get_db`, frontend compila, 11 pruebas pasan).
- `data/results/metrics/manifest.json`: `ceeb831`, `git_dirty false`.
- Rama `dev` publicada en `origin/dev` sin reescribir el historial.

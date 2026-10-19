# RegulomeAtlas — instrucciones para Claude Code

Proyecto de título (Ingeniería Informática, UDLA / NIDS). Dashboard, validación y métricas sobre redes de
regulación transcripcional bacteriana (TF → operón) en 2.224 genomas. El usuario (Yerko, `ymoscoso`) es el
desarrollador; las redes y la base las generó un investigador con un pipeline externo al que no hay acceso.

Contexto completo: `docs/contexto_regulomeatlas.md`. Léelo al empezar una tarea que no sea trivial.
Validación: `docs/validacion_semana10.md`. Métricas y comparación: `docs/metricas_semana11.md`.
Robustez: `docs/robustez_semana12.md`.
Preguntas abiertas: `docs/preguntas_pendientes.md`.
**Índice de toda la documentación y bitácora: `docs/README.md`.** Cada documento nuevo y cada bloque de trabajo se
registra ahí, y al terminar una tarea se le dice al usuario dónde quedó documentada.

## Entorno

- Servidor `devastator` (Ubuntu 22.04), raíz del proyecto `~/proyecto`, rama de trabajo `dev`.
- Conda: entorno `bioinfo` para scripts y pipeline. Scripts Python con `PYTHONPATH=.` desde la raíz.
- Sin `tmux`: procesos largos con `nohup … > log 2>&1 &`.
- Backend: `uvicorn src.api.main:app --host 0.0.0.0 --port 8000 --reload`. Frontend: `cd frontend && npm run dev`.
- MariaDB `regulon_atlas`: el usuario solo tiene **SELECT**. Nunca intentar crear, modificar ni cargar tablas.
  La base solo se usa para regenerar la caché (`make cache-atlas`, `make cache-genes`).

## Reglas

- **Nunca leer, mostrar ni copiar** `.env` ni `~/.my.cnf` (credenciales).
- **La API no consulta MariaDB**: solo lee `data/cache/atlas/*.parquet` y `data/results/`. Ningún archivo de
  `src/api` debe usar `get_db` ni `get_engine`.
- **Calcular offline, servir resultados**: el cálculo pesado va en un módulo con regla de `make`; la API solo lee.
- **No inventar métodos de API**: antes de escribir un componente, leer `frontend/src/services/api.js` y la forma
  real de la respuesta (con `curl` contra `localhost:8000`).
- **Nada de `except: pass`.** Los errores se reportan o se propagan.
- **Verificar integridad**: después de exportar o calcular, comparar conteos con la fuente y documentar diferencias.
- **Explorar antes de construir**: un script en `scripts/explore_*.py` fija las decisiones antes del módulo final.
- Componentes nuevos: replicar el patrón de un archivo que ya funciona (`useState`/`useEffect`, `Loader2`,
  errores en rojo, `NetworkSelector`, `OrganismSearch`, `utils/atlas.js`).
- Texto visible del dashboard y mensajes de error de la API en **inglés**. Documentación y comentarios en **español**.
- No versionar datos generados (`data/cache/`, `data/results/`, `data/audit/*.tsv`).
- Commits en `dev`; los bloques terminados se fusionan a `main` con una etiqueta (`semanaNN-tema`).
- **Antes de cada commit**: `make check` (la API importa, sin `get_db` en `src/api`, el frontend compila y pasan
  las pruebas de `tests/`). El hook `pre-commit` (`make hooks`, una vez por clon) revisa el **índice**, no la copia
  de trabajo. No usar `--no-verify` sin avisar.
- **Resultados trazables**: `make metrics-atlas` y `make validate-atlas` se ejecutan con el árbol limpio (todo
  con commit). Si `manifest.json` trae `git_dirty: true`, se repite el cálculo después del commit.

## Definiciones del dominio que no se deben cambiar sin preguntar

- Grafo: un nodo por TF (nombre normalizado en minúsculas) y uno por operón; una arista por (genoma, TF, operón),
  conservando la de mayor `confidence`. Las aristas apuntan a operones (D10).
- Redes: 1 validated, 2 high-precision, 3 balanced (por defecto), 4 permissive, 5 no-footprint.
- Genomas del atlas: `selection` en {representative, forced, replacement}. El resto (420) son auxiliares.
  Se compara **la primera palabra**: el genoma de reemplazo tiene `selection = "replacement (GCF_050942165.1
  suppressed in RefSeq 2026)"`. En el frontend, usar `in_atlas` de la API o `isAtlasSelection()` de `utils/atlas.js`.
- `motif_key`: `RGnnn` = regulog nnn de RegPrecise; `MX…` = PRODORIC.
- Validación: nivel TF → operón, universo `genome_tf`, recall sobre todo el gold standard, modos `all` e
  `independent` (sin autoevaluación).
- Métricas propias: `src/networks/atlas_metrics.py`. Las métricas jerárquicas (autorregulación, TF → TF) son solo
  cota inferior: el gen del TF se ubica por nombre en ~20 % de los casos.
- Comparación entre genomas: por taxón GTDB (`src/networks/atlas_comparison.py`), con los mismos genomas para la métrica
  propia y la externa; taxones con ≥ 5 genomas. La `density` externa usa otra definición (todos los operones del genoma).
- `network_metrics` y el benchmark D33 son externos: se muestran solo como referencia.

## Comandos

```bash
make cache-atlas      # caché parquet desde MariaDB (lento, usar nohup)
make cache-genes      # genes_all.parquet (9,44M genes)
make validate-atlas   # validación contra RegPrecise -> data/results/validation/
make metrics-atlas    # métricas NetworkX -> data/results/metrics/
make comparison-atlas # comparación por taxón -> data/results/comparison/ (después de metrics-atlas)
make robustness-atlas # robustez: entre redes + submuestreo -> data/results/robustness/ (~15 min, usar nohup)
make check            # verificaciones previas al commit + pytest
make hooks            # activa scripts/githooks/pre-commit (una vez por clon)
curl -s localhost:8000/api/v1/atlas/networks | python -m json.tool | head
```

## Valores de control

- E. coli K-12 (`GCF_000005845.2`) en balanced: 118 TF, 342 operones diana, 485 pares TF–operón.
- Métricas propias: 2.224 genomas con `in_atlas` en cada una de las 5 redes (`tests/test_api_atlas_metrics.py`).
- Comparación, balanced: 10 filos, 13 clases, 48 órdenes y 83 familias con ≥ 5 genomas (`tests/test_api_atlas_comparison.py`).
- Validación balanced, `all` / `genome_tf`: P = 0,612, R = 0,332, F1 = 0,431 (`tests/test_api_atlas_validation.py`).
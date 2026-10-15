# RegulomeAtlas — instrucciones para Claude Code

Proyecto de título (Ingeniería Informática, UDLA / NIDS). Dashboard, validación y métricas sobre redes de
regulación transcripcional bacteriana (TF → operón) en 2.224 genomas. El usuario (Yerko, `ymoscoso`) es el
desarrollador; las redes y la base las generó un investigador con un pipeline externo al que no hay acceso.

Contexto completo: `docs/contexto_regulomeatlas.md`. Léelo al empezar una tarea que no sea trivial.
Validación: `docs/validacion_semana10.md`. Preguntas abiertas: `docs/preguntas_pendientes.md`.

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

## Definiciones del dominio que no se deben cambiar sin preguntar

- Grafo: un nodo por TF (nombre normalizado en minúsculas) y uno por operón; una arista por (genoma, TF, operón),
  conservando la de mayor `confidence`. Las aristas apuntan a operones (D10).
- Redes: 1 validated, 2 high-precision, 3 balanced (por defecto), 4 permissive, 5 no-footprint.
- Genomas del atlas: `selection` en {representative, forced, replacement}. El resto (420) son auxiliares.
- `motif_key`: `RGnnn` = regulog nnn de RegPrecise; `MX…` = PRODORIC.
- Validación: nivel TF → operón, universo `genome_tf`, recall sobre todo el gold standard, modos `all` e
  `independent` (sin autoevaluación).
- Métricas propias: `src/networks/atlas_metrics.py`. Las métricas jerárquicas (autorregulación, TF → TF) son solo
  cota inferior: el gen del TF se ubica por nombre en ~20 % de los casos.
- `network_metrics` y el benchmark D33 son externos: se muestran solo como referencia.

## Comandos

```bash
make cache-atlas      # caché parquet desde MariaDB (lento, usar nohup)
make cache-genes      # genes_all.parquet (9,44M genes)
make validate-atlas   # validación contra RegPrecise -> data/results/validation/
make metrics-atlas    # métricas NetworkX -> data/results/metrics/
curl -s localhost:8000/api/v1/atlas/networks | python -m json.tool | head
```

## Valores de control

- E. coli K-12 (`GCF_000005845.2`) en balanced: 118 TF, 342 operones diana, 485 pares TF–operón.
- Validación balanced, `all` / `genome_tf`: P = 0,612, R = 0,332, F1 = 0,431.
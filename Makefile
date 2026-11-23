# RegulonAtlas: comandos del proyecto. `make help` lista los objetivos.
#
# Dos flujos:
#   - Atlas (semanas 9-12): caché de MariaDB (solo SELECT) -> validación, métricas, comparación, robustez y
#     línea base -> API -> dashboard. Es el flujo principal.
#   - MVP (semana 8, etiqueta mvp-semana8): pipeline propio sobre 8 genomas desde data/cache/mvp (versionado).
#     Parámetros: config/mvp_params.json. Genomas: config/mvp_genomes.txt.
# Los resultados se escriben en data/results/ (no versionado). Ejecutar con el árbol limpio (git_dirty: false).

PYTHON  ?= python
PARAMS  ?= config/mvp_params.json
RUN      = $(PYTHON) -m src.pipeline
CACHE    = data/cache/mvp
RESULTS  = data/results/mvp

.PHONY: help all atlas cache-atlas cache-genes cache-fimo validate-atlas metrics-atlas comparison-atlas \
        robustness-atlas baseline-atlas atlas-ready regulondb validate-regulondb ci-atlas adjusted-atlas \
        reliability-atlas mvp-point extensions api web check test test-ui hooks \
        mvp cache transfer_map networks metrics validation report clean

help:  ## Lista los objetivos
	@grep -E '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-18s %s\n", $$1, $$2}'

all: atlas  ## Todo el análisis del atlas (igual que make atlas). El MVP de 8 genomas se corre solo con make mvp

# ---------------------------------------------------------------- atlas: caché (MariaDB, solo SELECT)
cache-atlas:  ## Caché del atlas desde MariaDB -> data/cache/atlas/ (lento, usar nohup)
	PYTHONPATH=. $(PYTHON) scripts/export_atlas_cache.py

cache-genes:  ## genes_all.parquet (9,44 M genes) para las métricas propias
	PYTHONPATH=. $(PYTHON) scripts/export_genes_cache.py

cache-fimo:  ## fimo_hits y transfer_map de los 312 genomas validables (línea base)
	PYTHONPATH=. $(PYTHON) scripts/export_fimo_cache.py

# ---------------------------------------------------------------- atlas: análisis (solo leen la caché)
atlas: atlas-ready  ## Todo el análisis del atlas en orden (~15 min; usar nohup)
	$(MAKE) validate-atlas
	$(MAKE) metrics-atlas
	$(MAKE) comparison-atlas
	$(MAKE) robustness-atlas
	$(MAKE) baseline-atlas

atlas-ready:  ## Revisión previa de make atlas/all: caché completa y árbol limpio (solo lee)
	@scripts/check_atlas_ready.sh

validate-atlas:  ## Validación de las 5 redes contra RegPrecise -> data/results/validation/
	PYTHONPATH=. $(PYTHON) src/validation/atlas.py --gold regprecise

metrics-atlas:  ## Métricas topológicas propias -> data/results/metrics/
	PYTHONPATH=. $(PYTHON) src/networks/atlas_metrics.py

comparison-atlas: data/results/metrics/atlas_metrics.parquet  ## Comparación entre taxones -> data/results/comparison/
	PYTHONPATH=. $(PYTHON) src/networks/atlas_comparison.py

robustness-atlas: data/results/metrics/atlas_metrics.parquet  ## Robustez (24 procesos, ~8 min) -> data/results/robustness/
	PYTHONPATH=. $(PYTHON) src/networks/atlas_robustness.py

baseline-atlas: data/cache/atlas/fimo_hits_validation.parquet  ## Línea base del pipeline propio -> data/results/baseline/
	PYTHONPATH=. $(PYTHON) src/networks/atlas_baseline.py

# ---------------------------------------------------------------- ampliaciones (excepciones E1-E7 del congelamiento)
# No forman parte de make all: leen los resultados congelados y escriben en carpetas propias.
extensions: validate-regulondb ci-atlas adjusted-atlas reliability-atlas mvp-point  ## Todas las ampliaciones

regulondb:  ## Descarga RegulonDB -> data/raw/regulondb/ (no versionado; uso académico)
	PYTHONPATH=. $(PYTHON) scripts/download_regulondb.py

validate-regulondb:  ## Validación en E. coli K-12 contra RegulonDB (requiere make regulondb)
	PYTHONPATH=. $(PYTHON) src/validation/atlas.py --gold regulondb
	PYTHONPATH=. $(PYTHON) src/validation/atlas.py --gold regulondb_strong

ci-atlas:  ## Intervalos de confianza de P, R y F1 -> data/results/validation_ci/
	PYTHONPATH=. $(PYTHON) src/validation/atlas_ci.py

adjusted-atlas:  ## Comparación entre taxones ajustada -> data/results/comparison_adjusted/
	PYTHONPATH=. $(PYTHON) src/networks/atlas_adjusted.py

reliability-atlas:  ## Precisión esperada por genoma -> data/results/reliability/
	PYTHONPATH=. $(PYTHON) src/networks/atlas_reliability.py

mvp-point:  ## MVP frente al atlas en los mismos 8 genomas -> data/results/validation_mvp/
	PYTHONPATH=. $(PYTHON) src/validation/atlas_mvp_point.py

data/cache/atlas/fimo_hits_validation.parquet:
	@echo "Falta la caché de fimo_hits. Ejecuta primero: make cache-fimo" && exit 1

data/results/metrics/atlas_metrics.parquet:
	@echo "Faltan las métricas propias. Ejecuta primero: make metrics-atlas" && exit 1

# ---------------------------------------------------------------- dashboard
api:  ## Backend en el puerto 8000 (http://localhost:8000/docs)
	uvicorn src.api.main:app --host 0.0.0.0 --port 8000 --reload

web:  ## Frontend de desarrollo (Vite, http://localhost:5173)
	cd frontend && npm run dev

# ---------------------------------------------------------------- calidad
check:  ## Antes de cada commit: API, sin get_db, frontend compila, ESLint, pytest e interfaz
	scripts/check_commit.sh --worktree
	PYTHONPATH=. $(PYTHON) -m pytest -q -rs
	scripts/check_ui.sh

test-ui:  ## Solo las pruebas de interfaz (Playwright, puertos 18000 y 15173)
	scripts/check_ui.sh

test:  ## Solo pytest (muestra las pruebas omitidas)
	PYTHONPATH=. $(PYTHON) -m pytest -q -rs

hooks:  ## Una vez por clon: activa el pre-commit versionado (revisa el índice)
	git config core.hooksPath scripts/githooks

# ---------------------------------------------------------------- MVP (semana 8)
cache:  ## MVP: caché desde MariaDB -> data/cache/mvp/ (ya versionado)
	$(RUN).export_cache --params $(PARAMS)

mvp: transfer_map networks metrics validation report  ## MVP: pipeline completo desde data/cache/mvp
	@echo "Listo. Informe: $(RESULTS)/report.md"

transfer_map: $(CACHE)/cache_manifest.json
	$(RUN).build_transfer_map --params $(PARAMS)

networks:
	$(RUN).build_networks --params $(PARAMS)

metrics:
	$(RUN).compute_metrics --params $(PARAMS)

validation:
	$(RUN).validate --params $(PARAMS)

report:
	$(RUN).report --params $(PARAMS)

$(CACHE)/cache_manifest.json:
	@echo "Falta el caché de datos ($(CACHE)). Ejecuta primero: make cache" && exit 1

clean:  ## MVP: borra data/results/mvp (no el caché)
	rm -rf $(RESULTS)

# Pipeline reproducible del MVP (propuesta de tesis, sección 5).
#
#   make cache   Exporta el caché de datos desde MariaDB (solo lectura). Una vez.
#   make mvp     Regenera todo desde el caché, sin conectarse a la base:
#                ortólogos -> redes -> métricas -> validación -> informe.
#   make api     Levanta el backend del dashboard.
#   make clean   Borra los resultados (no el caché).
#
# Parámetros: config/mvp_params.json. Genomas: config/mvp_genomes.txt.

PYTHON  ?= python
PARAMS  ?= config/mvp_params.json
RUN      = $(PYTHON) -m src.pipeline
CACHE    = data/cache/mvp
RESULTS  = data/results/mvp

.PHONY: all cache mvp transfer_map networks metrics validation report api clean check test hooks comparison-atlas robustness-atlas cache-fimo baseline-atlas

all: mvp

cache:
	$(RUN).export_cache --params $(PARAMS)

mvp: transfer_map networks metrics validation report
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

api:
	uvicorn src.api.main:app --host 0.0.0.0 --port 8000 --reload

clean:
	rm -rf $(RESULTS)

cache-atlas:
	PYTHONPATH=. python scripts/export_atlas_cache.py

validate-atlas:
	PYTHONPATH=. python src/validation/atlas.py --gold regprecise

cache-genes:
	PYTHONPATH=. python scripts/export_genes_cache.py

# fimo_hits y transfer_map solo de los 312 genomas validables (línea base, semana 12). Usar nohup.
cache-fimo:
	PYTHONPATH=. python scripts/export_fimo_cache.py

metrics-atlas:
	PYTHONPATH=. python src/networks/atlas_metrics.py

comparison-atlas: data/results/metrics/atlas_metrics.parquet
	PYTHONPATH=. python src/networks/atlas_comparison.py

# Submuestreo en paralelo (24 procesos por defecto; ~10-20 min las 5 redes). Usar nohup.
robustness-atlas: data/results/metrics/atlas_metrics.parquet
	PYTHONPATH=. python src/networks/atlas_robustness.py

# Línea base del pipeline propio (red de prueba, 312 genomas validables). Requiere make cache-fimo.
baseline-atlas: data/cache/atlas/fimo_hits_validation.parquet
	PYTHONPATH=. python src/networks/atlas_baseline.py

data/cache/atlas/fimo_hits_validation.parquet:
	@echo "Falta la caché de fimo_hits. Ejecuta primero: make cache-fimo" && exit 1

data/results/metrics/atlas_metrics.parquet:
	@echo "Faltan las métricas propias. Ejecuta primero: make metrics-atlas" && exit 1

# Verificaciones antes de commit/push (ver scripts/check_commit.sh).
check:
	scripts/check_commit.sh --worktree
	PYTHONPATH=. python -m pytest -q

test:
	PYTHONPATH=. python -m pytest -q

# Una vez por clon: activa el pre-commit versionado (revisa el índice, no la copia de trabajo).
hooks:
	git config core.hooksPath scripts/githooks

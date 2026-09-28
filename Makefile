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

.PHONY: all cache mvp transfer_map networks metrics validation report api clean

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
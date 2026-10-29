#!/usr/bin/env bash
# Revisión previa de `make atlas` / `make all` (semana 13): se detiene en el primer segundo, con un mensaje claro,
# si falta un archivo de la caché o si hay cambios sin commit. Así no falla a los 15 minutos ni deja resultados con
# git_dirty: true (sin trazabilidad). Solo lee: no modifica nada.
set -u

CACHE=data/cache/atlas
fallos=0

# Archivos que leen los análisis, agrupados por la regla de make que los genera.
revisar() {
  local regla=$1; shift
  local faltan=()
  for f in "$@"; do
    [ -s "$CACHE/$f" ] || faltan+=("$f")
  done
  if [ ${#faltan[@]} -gt 0 ]; then
    echo "[atlas] Falta la caché de 'make $regla' en $CACHE/: ${faltan[*]}"
    fallos=1
  fi
}

revisar cache-atlas manifest.json networks.parquet genomes.parquet motifs.parquet curated_regulons.parquet \
  regprecise_genome_map.parquet genes_validation.parquet network_metrics.parquet provenance.parquet \
  edges_net1.parquet edges_net2.parquet edges_net3.parquet edges_net4.parquet edges_net5.parquet
revisar cache-genes genes_all.parquet
revisar cache-fimo fimo_hits_validation.parquet transfer_map_validation.parquet validation_genomes.tsv

# Árbol limpio: los manifiestos registran el commit; con cambios sin commit ese commit no describe el código.
if ! cambios=$(git status --porcelain --untracked-files=no 2>/dev/null); then
  echo "[atlas] No es un repositorio git: los resultados no tendrían commit registrado."
  fallos=1
elif [ -n "$cambios" ]; then
  echo "[atlas] Hay cambios sin commit; haz commit antes de correr el análisis:"
  echo "$cambios" | sed 's/^/          /'
  fallos=1
fi

if [ $fallos -ne 0 ]; then
  echo "[atlas] Detenido antes de empezar: no se calculó ni se escribió nada."
  exit 1
fi
echo "[atlas] Caché completa y árbol limpio ($(git rev-parse --short HEAD)): se puede correr el análisis."

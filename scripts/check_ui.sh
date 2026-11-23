#!/usr/bin/env bash
# Pruebas de interfaz (Playwright) de make check. Usan los puertos 18000 y 15173 y una compilación temporal: no
# interfieren con la API y el frontend de desarrollo. Sin datos del atlas o sin Chromium se omiten con un aviso.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

if [[ ! -f data/results/metrics/atlas_metrics.parquet || ! -f data/cache/atlas/edges_net4.parquet ]]; then
  echo "[ui] OMITIDO: faltan la caché o los resultados del atlas."
  exit 0
fi
if ! (cd frontend && node -e "
  const { chromium } = require('@playwright/test');
  process.exit(require('fs').existsSync(chromium.executablePath()) ? 0 : 1);
"); then
  echo "[ui] OMITIDO: falta Chromium. Instalar con: cd frontend && npx playwright install chromium"
  exit 0
fi

if [[ -n "${PYTHON:-}" && "$PYTHON" != "python" ]]; then
  UI_PYTHON="$PYTHON"
elif [[ -x "$HOME/.conda/envs/bioinfo/bin/python" ]]; then
  UI_PYTHON="$HOME/.conda/envs/bioinfo/bin/python"
else
  UI_PYTHON="$(command -v python)"
fi

UI_TMP="$(mktemp -d)"
trap 'rm -rf -- "${UI_TMP:?}"' EXIT
export UI_PYTHON UI_TMP UI_API_PORT=18000 UI_WEB_PORT=15173

echo "[ui] compilando el frontend de prueba"
(cd frontend && VITE_API_URL="http://127.0.0.1:${UI_API_PORT}/api/v1" npx vite build --outDir "$UI_TMP/dist" --emptyOutDir --logLevel error)
echo "[ui] pruebas de interfaz"
(cd frontend && npx playwright test)
echo "[ui] OK"

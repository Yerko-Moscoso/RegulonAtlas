#!/usr/bin/env bash
# Verificaciones mínimas antes de un commit (las ejecuta scripts/githooks/pre-commit).
#
# Por defecto revisa el contenido del ÍNDICE (lo que va a quedar en el commit), no la
# copia de trabajo: así se detecta un commit que no arranca aunque el archivo local
# esté bien (el caso de 06e5140, main.py con atlas_metrics_router).
#
#   scripts/check_commit.sh              # índice (lo usa el hook)
#   scripts/check_commit.sh --worktree   # copia de trabajo (lo usa make check)
#
# Comprueba:
#   1. que la API importa (PYTHONPATH apuntando al snapshot revisado);
#   2. que ningún archivo de src/api usa get_db ni get_engine (regla de CLAUDE.md);
#   3. si hay cambios en frontend/, que el frontend compila (vite build).
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
MODE="${1:---staged}"

# Python del entorno bioinfo aunque el hook se ejecute fuera de conda.
if [[ -n "${PYTHON:-}" ]]; then
  PY="$PYTHON"
elif [[ "${CONDA_DEFAULT_ENV:-}" == "bioinfo" ]]; then
  PY="python"
elif [[ -x "$HOME/.conda/envs/bioinfo/bin/python" ]]; then
  PY="$HOME/.conda/envs/bioinfo/bin/python"
else
  PY="python"
fi

if [[ "$MODE" == "--worktree" ]]; then
  SRC="$ROOT"
  frontend_changed=1
else
  SRC="$(mktemp -d)"
  trap 'rm -rf "$SRC"' EXIT
  git -C "$ROOT" checkout-index -a --prefix="$SRC/"
  frontend_changed=$(git -C "$ROOT" diff --cached --name-only -- frontend/ | grep -c . || true)
fi

echo "[check] API importa ($MODE)"
(cd "$SRC" && PYTHONPATH=. "$PY" -W ignore -c "import src.api.main") || {
  echo "[check] ERROR: src.api.main no importa con el contenido revisado." >&2
  exit 1
}

echo "[check] src/api sin get_db/get_engine"
if grep -rnE "\bget_(db|engine)\b" "$SRC/src/api" --include=*.py; then
  echo "[check] ERROR: la API no debe consultar MariaDB (ver CLAUDE.md)." >&2
  exit 1
fi

if [[ "$frontend_changed" != "0" ]]; then
  echo "[check] frontend compila"
  if [[ "$SRC" != "$ROOT" ]]; then
    ln -s "$ROOT/frontend/node_modules" "$SRC/frontend/node_modules"
  fi
  (cd "$SRC/frontend" && npx vite build --outDir "$(mktemp -d)" --emptyOutDir --logLevel error) || {
    echo "[check] ERROR: el frontend no compila." >&2
    exit 1
  }
fi

echo "[check] OK"

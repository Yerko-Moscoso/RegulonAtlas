"""Exploración del estado del pipeline (semana 13), antes de escribir src/atlas_status.py.

Lee los manifest.json de la caché y de cada carpeta de resultados y comprueba, para cada etapa:
  - si el manifiesto existe y declara commit, fecha y git_dirty;
  - si el commit registrado existe en el historial de git (problema encontrado en las pruebas del MVP);
  - si los archivos que declara existen;
  - si su entrada coincide con la versión actual de lo que leyó (caché, métricas o fimo_hits).

Uso: PYTHONPATH=. python scripts/explore_status.py   (solo lee; no escribe nada)
"""
import json
import subprocess
from pathlib import Path

CACHE = Path("data/cache/atlas/manifest.json")
RESULTS = {
    "validation": Path("data/results/validation/regprecise"),
    "metrics": Path("data/results/metrics"),
    "comparison": Path("data/results/comparison"),
    "robustness": Path("data/results/robustness"),
    "baseline": Path("data/results/baseline"),
}


def commit_exists(commit):
    r = subprocess.run(["git", "cat-file", "-e", f"{commit}^{{commit}}"], capture_output=True)
    return r.returncode == 0


cache = json.loads(CACHE.read_text())
print("== Caché")
print("  claves:", sorted(cache))
print("  exportado:", cache.get("exportado"), "| commit registrado:", cache.get("git_commit", "NO REGISTRADO"))
for name, t in cache.get("tables", {}).items():
    print(f"  {name}: {t['rows']:,} filas, exportado {t['exported_at']}")

man = {k: json.loads((d / "manifest.json").read_text()) for k, d in RESULTS.items()}
for k, m in man.items():
    d = RESULTS[k]
    files = m.get("files", [])
    missing = [f for f in files if not (d / f).exists()]
    print(f"== {k}: commit {m['git_commit']} (en historial: {commit_exists(m['git_commit'])}), "
          f"dirty {m['git_dirty']}, creado {m['created_at']}, archivos {len(files)}, faltan {missing}")

print("== Coherencia con la entrada")
for k in ["validation", "metrics"]:
    used = man[k]["cache_manifest"]
    same = used.get("exportado") == cache.get("exportado") and used.get("tablas") == cache.get("tablas")
    print(f"  {k}: caché usada {used.get('exportado')} vs actual {cache.get('exportado')} -> al día: {same}")
for k in ["comparison", "robustness"]:
    print(f"  {k}: métricas usadas {man[k]['metrics_manifest']} vs actuales {man['metrics']['git_commit']} -> "
          f"al día: {man[k]['metrics_manifest'] == man['metrics']['git_commit']}")
fimo = cache["tables"]["fimo_hits_validation"]["exported_at"]
print(f"  baseline: creado {man['baseline']['created_at']} vs fimo exportado {fimo} -> "
      f"al día: {man['baseline']['created_at'] >= fimo}")

import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    // Reglas del React Compiler que marcan patrones intencionales del proyecto (no son errores):
    // - set-state-in-effect: el patrón de carga de todas las vistas (setLoading(true) + fetch en useEffect, CLAUDE.md);
    // - refs: RegulatoryNetwork guarda en refs el caché de posiciones del layout determinista (semana 9);
    // - preserve-manual-memoization: el compilador omite optimizar un useMemo de Fingerprints, sin efecto funcional.
    // Se dejan como advertencias para no ocultarlas; `make check` falla solo con errores.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
    },
  },
])

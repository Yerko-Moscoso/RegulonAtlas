import { defineConfig } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Pruebas de interfaz de make check (scripts/check_ui.sh). Usan puertos propios para no interferir con los servidores
// de desarrollo (8000 y 5173) y una compilación temporal del frontend.
const here = dirname(fileURLToPath(import.meta.url));
const API_PORT = process.env.UI_API_PORT ?? "18000";
const WEB_PORT = process.env.UI_WEB_PORT ?? "15173";
const OUTPUT = process.env.UI_TMP ?? resolve(here, ".ui-test");

export default defineConfig({
  testDir: "./tests/ui",
  outputDir: `${OUTPUT}/results`,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: [["line"]],
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    browserName: "chromium",
    viewport: { width: 1500, height: 950 },
    acceptDownloads: true,
  },
  webServer: [
    {
      command: `"${process.env.UI_PYTHON ?? "python"}" -m uvicorn src.api.main:app --host 127.0.0.1 --port ${API_PORT} --log-level warning`,
      cwd: resolve(here, ".."),
      env: { PYTHONDONTWRITEBYTECODE: "1" },
      url: `http://127.0.0.1:${API_PORT}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npx vite preview --outDir "${OUTPUT}/dist" --host 127.0.0.1 --port ${WEB_PORT} --strictPort`,
      cwd: here,
      url: `http://127.0.0.1:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});

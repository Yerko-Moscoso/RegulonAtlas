import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

// Pruebas de interfaz: recorren el dashboard real contra la API con los datos del atlas.
const VIEWS = ["dashboard", "organisms", "networks", "metrics", "fingerprints", "comparison", "robustness", "validation",
  "pipeline", "provenance"];
const ENGLISH = /\b(the|of|with|from|and|are|is|this|could|network|networks|genomes|edges|pairs|loading|show|click|median)\b/i;

const ORGANISM = /symbiont of /; // nombres de organismos: son datos y no se traducen

// El menú se recorre por posición para que funcione en ambos idiomas
async function openView(page, id) {
  await page.locator("aside nav button").nth(VIEWS.indexOf(id)).click();
  await page.waitForLoadState("networkidle");
  await expect(page.locator("main h1").first()).toBeVisible();
  await page.waitForTimeout(500);
}

function watchErrors(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
  page.on("response", (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
  return errors;
}

const graphState = (page) =>
  page.evaluate(() => {
    const host = [...document.querySelectorAll("main div")].find((d) => d._cyreg?.cy);
    const cy = host?._cyreg.cy;
    if (!cy) return null;
    const box = cy.nodes().renderedBoundingBox({ includeLabels: false });
    return { nodes: cy.nodes().length, inside: box.x1 >= -1 && box.y1 >= -1 && box.x2 <= cy.width() + 1 && box.y2 <= cy.height() + 1 };
  });

const visibleTexts = (page) =>
  page.evaluate(() => {
    const out = new Set();
    const roots = [document.querySelector("aside"), document.querySelector("header"), document.querySelector("main")];
    for (const root of roots) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = n.nodeValue.trim();
        if (text && n.parentElement.getClientRects().length && !n.parentElement.closest("[data-no-i18n]")) out.add(text);
      }
    }
    return [...out];
  });

test("título e ícono de RegulonAtlas", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("RegulonAtlas");
  const icon = await page.evaluate(async () => (await fetch(document.querySelector("link[rel=icon]").href)).text());
  expect(icon).toContain("#3A9D7C");
  expect(icon).not.toContain("863bff");
});

test("las 10 vistas cargan sin errores", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/");
  for (const view of VIEWS) await openView(page, view);
  expect(errors).toEqual([]);
});

test("la red queda encuadrada y la leyenda no la tapa", async ({ page }) => {
  await page.goto("/");
  await openView(page, "networks");
  await expect.poll(() => graphState(page)).toMatchObject({ nodes: 460, inside: true });
  const canvas = await page.getByTestId("network-canvas").boundingBox();
  const legend = await page.getByTestId("network-legend").boundingBox();
  expect(legend.y).toBeGreaterThanOrEqual(canvas.y + canvas.height - 1);

  const network = page.locator("main select").first();
  for (const id of ["1", "4", "3"]) {
    await network.selectOption(id);
    await page.waitForLoadState("networkidle");
    await expect.poll(async () => (await graphState(page))?.inside).toBe(true);
  }
  await page.setViewportSize({ width: 1280, height: 760 });
  await expect.poll(async () => (await graphState(page))?.inside).toBe(true);
});

test("la descarga desde Regulatory Networks incluye la imagen", async ({ page }) => {
  await page.goto("/");
  await openView(page, "networks");
  await expect.poll(() => graphState(page)).toMatchObject({ nodes: 460 });
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download network" }).click()]);
  expect(download.suggestedFilename()).toBe("RegulonAtlas_GCF_000005845.2_balanced.xlsx");
  expect((await readFile(await download.path())).includes("xl/media/")).toBe(true);
});

test("Data Provenance no muestra códigos de decisión", async ({ page }) => {
  await page.goto("/");
  await openView(page, "provenance");
  const text = await page.locator("main").innerText();
  expect(text).toContain("Regulator safeguard");
  expect(text).not.toMatch(/\bD(3|4|8|10|11|12)\b/);
});

test("todas las vistas se traducen al español", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/");
  await page.getByTestId("language-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  const pending = {};
  for (const view of VIEWS) {
    await openView(page, view);
    const more = page.getByRole("button", { name: "Mostrar detalles" });
    while ((await more.count()) > 0) await more.first().click(); // al abrir cada sección, su botón cambia de texto
    await page.waitForTimeout(200);
    const left = (await visibleTexts(page)).filter((t) => ENGLISH.test(t) && !ORGANISM.test(t));
    if (left.length) pending[view] = left;
    expect(await page.locator("main").innerText()).not.toMatch(/\p{L} [,.;](\s|$)/u);
  }
  expect(pending).toEqual({});
  expect(errors).toEqual([]);
});

test("el Excel se pide en el idioma activo", async ({ page }) => {
  await page.goto("/");
  await openView(page, "networks");
  await expect.poll(() => graphState(page)).toMatchObject({ nodes: 460 });
  await page.getByTestId("language-toggle").click();
  const [request, download] = await Promise.all([
    page.waitForRequest((r) => r.url().includes("/atlas/export/network/")),
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Descargar red" }).click(),
  ]);
  expect(new URL(request.url()).searchParams.get("lang")).toBe("es");
  expect(download.suggestedFilename()).toContain("balanced");
});

test("el idioma se recuerda, vuelve al inglés y no cambia los datos", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("main")).toContainText("Best F1");
  const english = await page.locator("main").innerText();

  await page.getByTestId("language-toggle").click();
  await expect(page.locator("main")).toContainText("Mejor F1");
  const spanish = await page.locator("main").innerText();
  expect(spanish).toContain("2.224");
  expect(spanish).toContain("0,431");
  expect(spanish).toContain("balanced");

  await page.reload();
  await expect(page.locator("main")).toContainText("Mejor F1");
  await openView(page, "networks");
  await expect(page.locator("main input").first()).toHaveValue("Escherichia coli str. K-12 substr. MG1655");

  await openView(page, "dashboard");
  await page.getByTestId("language-toggle").click();
  await expect(page.locator("main")).toContainText("Best F1");
  await expect.poll(() => page.locator("main").innerText()).toBe(english);
});

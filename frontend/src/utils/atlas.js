// Utilidades compartidas por las vistas que leen las redes reales del atlas
// (RegulatoryNetwork, Metrics y, más adelante, Validation/Comparison/Fingerprints).

export const DEFAULT_NETWORK = 3; // balanced: mejor F1 (D33)
export const DEFAULT_GENOME = "GCF_000005845.2"; // E. coli K-12 MG1655

// Genomas del atlas (selection en ATLAS_SELECTIONS); lo comprueba tests/test_api_atlas_metrics.py.
export const ATLAS_GENOMES = 2224;

// Valores de genomes.selection que forman el atlas (2.224 genomas).
// El resto (regprecise_source, chromosome_level, expression_validation) son auxiliares.
export const ATLAS_SELECTIONS = new Set(["representative", "forced", "replacement"]);

// selection puede traer una nota tras la categoría ("replacement (GCF_050942165.1 suppressed ...)"):
// se compara solo la primera palabra. Preferir el campo in_atlas de la API cuando venga en la respuesta.
export const isAtlasSelection = (selection) => ATLAS_SELECTIONS.has(String(selection ?? "").split(" ")[0]);

export const fmtInt = (n) => (n == null ? "—" : Number(n).toLocaleString("en-US"));
// Fecha legible de un manifiesto: "2026-10-19 12:05 UTC" (o solo la fecha si no trae hora).
export const fmtDateTime = (s) =>
  s ? String(s).replace("T", " ").slice(0, 16) + (String(s).length > 10 ? " UTC" : "") : "—";

export const fmtP = (p) => (p == null ? "—" : `1e${Math.round(Math.log10(p))}`);

// params.source viene en español desde la base ("... P=0,545 R=0,343 F1=0,421 ...");
// se extraen solo los números para mostrarlos en inglés.
export const parseBenchmark = (source) => {
  const m = source?.match(/P=([\d,.]+)\s+R=([\d,.]+)\s+F1=([\d,.]+)/);
  return m ? { p: m[1].replace(",", "."), r: m[2].replace(",", "."), f1: m[3].replace(",", ".") } : null;
};

export const selectClass =
  "text-sm border border-[#D9E2E7] rounded-lg px-2.5 py-1.5 bg-white text-[#334155] focus:outline-none focus:ring-1 focus:ring-[#3A9D7C] disabled:bg-gray-50 disabled:text-gray-400";

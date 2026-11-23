// Textos de la tabla provenance para el dashboard. La base no se modifica: aquí solo se traducen al inglés y se quitan
// los códigos de decisión (D3, D8...), que remiten a un registro externo inaccesible (misma regla de la excepción E8).
const TRANSLATIONS = {
  "embudo D3 + 3 forzadas D4": "Selection funnel + 3 forced references",
  "2.224 genomas seleccionados": "2,224 genomes selected",
  "GCF_050942165.1 suprimido -> GCF_002993285.1": "GCF_050942165.1 suppressed, replaced by GCF_002993285.1",
  "corrida merged D8": "Merged run",
  "7,27M proteinas anotadas": "7.27 M proteins annotated",
  "289 motivos TF MEME": "289 TF motifs (MEME)",
  "2730 regulogs; 1808 motivos TF; 434 RNA": "2,730 regulogs; 1,808 TF motifs; 434 RNA",
  "API REST muerta; ExportServlet": "REST API unavailable; ExportServlet",
  "CMs 43 familias": "CMs, 43 families",
  "guarda reguladores D10": "Regulator safeguard",
  D11: "",
  D12: "",
};

// Un valor nuevo sin traducción se muestra tal cual, pero nunca con un código de decisión.
export const provenanceText = (value) => {
  if (value == null) return "—";
  const text = TRANSLATIONS[value] ?? String(value).replace(/\s*\bD\d+\b/g, "").trim();
  return text || "—";
};

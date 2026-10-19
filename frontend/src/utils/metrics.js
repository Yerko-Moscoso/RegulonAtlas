// Nombre visible de cada métrica propia (make metrics-atlas), compartido por Metrics, Fingerprints,
// Comparison y Robustness para que la misma métrica se llame igual en todas las vistas.
// Cada vista decide su propio formato (decimales, porcentaje, escala).
// Definiciones: docs/metricas_semana11.md, sección 5.
export const METRIC_LABELS = {
  n_tf: "Transcription factors",
  n_targets: "Target operons",
  n_edges: "TF–operon pairs",
  n_target_genes: "Target genes",
  density: "Density",
  edges_per_tf: "Edges per TF",
  frac_multi_reg: "Multi-regulated targets",
  frac_genome_targeted: "Genome targeted",
  frac_largest: "Largest component",
  mean_out_degree: "Mean out-degree",
  median_out_degree: "Median out-degree",
  max_out_degree: "Max out-degree",
  mean_in_degree: "Mean in-degree",
  max_in_degree: "Max in-degree",
  out_degree_entropy: "Out-degree entropy",
  out_degree_gini: "Out-degree Gini",
  hub_share: "Hub share",
  n_components: "Connected components",
  tf_resolved_rate: "TFs located by gene name",
  n_autoreg: "Autoregulations",
  n_tf_tf_edges: "TF → TF edges",
};

export const metricLabel = (key) => METRIC_LABELS[key] ?? key;

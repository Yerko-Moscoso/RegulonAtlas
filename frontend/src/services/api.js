import axios from 'axios';

// Usamos la variable de entorno o localhost por defecto
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const api = {
  // === ORGANISMOS (catálogo de la caché del atlas) ===
  getGenomeByAccession: (accession) => apiClient.get(`/genomes/${accession}`),

  // === ATLAS (redes reales de la base, caché data/cache/atlas) ===
  getAtlasNetworks: () => apiClient.get('/atlas/networks'),

  getAtlasGenomes: (networkId) => apiClient.get(`/atlas/networks/${networkId}/genomes`),

  getAtlasGraph: (networkId, accession, { minConfidence = 0, maxEdges = 500 } = {}) =>
    apiClient.get(`/atlas/networks/${networkId}/graph/${accession}`, {
      params: { min_confidence: minConfidence, max_edges: maxEdges },
    }),

  getAtlasMetrics: (networkId, accession) =>
    apiClient.get(`/atlas/networks/${networkId}/metrics`, { params: accession ? { accession } : {} }),

  getAtlasProvenance: () => apiClient.get('/atlas/provenance'),
  // Estado del pipeline: manifiestos de la caché y de cada resultado (semana 13)
  getAtlasStatus: () => apiClient.get('/atlas/status'),

  // === VALIDACIÓN DEL ATLAS (resultados de make validate-atlas) ===
  getAtlasValidationManifest: (gold = 'regprecise') =>
    apiClient.get('/atlas/validation/manifest', { params: { gold } }),

  getAtlasValidationSummary: (gold = 'regprecise', { mode, universe } = {}) =>
    apiClient.get('/atlas/validation/summary', { params: { gold, mode, universe } }),

  getAtlasValidationCurve: (networkId, mode = 'all', gold = 'regprecise') =>
    apiClient.get('/atlas/validation/curve', { params: { gold, network_id: networkId, mode } }),

  getAtlasValidationBreakdown: (kind, networkId, mode = 'all', gold = 'regprecise') =>
    apiClient.get(`/atlas/validation/breakdown/${kind}`, { params: { gold, network_id: networkId, mode } }),

  getAtlasValidationGenomes: (networkId, mode = 'all', { accession, limit = 500, gold = 'regprecise' } = {}) =>
    apiClient.get('/atlas/validation/genomes', { params: { gold, network_id: networkId, mode, accession, limit } }),

    // === MÉTRICAS PROPIAS DEL ATLAS (resultados de make metrics-atlas) ===
  getAtlasOwnMetrics: (networkId, { accession, atlasOnly = false, withEdgesOnly = false } = {}) =>
    apiClient.get('/atlas/metrics', {
      params: { network_id: networkId, accession, atlas_only: atlasOnly, with_edges_only: withEdgesOnly },
    }),

  getAtlasMetricsDefinitions: () => apiClient.get('/atlas/metrics/definitions'),

  getAtlasMetricsSummary: (networkId, atlasOnly = true) =>
    apiClient.get('/atlas/metrics/summary', { params: { network_id: networkId, atlas_only: atlasOnly } }),

  getAtlasMetricsVsExternal: (networkId) =>
    apiClient.get('/atlas/metrics/compare-external', { params: { network_id: networkId } }),

  getAtlasOwnMetricsForGenomes: (networkId, accessions) => {
    const params = new URLSearchParams({ network_id: networkId });
    accessions.forEach((acc) => params.append('accessions', acc));
    return apiClient.get(`/atlas/metrics/genomes?${params.toString()}`);
  },

  // === COMPARACIÓN ENTRE TAXONES (resultados de make comparison-atlas) ===
  // level: phylum | class | order | family
  getAtlasComparisonManifest: () => apiClient.get('/atlas/comparison/manifest'),

  getAtlasComparisonTaxa: (networkId, level = 'phylum', metric) =>
    apiClient.get('/atlas/comparison/taxa', { params: { network_id: networkId, level, metric } }),

  getAtlasComparisonTests: (networkId, level) =>
    apiClient.get('/atlas/comparison/tests', { params: { network_id: networkId, level } }),

  // === ROBUSTEZ DE LAS MÉTRICAS (resultados de make robustness-atlas) ===
  // strategy: random | degree_biased | low_confidence
  getAtlasRobustnessManifest: () => apiClient.get('/atlas/robustness/manifest'),

  getAtlasRobustnessNesting: () => apiClient.get('/atlas/robustness/nesting'),

  getAtlasRobustnessBetween: (metric) => apiClient.get('/atlas/robustness/between', { params: { metric } }),

  getAtlasRobustnessFootprint: () => apiClient.get('/atlas/robustness/footprint'),

  getAtlasRobustnessSubsampling: (networkId, strategy) =>
    apiClient.get('/atlas/robustness/subsampling', { params: { network_id: networkId, strategy } }),

  getAtlasRobustnessGenome: (networkId, accession, strategy) =>
    apiClient.get('/atlas/robustness/subsampling/genome', { params: { network_id: networkId, accession, strategy } }),

  // === LÍNEA BASE DEL PIPELINE PROPIO (resultados de make baseline-atlas; 312 genomas validables) ===
  getAtlasBaselineManifest: () => apiClient.get('/atlas/baseline/manifest'),

  getAtlasBaselineSummary: (mode, universe) =>
    apiClient.get('/atlas/baseline/summary', { params: { mode, universe } }),

  getAtlasBaselineReproduction: () => apiClient.get('/atlas/baseline/reproduction'),

  // === SISTEMA ===
  getHealth: () => {
    return apiClient.get('/health');
  }
};
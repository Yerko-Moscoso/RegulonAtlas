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
  // === ORGANISMOS ===
  getGenomes: (skip = 0, limit = 100) => {
    // Es CRÍTICO enviar skip y limit como 'params' para que Axios los ponga en la URL
    return apiClient.get('/genomes/', { params: { skip, limit } });
  },
  
  // Ficha completa (taxonomía, tamaño, genes, operones, TF, aristas, curadas).
  getGenomeByAccession: (accession) => {
    return apiClient.get(`/genomes/${accession}`);
  },

  // Solo los genomas pedidos, con su ficha completa. Usar en vez de
  // getGenomes(0, 3000) + filtro en el navegador.
  getGenomesByAccessions: (accessions) => {
    const params = new URLSearchParams();
    accessions.forEach((acc) => params.append('accessions', acc));
    return apiClient.get(`/genomes/?${params.toString()}`);
  },

  // === REDES REGULATORIAS (GRAFOS) ===
  getNetworkGraph: (accession) => {
    return apiClient.get(`/graphs/${accession}`);
  },

  // === MÉTRICAS (OE4 y OE5) ===
  getValidationMetrics: (accession) => {
    return apiClient.get(`/metrics/validation/${accession}`);
  },
  
  getTopologyMetrics: (accession) => {
    return apiClient.get(`/metrics/topology/${accession}`);
  },

  // Métricas de varios genomas en una sola llamada (?accessions=A&accessions=B).
  // Se arma la query a mano porque axios, por defecto, serializa los arrays
  // como accessions[]=A, que FastAPI no reconoce.
  getTopologySummary: (accessions) => {
    const params = new URLSearchParams();
    accessions.forEach((acc) => params.append('accessions', acc));
    return apiClient.get(`/metrics/topology-summary?${params.toString()}`);
  },

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

  // === SISTEMA ===
  getHealth: () => {
    return apiClient.get('/health');
  }
};
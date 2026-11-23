import axios from 'axios';
import { getLanguage } from '../i18n/translator';

// Usamos la variable de entorno o localhost por defecto
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Solo los métodos que usan las vistas. La API tiene además endpoints de manifiesto, definiciones y resumen
// (/atlas/*/manifest, /atlas/metrics/definitions, /summary, /genomes) que no usa el frontend (revisión de la semana 13, C4).
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

  // === DESCARGAS EN EXCEL (E9) ===
  // POST solo para enviar las imágenes dibujadas en el navegador; la API no guarda nada
  downloadOrganismReport: (accession, images = []) =>
    apiClient.post(`/atlas/export/organism/${accession}`, { images }, {
      params: { lang: getLanguage() }, // el Excel sale en el idioma activo
      responseType: 'blob',
    }),

  downloadNetworkReport: (networkId, accession, { minConfidence = 0, image = null } = {}) =>
    apiClient.post(`/atlas/export/network/${networkId}/${accession}`, { images: image ? [image] : [] }, {
      params: { min_confidence: minConfidence, lang: getLanguage() },
      responseType: 'blob',
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

  // Cobertura de la validación: todos los genomas y solo los del atlas
  getAtlasValidationCoverage: () => apiClient.get('/atlas/validation/coverage'),

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

  getAtlasMetricsVsExternal: (networkId) =>
    apiClient.get('/atlas/metrics/compare-external', { params: { network_id: networkId } }),

  // === COMPARACIÓN ENTRE TAXONES (resultados de make comparison-atlas) ===
  // level: phylum | class | order | family
  getAtlasComparisonTaxa: (networkId, level = 'phylum', metric) =>
    apiClient.get('/atlas/comparison/taxa', { params: { network_id: networkId, level, metric } }),

  getAtlasComparisonTests: (networkId, level) =>
    apiClient.get('/atlas/comparison/tests', { params: { network_id: networkId, level } }),

  // === ROBUSTEZ DE LAS MÉTRICAS (resultados de make robustness-atlas) ===
  // strategy: random | degree_biased | low_confidence
  getAtlasRobustnessNesting: () => apiClient.get('/atlas/robustness/nesting'),

  getAtlasRobustnessBetween: (metric) => apiClient.get('/atlas/robustness/between', { params: { metric } }),

  getAtlasRobustnessFootprint: () => apiClient.get('/atlas/robustness/footprint'),

  getAtlasRobustnessSubsampling: (networkId, strategy) =>
    apiClient.get('/atlas/robustness/subsampling', { params: { network_id: networkId, strategy } }),

  getAtlasRobustnessGenome: (networkId, accession, strategy) =>
    apiClient.get('/atlas/robustness/subsampling/genome', { params: { network_id: networkId, accession, strategy } }),

  // === LÍNEA BASE DEL PIPELINE PROPIO (resultados de make baseline-atlas; 312 genomas validables) ===
  getAtlasBaselineSummary: (mode, universe) =>
    apiClient.get('/atlas/baseline/summary', { params: { mode, universe } }),

  getAtlasBaselineReproduction: () => apiClient.get('/atlas/baseline/reproduction'),

  // === AMPLIACIONES DE LA V1.0 (make extensions; excepciones E1-E7 del congelamiento) ===
  getValidationCI: (scheme = 'family', mode) =>
    apiClient.get('/atlas/extensions/validation-ci', { params: { scheme, mode } }),

  getF1Differences: (scheme = 'family', mode) =>
    apiClient.get('/atlas/extensions/f1-differences', { params: { scheme, mode } }),

  getMvpPoints: (mode = 'all') => apiClient.get('/atlas/extensions/mvp-points', { params: { mode } }),

  getAdjustedTaxa: (networkId, level, metric) =>
    apiClient.get('/atlas/extensions/adjusted/taxa', { params: { network_id: networkId, level, metric } }),

  getAdjustedTests: (networkId, level, metric) =>
    apiClient.get('/atlas/extensions/adjusted/tests', { params: { network_id: networkId, level, metric } }),

  getReliability: (accession, networkId) =>
    apiClient.get('/atlas/extensions/reliability', { params: { accession, network_id: networkId } }),

  getReliabilityCalibration: () => apiClient.get('/atlas/extensions/reliability/calibration'),

  // === SISTEMA ===
  getHealth: () => {
    return apiClient.get('/health');
  }
};
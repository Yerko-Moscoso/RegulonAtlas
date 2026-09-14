import axios from 'axios';

// Instancia base apuntando al servidor FastAPI local
const apiClient = axios.create({
  baseURL: 'http://localhost:8000/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

export const api = {
  // Endpoints del Sistema
  checkHealth: () => apiClient.get('/health'),

  // Endpoints de Tablas MariaDB
  getGenomes: (skip = 0, limit = 50) =>
    apiClient.get(`/genomes/?skip=${skip}&limit=${limit}`),

  getMotifs: (skip = 0, limit = 50) =>
    apiClient.get(`/motifs/?skip=${skip}&limit=${limit}`),

  // Endpoints de Grafos y Topología
  // params opcional: { threshold: 1e-6, leader_only: true }
  getNetworkGraph: (genomeAcc, params = {}) =>
    apiClient.get(`/graphs/${genomeAcc}`, { params }),

  getValidationMetrics: (genomeAcc) =>
    apiClient.get(`/metrics/validation/${genomeAcc}`),
  
  getFingerprintRadar: () => apiClient.get('/fingerprints/radar'),
  
  getFingerprintHeatmap: () => apiClient.get('/fingerprints/heatmap'),

};


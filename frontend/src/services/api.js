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
  
  getGenomeByAccession: (accession) => {
    return apiClient.get(`/genomes/${accession}`);
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

  // === SISTEMA ===
  getHealth: () => {
    return apiClient.get('/health');
  }
};
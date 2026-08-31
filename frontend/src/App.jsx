import React, { useEffect, useState } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';
import axios from 'axios';
import { Activity, Network, CheckCircle2, AlertCircle } from 'lucide-react';

export default function App() {
  const [apiStatus, setApiStatus] = useState({ loading: true, healthy: false, version: '' });
  const [graphData, setGraphData] = useState(null);

  useEffect(() => {
    // 1. Probar conectividad con el endpoint de salud de FastAPI
    axios.get('http://localhost:8000/api/v1/health')
      .then(res => {
        setApiStatus({ loading: false, healthy: true, version: res.data.version });
      })
      .catch(() => {
        setApiStatus({ loading: false, healthy: false, version: 'No responde' });
      });

    // 2. Probar recepción de grafos desde FastAPI
    axios.get('http://localhost:8000/api/v1/graphs/test_regulon')
      .then(res => {
        const cytoscapeElements = [
          ...res.data.elements.nodes,
          ...res.data.elements.edges
        ];
        setGraphData(cytoscapeElements);
      })
      .catch(err => {
        console.error("Error al cargar grafo de prueba:", err);
      });
  }, []);

  const cytoscapeStylesheet = [
    {
      selector: 'node',
      style: {
        'background-color': '#2563eb',
        'label': 'data(label)',
        'color': '#1e293b',
        'font-size': '12px',
        'text-valign': 'center',
        'text-halign': 'center',
        'width': '40px',
        'height': '40px'
      }
    },
    {
      selector: 'edge',
      style: {
        'width': 2,
        'line-color': '#94a3b8',
        'target-arrow-color': '#94a3b8',
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier'
      }
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Encabezado y comprobación de Tailwind */}
        <header className="border-b border-slate-200 pb-4">
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Network className="text-blue-600 w-7 h-7" />
            Panel de Diagnóstico · Framework de Redes
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Verificación de integración entre FastAPI, React, Tailwind CSS y Cytoscape.js
          </p>
        </header>

        {/* Tarjeta de Estado de la API */}
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="text-slate-400 w-5 h-5" />
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Estado del Backend (FastAPI)</p>
              <p className="text-sm font-medium text-slate-700">
                {apiStatus.loading ? 'Comprobando conexión...' : (
                  apiStatus.healthy 
                    ? `Operativo · Versión ${apiStatus.version}` 
                    : 'Desconectado (Verifica que el puerto 8000 esté levantado)'
                )}
              </p>
            </div>
          </div>
          {apiStatus.healthy ? (
            <CheckCircle2 className="text-emerald-500 w-6 h-6" />
          ) : (
            <AlertCircle className="text-rose-500 w-6 h-6" />
          )}
        </div>

        {/* Visor de Cytoscape.js */}
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 space-y-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Lienzo Interactivo (Cytoscape.js)</p>
          <div className="w-full h-80 border border-slate-100 rounded bg-slate-50 overflow-hidden relative">
            {graphData ? (
              <CytoscapeComponent
                elements={graphData}
                style={{ width: '100%', height: '100%' }}
                stylesheet={cytoscapeStylesheet}
                layout={{ name: 'grid', padding: 50 }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                Cargando elementos del grafo...
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
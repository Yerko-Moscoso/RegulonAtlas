import { useState, useEffect, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Loader2 } from "lucide-react";
import { api } from "../services/api";
import { COMPARISON_ACCESSIONS } from "../constants/comparisonGenomes";

// Las 5 métricas topológicas básicas que devuelve /metrics/topology/{genome_acc}
// (mismo endpoint y mismos campos que usa Fingerprints.jsx, para que ambos
// módulos muestren siempre el mismo número para el mismo organismo).
const TOPOLOGY_METRICS = [
  { key: "nodos", label: "Nodes", decimals: 0, color: "text-[#3A9D7C]" },
  { key: "aristas", label: "Edges", decimals: 0, color: "text-[#3B82B8]" },
  { key: "densidad", label: "Density", decimals: 4, color: "text-[#55B8A5]" },
  { key: "grado_medio", label: "Average degree", decimals: 2, color: "text-[#3A9D7C]" },
  { key: "hubs", label: "Hubs (deg > 20)", decimals: 0, color: "text-[#3B82B8]" },
];

function formatValue(v, decimals) {
  if (v === null || v === undefined) return "—";
  return decimals === 0 ? v.toLocaleString() : v.toFixed(decimals);
}

export default function Metrics() {
  const [organismList, setOrganismList] = useState([]);
  const [organism, setOrganism] = useState("");
  const [loadingGenomes, setLoadingGenomes] = useState(true);

  // Tarjetas superiores: métricas topológicas reales sobre la red completa
  const [topology, setTopology] = useState(null);
  const [topologyStatus, setTopologyStatus] = useState("idle"); // idle | ok | no_data | error
  const [topologyLoading, setTopologyLoading] = useState(true);

  // Gráficos inferiores: requieren las aristas explícitas, que /graphs limita
  // a las 800 conexiones más fuertes (protección de memoria del navegador)
  const [rawNodes, setRawNodes] = useState([]);
  const [rawEdges, setRawEdges] = useState([]);
  const [graphError, setGraphError] = useState("");
  const [graphLoading, setGraphLoading] = useState(true);

  useEffect(() => {
    const fetchOrganisms = async () => {
      try {
        setLoadingGenomes(true);
        const response = await api.getGenomes(0, 3000);
        const fetchedOrgs = response.data.items
          .filter((item) => COMPARISON_ACCESSIONS.includes(item.accession))
          .map((item) => ({
            id: item.accession,
            label: item.ncbi_organism || item.accession,
          }))
          .sort((a, b) => a.label.localeCompare(b.label));
        
        setOrganismList(fetchedOrgs);
        if (fetchedOrgs.length > 0) {
          setOrganism(fetchedOrgs[0].id);
        }
      } catch (err) {
        console.error("Error fetching organisms:", err);
      } finally {
        setLoadingGenomes(false);
      }
    };
    fetchOrganisms();
  }, []);

  useEffect(() => {
    if (!organism) return;

    const fetchTopology = async () => {
      try {
        setTopologyLoading(true);
        const response = await api.getTopologyMetrics(organism);
        setTopology(response.data);
        setTopologyStatus("ok");
      } catch (err) {
        setTopology(null);
        setTopologyStatus(err.response?.status === 404 ? "no_data" : "error");
      } finally {
        setTopologyLoading(false);
      }
    };

    const fetchGraph = async () => {
      try {
        setGraphLoading(true);
        setGraphError("");
        const response = await api.getNetworkGraph(organism);
        const elements = response.data?.elements || { nodes: [], edges: [] };
        setRawNodes(elements.nodes || []);
        setRawEdges(elements.edges || []);
      } catch (err) {
        console.error("Error al cargar las aristas del grafo:", err);
        setGraphError(
          err.response?.status === 404
            ? `The graph for ${organism} hasn't been generated yet.`
            : "Could not load the network edges from the server."
        );
        setRawNodes([]);
        setRawEdges([]);
      } finally {
        setGraphLoading(false);
      }
    };

    fetchTopology();
    fetchGraph();
  }, [organism]);

  const computed = useMemo(() => {
    const degree = {};
    rawNodes.forEach((n) => { degree[n.data.id] = 0; });
    rawEdges.forEach((e) => {
      degree[e.data.source] = (degree[e.data.source] || 0) + 1;
      degree[e.data.target] = (degree[e.data.target] || 0) + 1;
    });

    const degreeValues = Object.values(degree);

    const degreeCounts = {};
    degreeValues.forEach((d) => { degreeCounts[d] = (degreeCounts[d] || 0) + 1; });
    const degreeDistribution = Object.entries(degreeCounts)
      .map(([deg, count]) => ({ degree: Number(deg), count }))
      .sort((a, b) => a.degree - b.degree)
      .slice(0, 20);

    const outDegreeByTf = {};
    rawEdges.forEach((e) => { outDegreeByTf[e.data.source] = (outDegreeByTf[e.data.source] || 0) + 1; });
    const tfConnectivity = Object.entries(outDegreeByTf)
      .map(([name, targets]) => ({ name, targets }))
      .sort((a, b) => b.targets - a.targets)
      .slice(0, 10);

    return { degreeDistribution, tfConnectivity };
  }, [rawNodes, rawEdges]);

  return (
    <div className="space-y-5 max-w-[1100px] relative">
      <div>
        <h1 className="text-2xl font-semibold text-[#334155]">Topological Metrics</h1>
        <p className="text-sm text-[#64748B] mt-1">
          Characterization of regulatory network architecture.
        </p>
      </div>

      <div className="bg-white border border-[#D9E2E7] rounded-xl p-3 flex flex-wrap items-center gap-4 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#64748B]">Organism</span>
          <select
            value={organism}
            onChange={(e) => setOrganism(e.target.value)}
            disabled={loadingGenomes}
            className="text-sm border border-[#D9E2E7] rounded-lg px-2.5 py-1.5 bg-white text-[#334155] focus:outline-none focus:ring-1 focus:ring-[#3A9D7C] min-w-[220px] disabled:bg-gray-50 disabled:text-gray-400"
          >
            {loadingGenomes ? (
              <option>Loading organisms...</option>
            ) : (
              organismList.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))
            )}
          </select>
        </div>
      </div>

      {/* Tarjetas superiores — red completa, sin tope de aristas */}
      <div className="relative">
        {topologyLoading && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-10 rounded-xl">
            <Loader2 className="w-6 h-6 text-[#3A9D7C] animate-spin" />
          </div>
        )}
        {!topologyLoading && topologyStatus !== "ok" ? (
          <div className="bg-[#FEF0F0] border border-[#F8BFBF] text-[#D96C6C] text-sm rounded-lg px-4 py-2.5">
            {topologyStatus === "no_data"
              ? "No regulatory interactions are loaded yet for this organism."
              : "Could not load topological metrics from the server."}
          </div>
        ) : (
          <div className="grid grid-cols-5 gap-3">
            {TOPOLOGY_METRICS.map((m) => (
              <div
                key={m.key}
                className="bg-white rounded-xl border border-[#D9E2E7] p-4 shadow-sm"
              >
                <div className={`text-xl font-bold font-mono ${m.color}`}>
                  {formatValue(topology?.[m.key], m.decimals)}
                </div>
                <div className="text-[11px] text-[#64748B] mt-1">{m.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {graphError && (
        <div className="bg-[#FEF0F0] border border-[#F8BFBF] text-[#D96C6C] text-sm rounded-lg px-4 py-2.5">
          {graphError}
        </div>
      )}

      <div className="grid grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-5 relative">
          {graphLoading && (
            <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-10 rounded-xl">
              <Loader2 className="w-6 h-6 text-[#3A9D7C] animate-spin" />
            </div>
          )}
          <h3 className="text-sm font-semibold text-[#334155] mb-1">Degree Distribution</h3>
          <p className="text-xs text-[#64748B] mb-4">
            Number of nodes per degree value, among the 800 strongest predicted edges
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={computed.degreeDistribution} margin={{ top: 0, right: 4, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="2 2" stroke="#F0F4F8" vertical={false} />
              <XAxis
                dataKey="degree"
                tick={{ fontSize: 10, fill: "#64748B" }}
                label={{ value: "Degree", position: "insideBottom", offset: -2, fontSize: 10, fill: "#64748B" }}
                height={30}
              />
              <YAxis tick={{ fontSize: 10, fill: "#64748B" }} />
              <Tooltip
                contentStyle={{ fontSize: 11, borderColor: "#D9E2E7", borderRadius: 8 }}
                formatter={(v) => [v, "Nodes"]}
              />
              <Bar dataKey="count" fill="#3A9D7C" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-5 relative">
          {graphLoading && (
            <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-10 rounded-xl">
              <Loader2 className="w-6 h-6 text-[#3A9D7C] animate-spin" />
            </div>
          )}
          <h3 className="text-sm font-semibold text-[#334155] mb-1">TF Connectivity Ranking</h3>
          <p className="text-xs text-[#64748B] mb-4">
            Top TFs by number of regulatory targets, among the 800 strongest predicted edges
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={computed.tfConnectivity} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 12 }}>
              <CartesianGrid strokeDasharray="2 2" stroke="#F0F4F8" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: "#64748B" }} />
              <YAxis
                dataKey="name"
                type="category"
                tick={{ fontSize: 9, fill: "#334155", fontFamily: "JetBrains Mono, monospace" }}
                width={90}
              />
              <Tooltip
                contentStyle={{ fontSize: 11, borderColor: "#D9E2E7", borderRadius: 8 }}
                formatter={(v) => [v, "Targets"]}
              />
              <Bar dataKey="targets" fill="#3B82B8" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

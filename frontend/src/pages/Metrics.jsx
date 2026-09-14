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

const THRESHOLD_OPTIONS = [
  { value: "0.0001", label: "1e-4 (~265k edges)" },
  { value: "0.00001", label: "1e-5 (~32k edges)" },
  { value: "0.000001", label: "1e-6 (~6.4k edges, recommended)" },
  { value: "0.0000001", label: "1e-7 (~2k edges)" },
  { value: "0.00000001", label: "1e-8 (~1k edges)" },
];

export default function Metrics() {
  const [organismList, setOrganismList] = useState([]);
  const [organism, setOrganism] = useState("");
  const [pvalueThreshold, setPvalueThreshold] = useState("0.000001");

  const [rawNodes, setRawNodes] = useState([]);
  const [rawEdges, setRawEdges] = useState([]);
  const [backendMetrics, setBackendMetrics] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchOrganisms = async () => {
      try {
        const response = await api.getGenomes(0, 100);
        const fetchedOrgs = response.data.items
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
      }
    };
    fetchOrganisms();
  }, []);

  useEffect(() => {
    if (!organism) return;

    const fetchGraph = async () => {
      try {
        setLoading(true);
        setError("");
        
        const response = await api.getNetworkGraph(organism, {
          threshold: parseFloat(pvalueThreshold) || 1e-6,
          leader_only: true,
        });
        
        const elements = response.data?.elements || { nodes: [], edges: [] };
        setRawNodes(elements.nodes || []);
        setRawEdges(elements.edges || []);
        setBackendMetrics(response.data?.metrics || {});
      } catch (err) {
        console.error("Error al cargar las métricas:", err);
        if (err.response?.status === 404) {
          setError(`The graph for ${organism} hasn't been generated yet.`);
        } else {
          setError("Could not load metrics from the server.");
        }
        setRawNodes([]);
        setRawEdges([]);
        setBackendMetrics({});
      } finally {
        setLoading(false);
      }
    };

    fetchGraph();
  }, [organism, pvalueThreshold]);

  const computed = useMemo(() => {
    const nodeCount = rawNodes.length;
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

  const topMetrics = [
    { label: "Nodes", value: backendMetrics.nodes || rawNodes.length, color: "text-[#3A9D7C]" },
    { label: "Edges", value: backendMetrics.edges || rawEdges.length, color: "text-[#3B82B8]" },
    { label: "Density", value: backendMetrics.density?.toFixed(4) || "0.0000", color: "text-[#55B8A5]" },
    { label: "Average degree", value: backendMetrics.avgDegree?.toFixed(2) || "0.00", color: "text-[#3A9D7C]" },
    { label: "Hubs (degree > 20)", value: backendMetrics.hubs || "0", color: "text-[#3B82B8]" },
    { label: "Components", value: backendMetrics.components ?? "—", color: "text-[#55B8A5]" },
  ];

  const networkStructure = [
    { label: "Clustering coef.", value: backendMetrics.clusteringCoefficient, description: "Mean local clustering" },
    { label: "Modularity (Q)", value: backendMetrics.modularity, description: "Newman–Girvan modularity" },
    { label: "Hierarchy index", value: backendMetrics.hierarchyIndex, description: "Degree–clustering correlation" },
    { label: "Conn. entropy", value: backendMetrics.connectivityEntropy, description: "Shannon entropy of degree dist." },
  ];

  return (
    <div className="space-y-5 max-w-[1100px] relative">
      {loading && (
        <div className="absolute inset-0 bg-white/70 flex flex-col items-center justify-center z-20 rounded-xl">
          <Loader2 className="w-8 h-8 text-[#3A9D7C] animate-spin mb-2" />
          <p className="text-sm text-[#64748B]">Loading metrics...</p>
        </div>
      )}

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
            className="text-sm border border-[#D9E2E7] rounded-lg px-2.5 py-1.5 bg-white text-[#334155] focus:outline-none focus:ring-1 focus:ring-[#3A9D7C] min-w-[220px]"
          >
            {organismList.length === 0 && <option>Loading...</option>}
            {organismList.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-[#64748B]">Threshold</span>
          <select
            value={pvalueThreshold}
            onChange={(e) => setPvalueThreshold(e.target.value)}
            className="text-sm border border-[#D9E2E7] rounded-lg px-2.5 py-1.5 bg-white text-[#334155] focus:outline-none focus:ring-1 focus:ring-[#3A9D7C]"
          >
            {THRESHOLD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="bg-[#FEF0F0] border border-[#F8BFBF] text-[#D96C6C] text-sm rounded-lg px-4 py-2.5">
          {error}
        </div>
      )}

      <div className="grid grid-cols-6 gap-3">
        {topMetrics.map((m) => (
          <div
            key={m.label}
            className="bg-white rounded-xl border border-[#D9E2E7] p-4 shadow-sm transition-colors"
          >
            <div className={`text-xl font-bold font-mono ${m.color}`}>{m.value}</div>
            <div className="text-[11px] text-[#64748B] mt-1">{m.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-5">
          <h3 className="text-sm font-semibold text-[#334155] mb-1">Degree Distribution</h3>
          <p className="text-xs text-[#64748B] mb-4">Number of nodes per degree value</p>
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

        <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-5">
          <h3 className="text-sm font-semibold text-[#334155] mb-1">TF Connectivity Ranking</h3>
          <p className="text-xs text-[#64748B] mb-4">Top TFs by number of regulatory targets</p>
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

      <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-[#334155]">Network Structure</h3>
            <p className="text-xs text-[#64748B]">Structural and spectral properties</p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4">
          {networkStructure.map((m) => (
            <div
              key={m.label}
              className="rounded-lg border bg-[#F7FAFC] border-[#D9E2E7] p-4 transition-colors"
            >
              <div className="text-xl font-bold font-mono text-[#334155] mb-1">
                {m.value !== undefined ? m.value : "—"}
              </div>
              <div className="text-xs font-medium text-[#334155] mb-1">{m.label}</div>
              <div className="text-[10px] text-[#64748B]">{m.description}</div>
              <div className="mt-3 h-1.5 bg-[#E2E8F0] rounded-full">
                <div
                  className="h-full bg-[#3A9D7C] rounded-full"
                  style={{ width: `${m.value !== undefined ? Math.min(m.value * 100, 100) : 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
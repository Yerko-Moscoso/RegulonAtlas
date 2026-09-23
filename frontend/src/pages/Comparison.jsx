import { useState, useEffect } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Loader2 } from "lucide-react";
import { api } from "../services/api";

const GROUP_COLORS = {
  Proteobacteria: "#3A9D7C",
  Firmicutes: "#3B82B8",
};

const projectionMethods = ["PCA", "t-SNE"];
const taxGroups = ["All", "Proteobacteria", "Firmicutes"];

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white border border-[#D9E2E7] rounded-lg p-3 shadow-lg text-xs">
      <div className="font-semibold text-[#334155] mb-1">{d.organism}</div>
      <div className="text-[#64748B] space-y-0.5">
        <div>Group: {d.group}</div>
        <div>PC1: <span className="font-mono text-[#334155]">{d.pc1?.toFixed(2)}</span></div>
        <div>PC2: <span className="font-mono text-[#334155]">{d.pc2?.toFixed(2)}</span></div>
        <div>Genome: <span className="font-mono text-[#334155]">{d.genomeSize} Mb</span></div>
      </div>
    </div>
  );
}

export default function Comparison({ navigate }) {
  const [method, setMethod] = useState("PCA");
  const [taxFilter, setTaxFilter] = useState("All");

  // Estados de datos reales
  const [pcaData, setPcaData] = useState([]);
  const [clusters, setClusters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchComparisonData = async () => {
      try {
        setLoading(true);
        setError("");
        // TODO: ajustar a tu endpoint real, se asume:
        // GET /api/comparison/projection?method=pca|tsne
        const [projectionRes, clustersRes] = await Promise.all([
          api.getOrganismProjection(method.toLowerCase()),
          api.getRegulatoryClusters(),
        ]);

        setPcaData(projectionRes.data?.points || []);
        setClusters(clustersRes.data?.clusters || []);
      } catch (err) {
        console.error("Error loading comparison data:", err);
        setError("The organism comparison data could not be loaded.");
        setPcaData([]);
        setClusters([]);
      } finally {
        setLoading(false);
      }
    };

    fetchComparisonData();
  }, [method]);

  const filtered = pcaData.filter((d) => taxFilter === "All" || d.group === taxFilter);

  return (
    <div className="space-y-6 max-w-[1100px]">
      <div>
        <h1 className="text-2xl font-semibold text-[#334155]">Organism Comparison</h1>
        <p className="text-sm text-[#64748B] mt-1">
          Compare bacterial regulatory architectures using robust fingerprints.
        </p>
      </div>

      {error && (
        <div className="bg-[#FEF0F0] border border-[#F8BFBF] text-[#D96C6C] text-sm rounded-lg px-4 py-2.5">
          {error}
        </div>
      )}

      {/* PCA scatter */}
      <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-5 relative">
        {loading && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-10 rounded-xl">
            <Loader2 className="w-6 h-6 text-[#3A9D7C] animate-spin" />
          </div>
        )}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-[#334155]">
              Dimensionality Reduction — {method}
            </h3>
            <p className="text-xs text-[#64748B]">
              Each point represents one organism projected onto two principal components.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#64748B]">Group</span>
              <select
                value={taxFilter}
                onChange={(e) => setTaxFilter(e.target.value)}
                className="text-sm border border-[#D9E2E7] rounded-lg px-2.5 py-1.5 bg-[#F7FAFC] text-[#334155] focus:outline-none focus:ring-1 focus:ring-[#3A9D7C]"
              >
                {taxGroups.map((g) => <option key={g}>{g}</option>)}
              </select>
            </div>
            <div className="flex rounded-lg border border-[#D9E2E7] overflow-hidden">
              {projectionMethods.map((m) => (
                <button
                  key={m}
                  onClick={() => setMethod(m)}
                  className={`px-3 py-1.5 text-xs transition-colors ${
                    method === m
                      ? "bg-[#3A9D7C] text-white"
                      : "bg-white text-[#64748B] hover:bg-[#F7FAFC]"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-4">
          <ResponsiveContainer width="100%" height={340}>
            <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: -10 }}>
              <CartesianGrid strokeDasharray="2 2" stroke="#F0F4F8" />
              <XAxis
                dataKey="pc1"
                type="number"
                domain={[-4, 4]}
                tick={{ fontSize: 11, fill: "#64748B" }}
                label={{ value: "PC1", position: "insideBottom", offset: -10, fontSize: 11, fill: "#64748B" }}
              />
              <YAxis
                dataKey="pc2"
                type="number"
                domain={[-2, 2.5]}
                tick={{ fontSize: 11, fill: "#64748B" }}
                label={{ value: "PC2", angle: -90, position: "insideLeft", fontSize: 11, fill: "#64748B" }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Scatter data={filtered} shape="circle">
                {filtered.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={GROUP_COLORS[entry.group] || "#94A3B8"}
                    stroke={GROUP_COLORS[entry.group] || "#94A3B8"}
                    strokeWidth={1.5}
                    fillOpacity={0.8}
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>

          {/* Labels overlay */}
          <div className="w-48 shrink-0">
            <div className="text-[11px] font-semibold text-[#334155] mb-2">Organisms</div>
            <div className="space-y-1.5">
              {filtered.map((d) => (
                <div
                  key={d.organism}
                  className="flex items-center gap-2 cursor-pointer hover:bg-[#F7FAFC] rounded px-1.5 py-1 -mx-1.5"
                >
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: GROUP_COLORS[d.group] }} />
                  <span className="text-[11px] text-[#334155]">{d.organism}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 border-t border-[#D9E2E7] pt-3">
              <div className="text-[10px] font-semibold text-[#64748B] mb-2">Taxonomic group</div>
              {Object.entries(GROUP_COLORS).map(([g, c]) => (
                <div key={g} className="flex items-center gap-1.5 mb-1">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c }} />
                  <span className="text-[10px] text-[#64748B]">{g}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Clustering */}
      <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-5 relative">
        {loading && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-10 rounded-xl">
            <Loader2 className="w-6 h-6 text-[#3A9D7C] animate-spin" />
          </div>
        )}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-[#334155]">Regulatory Architecture Clusters</h3>
            <p className="text-xs text-[#64748B]">
              Hierarchical clustering of organisms by fingerprint similarity.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {[
              { label: "Taxonomic group", key: "tax" },
              { label: "Genome size", key: "genome" },
              { label: "Number of TFs", key: "tfs" },
            ].map((f) => (
              <button
                key={f.key}
                className="text-xs border border-[#D9E2E7] px-2.5 py-1.5 rounded-lg text-[#64748B] hover:bg-[#F7FAFC] transition-colors"
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {clusters.map((cluster) => (
            <div
              key={cluster.name}
              className="rounded-lg border p-4"
              style={{ borderColor: `${cluster.color}40`, backgroundColor: `${cluster.color}08` }}
            >
              <div className="text-xs font-semibold mb-1" style={{ color: cluster.color }}>
                {cluster.name}
              </div>
              <p className="text-[10px] text-[#64748B] mb-3">{cluster.description}</p>
              <div className="space-y-1">
                {(cluster.organisms || []).map((o) => (
                  <div
                    key={o.id || o}
                    className="text-[11px] text-[#334155] flex items-center gap-1.5 cursor-pointer hover:text-[#3A9D7C]"
                    onClick={() => navigate("organism-detail", o.id || o)}
                  >
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cluster.color }} />
                    {o.name || o}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from "recharts";
import { Loader2, ShieldAlert, CheckCircle2, AlertTriangle } from "lucide-react";
import { api } from "../services/api";
import { COMPARISON_ACCESSIONS } from "../constants/comparisonGenomes";

const ROBUST_COLORS = {
  ROBUST: { bg: "#E8F5F0", text: "#176B57", border: "#B8DDD0" },
  MODERATE: { bg: "#FFFBEB", text: "#92400E", border: "#FCEDB8" },
  "NOT ROBUST": { bg: "#FEF0F0", text: "#D96C6C", border: "#F8BFBF" },
};

const removeEdgesOptions = ["10%", "25%", "50%", "75%"];
const samplingOptions = ["Random", "Degree-biased"];

const STRATEGY_PARAM = {
  Random: "random",
  "Degree-biased": "degree_biased",
};

function formatCell(value) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") {
    return Math.abs(value) < 1 ? value.toFixed(4) : value.toFixed(2);
  }
  return value;
}

export default function Robustness() {
  // Genome selector state
  const [genomes, setGenomes] = useState([]);
  const [genomesLoading, setGenomesLoading] = useState(true);
  const [genomesError, setGenomesError] = useState("");
  const [selectedGenome, setSelectedGenome] = useState("");

  // Robustness data state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [robustnessData, setRobustnessData] = useState([]);
  const [meta, setMeta] = useState(null);

  // Edge Subsampling (Block B) state
  const [removedEdges, setRemovedEdges] = useState("25%");
  const [sampling, setSampling] = useState("Random");
  const [replicates] = useState(10);
  const [subsamplingLoading, setSubsamplingLoading] = useState(false);
  const [subsamplingError, setSubsamplingError] = useState("");
  const [subsamplingRows, setSubsamplingRows] = useState([]);

  // Load available genomes once on mount, restricted to the compared set
  useEffect(() => {
    const fetchGenomes = async () => {
      try {
        setGenomesLoading(true);
        setGenomesError("");
        const response = await api.getGenomes(0, 3000);
        const items = response.data?.items || [];
        const comparisonOnly = items.filter((item) => COMPARISON_ACCESSIONS.includes(item.accession));

        // Alphabetical order by organism display name (falls back to accession).
        const sorted = [...comparisonOnly].sort((a, b) =>
          (a.ncbi_organism || a.accession).localeCompare(b.ncbi_organism || b.accession)
        );

        setGenomes(sorted);

        if (sorted.length > 0) {
          setSelectedGenome(sorted[0].accession);
        } else {
          setError("No genomes from the compared set are available in the Atlas yet.");
        }
      } catch (err) {
        console.error("Failed to load genome list:", err);
        setGenomesError("Could not load the list of organisms. Check that the backend is running.");
      } finally {
        setGenomesLoading(false);
      }
    };

    fetchGenomes();
  }, []);

  // Fetch robustness data whenever the selected genome changes
  useEffect(() => {
    if (!selectedGenome) return;

    const fetchRobustness = async () => {
      try {
        setLoading(true);
        setError("");
        const response = await api.getNetworkRobustness(selectedGenome, {
          threshold: 1e-6,
          trials: 5,
        });
        setRobustnessData(response.data?.results || []);
        setMeta({
          baseEdges: response.data?.base_edges,
          trials: response.data?.trials,
        });
      } catch (err) {
        console.error("Failed to load robustness stability metrics:", err);
        setError(
          err.response?.status === 404
            ? `No regulatory interactions are loaded yet for ${selectedGenome}.`
            : "Could not load the network robustness evaluation. Check that the backend is running."
        );
        setRobustnessData([]);
        setMeta(null);
      } finally {
        setLoading(false);
      }
    };

    fetchRobustness();
  }, [selectedGenome]);

  // Fetch Block B table whenever genome, removal rate, or strategy changes
  useEffect(() => {
    if (!selectedGenome) return;

    const fetchSubsampling = async () => {
      try {
        setSubsamplingLoading(true);
        setSubsamplingError("");
        const response = await api.getEdgeSubsampling(selectedGenome, {
          threshold: 1e-6,
          removal_rate: parseInt(removedEdges, 10) / 100,
          strategy: STRATEGY_PARAM[sampling],
          replicates,
        });
        setSubsamplingRows(response.data?.metrics || []);
      } catch (err) {
        console.error("Failed to load edge subsampling table:", err);
        setSubsamplingError(
          err.response?.status === 404
            ? `No regulatory interactions are loaded yet for ${selectedGenome}.`
            : "Could not load the edge subsampling evaluation. Check that the backend is running."
        );
        setSubsamplingRows([]);
      } finally {
        setSubsamplingLoading(false);
      }
    };

    fetchSubsampling();
  }, [selectedGenome, removedEdges, sampling, replicates]);

  const hasData = robustnessData.length > 0;

  return (
    <div className="space-y-6 max-w-[1100px] relative">
      {loading && (
        <div className="absolute inset-0 bg-white/70 flex flex-col items-center justify-center z-20">
          <Loader2 className="w-8 h-8 text-[#3A9D7C] animate-spin mb-2" />
          <p className="text-sm text-[#64748B]">Running network robustness stability analysis...</p>
        </div>
      )}

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-[#334155]">
            Network Robustness & Incompleteness Evaluation
          </h1>
          <p className="text-sm text-[#64748B] mt-1">
            Assessing topological metric stability under random edge subsampling (10% to 75% removal).
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label htmlFor="genome-select" className="text-xs font-medium text-[#64748B]">
            Organism
          </label>
          <select
            id="genome-select"
            className="text-sm border border-[#D9E2E7] rounded-lg px-3 py-1.5 text-[#334155] bg-white disabled:opacity-50"
            value={selectedGenome}
            onChange={(e) => setSelectedGenome(e.target.value)}
            disabled={genomesLoading || genomes.length === 0}
          >
            {genomesLoading && <option>Loading organisms...</option>}
            {!genomesLoading && genomes.length === 0 && <option>No organisms available</option>}
            {genomes.map((g) => (
              <option key={g.accession} value={g.accession}>
                {g.ncbi_organism || g.accession} ({g.accession})
              </option>
            ))}
          </select>
        </div>
      </div>

      {hasData && !error && (
        <div className="flex items-center gap-2 bg-[#E8F5F0] text-[#176B57] px-3 py-1.5 rounded-lg text-xs font-medium border border-[#B8DDD0] w-fit">
          <CheckCircle2 size={14} />
          <span>Stability Benchmark ({meta?.trials ?? "-"} trials, {meta?.baseEdges ?? "-"} base edges)</span>
        </div>
      )}

      {genomesError && (
        <div className="bg-[#FEF0F0] border border-[#F8BFBF] text-[#D96C6C] text-sm rounded-lg px-4 py-2.5 flex items-center gap-2">
          <AlertTriangle size={16} />
          <span>{genomesError}</span>
        </div>
      )}

      {error && (
        <div className="bg-[#FEF0F0] border border-[#F8BFBF] text-[#D96C6C] text-sm rounded-lg px-4 py-2.5 flex items-center gap-2">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      {hasData && (
        <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-[#334155]">Structural Degradation Curves</h3>
              <p className="text-xs text-[#64748B]">Metric retention ratio vs. percentage of removed regulatory edges</p>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={340}>
            <LineChart data={robustnessData} margin={{ top: 10, right: 30, bottom: 10, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0F4F8" />
              <XAxis
                dataKey="edge_removal_rate"
                tick={{ fontSize: 11, fill: "#64748B" }}
                tickFormatter={(v) => `${v * 100}%`}
                label={{ value: "Edge Removal Rate (Subsampling)", position: "insideBottom", offset: -5, fontSize: 11, fill: "#64748B" }}
              />
              <YAxis tick={{ fontSize: 11, fill: "#64748B" }} domain={[0, 0.6]} />
              <Tooltip
                contentStyle={{ fontSize: 11, borderColor: "#D9E2E7", borderRadius: 8 }}
                formatter={(v, name) => [v, name.replace("_", " ").toUpperCase()]}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="modularity" name="Modularity (Q)" stroke="#3A9D7C" strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="clustering_coefficient" name="Clustering Coeff." stroke="#3B82B8" strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="hierarchy_index" name="Hierarchy Index" stroke="#E9B949" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-5 relative">
        {subsamplingLoading && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-10 rounded-xl">
            <Loader2 className="w-6 h-6 text-[#3A9D7C] animate-spin" />
          </div>
        )}

        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-bold text-[#64748B] bg-[#F0F4F8] px-2 py-0.5 rounded font-mono">B</span>
          <h2 className="text-sm font-semibold text-[#334155]">Edge Subsampling</h2>
        </div>
        <p className="text-xs text-[#64748B] mb-4 ml-8">
          Metric stability under simulated interaction data incompleteness.
        </p>

        <div className="flex flex-wrap items-center gap-5 ml-8 mb-5">
          <div>
            <div className="text-[10px] font-medium text-[#64748B] mb-1.5">Removed edges</div>
            <div className="flex gap-1">
              {removeEdgesOptions.map((o) => (
                <button
                  key={o}
                  onClick={() => setRemovedEdges(o)}
                  className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                    removedEdges === o
                      ? "bg-[#3A9D7C] text-white border-[#3A9D7C]"
                      : "bg-white text-[#64748B] border-[#D9E2E7] hover:bg-[#F7FAFC]"
                  }`}
                >
                  {o}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-medium text-[#64748B] mb-1.5">Sampling strategy</div>
            <div className="flex gap-1">
              {samplingOptions.map((o) => (
                <button
                  key={o}
                  onClick={() => setSampling(o)}
                  className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                    sampling === o
                      ? "bg-[#3B82B8] text-white border-[#3B82B8]"
                      : "bg-white text-[#64748B] border-[#D9E2E7] hover:bg-[#F7FAFC]"
                  }`}
                >
                  {o}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-medium text-[#64748B] mb-1.5">Replicates</div>
            <span className="text-sm font-mono font-medium text-[#334155] bg-[#F7FAFC] border border-[#D9E2E7] px-2.5 py-1 rounded-lg">
              {replicates}
            </span>
          </div>
        </div>

        {subsamplingError && (
          <div className="bg-[#FEF0F0] border border-[#F8BFBF] text-[#D96C6C] text-sm rounded-lg px-4 py-2.5 flex items-center gap-2 mb-4 ml-8">
            <AlertTriangle size={16} />
            <span>{subsamplingError}</span>
          </div>
        )}

        {subsamplingRows.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#D9E2E7] bg-[#F7FAFC]">
                    {["Metric", "Original", "Mean", "Std Dev", "CV", "Robustness"].map((h) => (
                      <th
                        key={h}
                        className="text-left text-[11px] font-medium text-[#64748B] px-4 py-2.5 first:pl-5 last:pr-5"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {subsamplingRows.map((row) => {
                    const style = ROBUST_COLORS[row.robustness] || ROBUST_COLORS["NOT ROBUST"];
                    return (
                      <tr key={row.metric} className="border-b border-[#F7FAFC] last:border-0">
                        <td className="px-4 pl-5 py-2.5 text-xs font-medium text-[#334155]">
                          {row.metric}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-[#334155]">
                          {formatCell(row.original)}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-[#334155]">
                          {formatCell(row.mean)}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-[#334155]">
                          {formatCell(row.std)}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-[#334155]">
                          {row.cv === null ? "—" : row.cv.toFixed(2)}
                        </td>
                        <td className="px-4 pr-5 py-2.5">
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold font-mono border"
                            style={{
                              backgroundColor: style.bg,
                              color: style.text,
                              borderColor: style.border,
                            }}
                          >
                            {row.robustness}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center gap-4 mt-4 ml-4">
              {Object.entries(ROBUST_COLORS).map(([k, v]) => (
                <div key={k} className="flex items-center gap-1.5">
                  <span
                    className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded border"
                    style={{ backgroundColor: v.bg, color: v.text, borderColor: v.border }}
                  >
                    {k}
                  </span>
                  <span className="text-[10px] text-[#64748B]">
                    {k === "ROBUST" ? "CV < 0.15" : k === "MODERATE" ? "0.15 ≤ CV < 0.35" : "CV ≥ 0.35"}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

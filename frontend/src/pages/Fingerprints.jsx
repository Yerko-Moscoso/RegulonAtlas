import { useState, useEffect } from "react";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from "recharts";
import { Loader2, ShieldCheck, Filter } from "lucide-react";
import { api } from "../services/api";

function heatColor(v) {
  if (v >= 0.8) return "#176B57";
  if (v >= 0.6) return "#3A9D7C";
  if (v >= 0.4) return "#55B8A5";
  if (v >= 0.2) return "#DCEFFA";
  return "#F7FAFC";
}

function heatTextColor(v) {
  return v >= 0.6 ? "#fff" : "#334155";
}

const RADAR_COLORS = ["#3A9D7C", "#3B82B8", "#55B8A5", "#E9B949", "#D96C6C", "#8B5CF6"];
const ROBUST_METRICS = ["Avg Degree", "Modularity", "Hierarchy", "Entropy", "Hubs"];

export default function Fingerprints() {
  const [robustOnly, setRobustOnly] = useState(false);
  const [hoveredCell, setHoveredCell] = useState(null);

  const [fingerprintData, setFingerprintData] = useState([]);
  const [radarSeries, setRadarSeries] = useState([]);
  const [heatmapOrganisms, setHeatmapOrganisms] = useState([]);
  const [heatmapMetrics, setHeatmapMetrics] = useState([]);
  const [heatmapValues, setHeatmapValues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchFingerprints = async () => {
      try {
        setLoading(true);
        setError("");
        const [radarRes, heatmapRes] = await Promise.all([
          api.getFingerprintRadar(),
          api.getFingerprintHeatmap(),
        ]);

        setRadarSeries(radarRes.data?.series || []);
        setFingerprintData(radarRes.data?.data || []);

        setHeatmapOrganisms(heatmapRes.data?.organisms || []);
        setHeatmapMetrics(heatmapRes.data?.metrics || []);
        setHeatmapValues(heatmapRes.data?.values || []);
      } catch (err) {
        console.error("Failed to fetch regulatory fingerprints from database:", err);
        setError("Could not load regulatory fingerprints from database backend.");
        setRadarSeries([]);
        setFingerprintData([]);
        setHeatmapOrganisms([]);
        setHeatmapMetrics([]);
        setHeatmapValues([]);
      } finally {
        setLoading(false);
      }
    };

    fetchFingerprints();
  }, []);

  const displayMetrics = robustOnly
    ? heatmapMetrics.filter((m) => ROBUST_METRICS.includes(m))
    : heatmapMetrics;
  const metricIndices = displayMetrics.map((m) => heatmapMetrics.indexOf(m));

  return (
    <div className="space-y-6 max-w-[1100px] relative">
      {loading && (
        <div className="absolute inset-0 bg-white/70 flex flex-col items-center justify-center z-20">
          <Loader2 className="w-8 h-8 text-[#3A9D7C] animate-spin mb-2" />
          <p className="text-sm text-[#64748B]">Loading regulatory network fingerprints...</p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#334155]">
            Regulatory Network Fingerprints
          </h1>
          <p className="text-sm text-[#64748B] mt-1">
            Systematic multi-organism comparison via normalized robust topological profiles.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-[#E8F5F0] text-[#176B57] px-3 py-1.5 rounded-lg text-xs font-medium border border-[#B8DDD0]">
          <ShieldCheck size={14} />
          <span>OE7 Multi-Organism Comparison Ready</span>
        </div>
      </div>

      {error && (
        <div className="bg-[#FEF0F0] border border-[#F8BFBF] text-[#D96C6C] text-sm rounded-lg px-4 py-2.5">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-[#334155]">Fingerprint Radar</h3>
              <p className="text-xs text-[#64748B]">Normalized topological dimensions per genome</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart data={fingerprintData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
              <PolarGrid stroke="#E2E8F0" />
              <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fill: "#64748B" }} />
              <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9, fill: "#94A3B8" }} />
              {radarSeries.map((s, i) => (
                <Radar
                  key={s.key}
                  name={s.name}
                  dataKey={s.key}
                  stroke={RADAR_COLORS[i % RADAR_COLORS.length]}
                  fill={RADAR_COLORS[i % RADAR_COLORS.length]}
                  fillOpacity={0.12}
                  strokeWidth={i < 2 ? 2 : 1.5}
                />
              ))}
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ fontSize: 11, borderColor: "#D9E2E7", borderRadius: 8 }} />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-5 flex flex-col">
          <h3 className="text-sm font-semibold text-[#334155] mb-1">Fingerprint Components</h3>
          <p className="text-xs text-[#64748B] mb-4">
            Architectural features driving phylogenetic and ecological clustering.
          </p>
          <div className="space-y-2.5 flex-1 overflow-y-auto max-h-[240px]">
            {fingerprintData.map((item) => (
              <div key={item.metric} className="flex items-center gap-3">
                <span className="text-xs text-[#64748B] w-24 shrink-0 font-medium">{item.metric}</span>
                <div className="flex-1 grid gap-1" style={{ gridTemplateColumns: `repeat(${radarSeries.length || 1}, minmax(0, 1fr))` }}>
                  {radarSeries.map((s, i) => (
                    <div key={s.key} className="h-1.5 bg-[#F0F4F8] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{ width: `${item[s.key] ?? 0}%`, backgroundColor: RADAR_COLORS[i % RADAR_COLORS.length] }}
                      />
                    </div>
                  ))}
                </div>
                <span className="text-[10px] font-mono text-[#64748B] w-8 text-right">
                  {radarSeries[0] ? `${item[radarSeries[0].key]}%` : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-[#334155]">Fingerprint Heatmap Matrix</h3>
            <p className="text-xs text-[#64748B]">
              Normalized topological scores (0–1) across all evaluated bacterial genera
            </p>
          </div>
          <button
            onClick={() => setRobustOnly((v) => !v)}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg border transition-colors ${
              robustOnly
                ? "bg-[#E8F5F0] text-[#176B57] border-[#B8DDD0]"
                : "bg-white text-[#64748B] border-[#D9E2E7] hover:bg-[#F7FAFC]"
            }`}
          >
            <Filter size={12} />
            Show robust metrics only (OE6)
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-max">
            <thead>
              <tr>
                <th className="text-left text-[10px] font-medium text-[#64748B] pb-2 pr-3 w-44">
                  Organism (GTDB / RefSeq)
                </th>
                {displayMetrics.map((m) => (
                  <th key={m} className="text-center text-[10px] font-medium text-[#64748B] pb-2 px-1 min-w-[80px]">
                    {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {heatmapOrganisms.map((org, rowIdx) => (
                <tr key={org} className="border-t border-[#F0F4F8] hover:bg-[#F7FAFC]">
                  <td className="text-[11px] text-[#334155] pr-3 py-1.5 font-medium italic">{org}</td>
                  {metricIndices.map((colIdx, displayIdx) => {
                    const v = heatmapValues[rowIdx]?.[colIdx] ?? 0;
                    const isHovered = hoveredCell?.row === rowIdx && hoveredCell?.col === displayIdx;
                    return (
                      <td key={colIdx} className="px-0.5 py-1">
                        <div
                          className="h-8 rounded flex items-center justify-center text-[10px] font-mono font-medium cursor-default transition-opacity"
                          style={{
                            backgroundColor: heatColor(v),
                            color: heatTextColor(v),
                            opacity: hoveredCell && !isHovered ? 0.6 : 1,
                          }}
                          onMouseEnter={() => setHoveredCell({ row: rowIdx, col: displayIdx })}
                          onMouseLeave={() => setHoveredCell(null)}
                          title={`${org} — ${displayMetrics[displayIdx]}: ${v.toFixed(2)}`}
                        >
                          {v.toFixed(2)}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-[#F0F4F8]">
          <span className="text-[10px] text-[#64748B]">0.0 (Low)</span>
          <div
            className="flex-1 max-w-48 h-2 rounded-full"
            style={{ background: "linear-gradient(to right, #F7FAFC, #DCEFFA, #55B8A5, #3A9D7C, #176B57)" }}
          />
          <span className="text-[10px] text-[#64748B]">1.0 (High)</span>
          <span className="text-[10px] text-[#94A3B8] ml-auto font-mono">Normalized topological weight</span>
        </div>
      </div>
    </div>
  );
}
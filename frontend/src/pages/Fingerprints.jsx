import { useState, useEffect, useMemo } from "react";
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
import { Loader2, AlertTriangle } from "lucide-react";
import { api } from "../services/api";
import { COMPARISON_ACCESSIONS } from "../constants/comparisonGenomes";

// Las 5 métricas topológicas básicas que devuelve /metrics/topology/{genome_acc}
const METRICS = [
  { key: "nodos", label: "Nodes", decimals: 0 },
  { key: "aristas", label: "Edges", decimals: 0 },
  { key: "densidad", label: "Density", decimals: 4 },
  { key: "grado_medio", label: "Avg Degree", decimals: 2 },
  { key: "hubs", label: "Hubs (deg > 20)", decimals: 0 },
];

const RADAR_COLORS = ["#3A9D7C", "#3B82B8", "#55B8A5", "#E9B949", "#D96C6C", "#8B5CF6", "#EC4899", "#0EA5E9", "#84CC16", "#F97316"];

function heatColor(norm) {
  if (norm >= 0.8) return "#176B57";
  if (norm >= 0.6) return "#3A9D7C";
  if (norm >= 0.4) return "#55B8A5";
  if (norm >= 0.2) return "#DCEFFA";
  return "#F7FAFC";
}
function heatTextColor(norm) {
  return norm >= 0.6 ? "#fff" : "#334155";
}
function formatValue(v, decimals) {
  if (v === null || v === undefined) return "—";
  return decimals === 0 ? v.toLocaleString() : v.toFixed(decimals);
}

export default function Fingerprints() {
  const [organisms, setOrganisms] = useState([]); // { id, label }
  const [rows, setRows] = useState([]); // { id, label, metrics: {...} | null, status }
  const [selectedGenome, setSelectedGenome] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hoveredCell, setHoveredCell] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError("");

        // 1) Nombres de los organismos a comparar
        const genomesRes = await api.getGenomes(0, 3000);
        const items = genomesRes.data?.items || [];
        const orgs = COMPARISON_ACCESSIONS.map((acc) => {
          const found = items.find((g) => g.accession === acc);
          return { id: acc, label: found?.ncbi_organism || acc };
        }).sort((a, b) => a.label.localeCompare(b.label));
        setOrganisms(orgs);

        // 2) Métricas topológicas reales por genoma (calculadas sobre fimo_hits)
        const results = await Promise.allSettled(
          orgs.map((o) => api.getTopologyMetrics(o.id))
        );

        const nextRows = orgs.map((o, i) => {
          const res = results[i];
          if (res.status === "fulfilled") {
            return { ...o, metrics: res.value.data, status: "ok" };
          }
          const is404 = res.reason?.response?.status === 404;
          return {
            ...o,
            metrics: null,
            status: is404 ? "no_data" : "error",
          };
        });
        setRows(nextRows);

        const firstAvailable = nextRows.find((r) => r.status === "ok") || nextRows[0];
        if (firstAvailable) setSelectedGenome(firstAvailable.id);
      } catch (err) {
        console.error("Failed to load topological fingerprints:", err);
        setError("Could not load topological metrics from the database backend.");
        setRows([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const availableRows = rows.filter((r) => r.status === "ok");
  const missingRows = rows.filter((r) => r.status !== "ok");
  const selectedRow = rows.find((r) => r.id === selectedGenome);

  // Normalización 0-1 por métrica, min-max sobre los genomas con datos cargados.
  // Solo se usa para posicionar el punto en el radar / colorear la celda del heatmap;
  // los valores mostrados en celdas, tarjetas y tooltips son siempre los reales.
  const normalized = useMemo(() => {
    const bounds = {};
    METRICS.forEach(({ key }) => {
      const values = availableRows.map((r) => r.metrics[key]);
      bounds[key] = { min: Math.min(...values), max: Math.max(...values) };
    });
    return availableRows.map((r) => {
      const norm = {};
      METRICS.forEach(({ key }) => {
        const { min, max } = bounds[key];
        norm[key] = max > min ? (r.metrics[key] - min) / (max - min) : 0.5;
      });
      return { ...r, norm };
    });
  }, [availableRows]);

  const radarData = METRICS.map(({ key, label }) => {
    const point = { metric: label };
    normalized.forEach((r) => {
      point[r.id] = Math.round(r.norm[key] * 100);
    });
    return point;
  });

  return (
    <div className="space-y-6 max-w-[1100px] relative">
      {loading && (
        <div className="absolute inset-0 bg-white/70 flex flex-col items-center justify-center z-20">
          <Loader2 className="w-8 h-8 text-[#3A9D7C] animate-spin mb-2" />
          <p className="text-sm text-[#64748B]">Loading topological fingerprints...</p>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-semibold text-[#334155]">
          Regulatory Network Fingerprints
        </h1>
        <p className="text-sm text-[#64748B] mt-1">
          The 5 basic topological metrics (nodes, edges, density, avg degree, hubs) compared across organisms.
        </p>
      </div>

      <div className="bg-white border border-[#D9E2E7] rounded-xl p-3 flex flex-wrap items-center gap-4 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#64748B]">Organism</span>
          <select
            value={selectedGenome}
            onChange={(e) => setSelectedGenome(e.target.value)}
            disabled={loading || organisms.length === 0}
            className="text-sm border border-[#D9E2E7] rounded-lg px-2.5 py-1.5 bg-white text-[#334155] focus:outline-none focus:ring-1 focus:ring-[#3A9D7C] min-w-[220px] disabled:bg-gray-50 disabled:text-gray-400"
          >
            {organisms.length === 0 && <option>Loading organisms...</option>}
            {organisms.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="bg-[#FEF0F0] border border-[#F8BFBF] text-[#D96C6C] text-sm rounded-lg px-4 py-2.5">
          {error}
        </div>
      )}

      {!loading && missingRows.length > 0 && (
        <div className="bg-[#FFFBEB] border border-[#FCEDB8] text-[#92400E] text-sm rounded-lg px-4 py-2.5 flex items-start gap-2">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>
            No regulatory interactions are loaded yet for:{" "}
            {missingRows.map((r) => r.label).join(", ")}.
          </span>
        </div>
      )}

      {/* Métricas del organismo seleccionado */}
      {!loading && selectedRow && (
        <div>
          <h3 className="text-sm font-semibold text-[#334155] mb-3">
            {selectedRow.label}
          </h3>
          {selectedRow.status === "ok" ? (
            <div className="grid grid-cols-5 gap-3">
              {METRICS.map((m) => (
                <div
                  key={m.key}
                  className="bg-white rounded-xl border border-[#D9E2E7] p-4 shadow-sm"
                >
                  <div className="text-xl font-bold font-mono text-[#3A9D7C]">
                    {formatValue(selectedRow.metrics[m.key], m.decimals)}
                  </div>
                  <div className="text-[11px] text-[#64748B] mt-1">{m.label}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-[#F7FAFC] border border-[#D9E2E7] rounded-xl p-4 text-sm text-[#64748B]">
              No regulatory interactions are loaded yet for this organism.
            </div>
          )}
        </div>
      )}

      {!loading && availableRows.length > 0 && (
        <>
          <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-5">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-[#334155]">Fingerprint Radar</h3>
              <p className="text-xs text-[#64748B]">
                Each axis is min-max normalized across the organisms shown below (0–100). The selected organism is highlighted.
              </p>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                <PolarGrid stroke="#E2E8F0" />
                <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fill: "#64748B" }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9, fill: "#94A3B8" }} />
                {normalized.map((r, i) => {
                  const isSelected = r.id === selectedGenome;
                  return (
                    <Radar
                      key={r.id}
                      name={r.label}
                      dataKey={r.id}
                      stroke={RADAR_COLORS[i % RADAR_COLORS.length]}
                      fill={RADAR_COLORS[i % RADAR_COLORS.length]}
                      fillOpacity={isSelected ? 0.25 : 0.04}
                      strokeWidth={isSelected ? 2.5 : 1}
                      strokeOpacity={isSelected ? 1 : 0.35}
                    />
                  );
                })}
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 11, borderColor: "#D9E2E7", borderRadius: 8 }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-5">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-[#334155]">Fingerprint Heatmap Matrix</h3>
              <p className="text-xs text-[#64748B]">
                Real values per genome; cell color follows the same normalization as the radar. Click a row to select that organism.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-max">
                <thead>
                  <tr>
                    <th className="text-left text-[10px] font-medium text-[#64748B] pb-2 pr-3 w-44">
                      Organism
                    </th>
                    {METRICS.map((m) => (
                      <th key={m.key} className="text-center text-[10px] font-medium text-[#64748B] pb-2 px-1 min-w-[90px]">
                        {m.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {normalized.map((r, rowIdx) => {
                    const isSelected = r.id === selectedGenome;
                    return (
                      <tr
                        key={r.id}
                        onClick={() => setSelectedGenome(r.id)}
                        className={`border-t border-[#F0F4F8] hover:bg-[#F7FAFC] cursor-pointer ${isSelected ? "bg-[#F7FAFC]" : ""}`}
                      >
                        <td className={`text-[11px] pr-3 py-1.5 font-medium italic ${isSelected ? "text-[#176B57] font-semibold not-italic" : "text-[#334155]"}`}>
                          {r.label}
                        </td>
                        {METRICS.map((m, colIdx) => {
                          const raw = r.metrics[m.key];
                          const norm = r.norm[m.key];
                          const isHovered = hoveredCell?.row === rowIdx && hoveredCell?.col === colIdx;
                          return (
                            <td key={m.key} className="px-0.5 py-1">
                              <div
                                className="h-8 rounded flex items-center justify-center text-[10px] font-mono font-medium cursor-default transition-opacity"
                                style={{
                                  backgroundColor: heatColor(norm),
                                  color: heatTextColor(norm),
                                  opacity: hoveredCell && !isHovered ? 0.6 : 1,
                                  outline: isSelected ? "2px solid #176B57" : "none",
                                  outlineOffset: "-2px",
                                }}
                                onMouseEnter={() => setHoveredCell({ row: rowIdx, col: colIdx })}
                                onMouseLeave={() => setHoveredCell(null)}
                                title={`${r.label} — ${m.label}: ${formatValue(raw, m.decimals)}`}
                              >
                                {formatValue(raw, m.decimals)}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-2 mt-4 pt-3 border-t border-[#F0F4F8]">
              <span className="text-[10px] text-[#64748B]">Low (relative to the organisms shown)</span>
              <div
                className="flex-1 max-w-48 h-2 rounded-full"
                style={{ background: "linear-gradient(to right, #F7FAFC, #DCEFFA, #55B8A5, #3A9D7C, #176B57)" }}
              />
              <span className="text-[10px] text-[#64748B]">High</span>
            </div>
          </div>
        </>
      )}

      {!loading && !error && availableRows.length === 0 && (
        <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-8 text-center">
          <p className="text-sm text-[#64748B]">
            No topological metrics are loaded yet for any of these genomes.
          </p>
        </div>
      )}
    </div>
  );
}

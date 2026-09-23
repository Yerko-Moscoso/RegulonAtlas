import { useState, useEffect, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Loader2 } from "lucide-react";
import { api } from "../services/api";
import { COMPARISON_ACCESSIONS } from "../constants/comparisonGenomes";

function formatThreshold(t) {
  if (t === undefined || t === null) return "-";
  return `1e-${Number(t).toFixed(1).replace(".0", "")}`;
}

export default function Validation() {
  const [genomes, setGenomes] = useState([]);
  const [genomeAcc, setGenomeAcc] = useState("");
  const [loadingGenomes, setLoadingGenomes] = useState(true);

  const [rows, setRows] = useState([]);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState("");
  const [noData, setNoData] = useState(false);
  const [thresholdIndex, setThresholdIndex] = useState(0);

  useEffect(() => {
    const fetchGenomes = async () => {
      try {
        setLoadingGenomes(true);
        const response = await api.getGenomes(0, 3000);
        
        // Mapeamos y filtramos para dejar únicamente el subconjunto comparado
        const mappedData = response.data.items
          .filter((item) => COMPARISON_ACCESSIONS.includes(item.accession))
          .map((item) => ({
            id: item.accession,
            name: item.ncbi_organism || "Unknown Organism",
            tag: item.assembly_level || "Genome"
          }));

        mappedData.sort((a, b) => a.name.localeCompare(b.name));

        setGenomes(mappedData);
        if (mappedData.length > 0) {
          setGenomeAcc(mappedData[0].id);
        }
      } catch (err) {
        console.error("Error al cargar genomas:", err);
      } finally {
        setLoadingGenomes(false);
      }
    };

    fetchGenomes();
  }, []);

  useEffect(() => {
    if (!genomeAcc) return;

    const fetchValidation = async () => {
      try {
        setMetricsLoading(true);
        setMetricsError("");
        setNoData(false);

        const response = await api.getValidationMetrics(genomeAcc);
        
        const sorted = [...response.data].sort(
          (a, b) => a.neg_log10_pvalue_threshold - b.neg_log10_pvalue_threshold
        );
        
        const formattedRows = sorted.map(row => ({
          ...row,
          threshold: row.neg_log10_pvalue_threshold
        }));

        setRows(formattedRows);
        setThresholdIndex(formattedRows.length > 0 ? Math.floor((formattedRows.length - 1) / 2) : 0);
      } catch (err) {
        if (err.response?.status === 404) {
          setNoData(true); 
          setRows([]);
        } else {
          console.error("Error al cargar métricas de validación:", err);
          setMetricsError("Could not load validation metrics.");
          setRows([]);
        }
      } finally {
        setMetricsLoading(false);
      }
    };

    fetchValidation();
  }, [genomeAcc]);

  const current = rows[thresholdIndex];

  const f1 = useMemo(() => {
    if (!current) return null;
    const { precision, recall } = current;
    if (precision + recall === 0) return 0;
    return (2 * precision * recall) / (precision + recall);
  }, [current]);

  const pct = (v) => (v !== undefined && v !== null ? `${(v * 100).toFixed(1)}%` : "-");

  return (
    <div className="space-y-6 max-w-[1100px]">
      <div>
        <h1 className="text-2xl font-semibold text-[#334155]">Validation</h1>
        <p className="text-sm text-[#64748B] mt-1">
          Comparison between predicted regulatory networks and curated regulatory interactions.
        </p>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#64748B]">Organism</span>
          <select
            value={genomeAcc}
            onChange={(e) => setGenomeAcc(e.target.value)}
            disabled={loadingGenomes}
            className="text-sm border border-[#D9E2E7] rounded-lg px-2.5 py-1.5 bg-white text-[#334155] focus:outline-none focus:ring-1 focus:ring-[#3A9D7C] disabled:bg-gray-50 disabled:text-gray-400"
          >
            {loadingGenomes ? (
              <option>Loading organisms...</option>
            ) : (
              genomes.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.id})
                </option>
              ))
            )}
          </select>
        </div>
        {(() => {
          const selected = genomes.find((g) => g.id === genomeAcc);
          if (!selected) return null;
          return (
            <span className="text-[11px] text-[#64748B] bg-[#F7FAFC] border border-[#D9E2E7] rounded-full px-2.5 py-1">
              {selected.tag}
            </span>
          );
        })()}
      </div>

      {metricsLoading && (
        <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-8 flex flex-col items-center justify-center">
          <Loader2 className="w-6 h-6 text-[#3A9D7C] animate-spin mb-2" />
          <p className="text-sm text-[#64748B]">Loading validation metrics...</p>
        </div>
      )}

      {!metricsLoading && noData && (
        <div className="bg-[#FFFBEB] rounded-xl border border-[#FCEDB8] shadow-sm p-8 text-center">
          <p className="text-sm text-[#92400E] font-medium">
            Validation not yet available for this genome.
          </p>
          <p className="text-xs text-[#92400E]/80 mt-1">
            This organism doesn't have a curated Gold Standard benchmark loaded yet.
          </p>
        </div>
      )}

      {!metricsLoading && metricsError && (
        <div className="bg-[#FEF0F0] rounded-xl border border-[#F8BFBF] shadow-sm p-8 text-center">
          <p className="text-sm text-red-500">{metricsError}</p>
        </div>
      )}

      {!metricsLoading && !noData && !metricsError && current && (
        <>
          <div className="grid grid-cols-6 gap-3">
            {[
              { label: "Precision", value: pct(current.precision), color: "text-[#3A9D7C]", bg: "bg-[#E8F5F0]" },
              { label: "Recall", value: pct(current.recall), color: "text-[#3B82B8]", bg: "bg-[#DCEFFA]" },
              { label: "F1 Score", value: pct(f1), color: "text-[#55B8A5]", bg: "bg-[#E8F5F0]" },
              { label: "True Positives", value: current.true_positives.toLocaleString(), color: "text-[#176B57]", bg: "bg-[#E8F5F0]" },
              { label: "False Positives", value: current.false_positives.toLocaleString(), color: "text-[#D96C6C]", bg: "bg-[#FEF0F0]" },
              { label: "False Negatives", value: current.false_negatives.toLocaleString(), color: "text-[#E9B949]", bg: "bg-[#FFFBEB]" },
            ].map((m) => (
              <div key={m.label} className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-4">
                <div className={`text-xl font-bold font-mono ${m.color}`}>{m.value}</div>
                <div className="text-[11px] text-[#64748B] mt-1">{m.label}</div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-[#334155]">
                  Precision / Recall vs FIMO p-value threshold
                </h3>
                <p className="text-xs text-[#64748B]">
                  Threshold{" "}
                  <span className="font-mono font-medium text-[#334155]">
                    {formatThreshold(current.threshold)}
                  </span>
                  : Precision{" "}
                  <span className="text-[#3A9D7C] font-mono font-medium">{pct(current.precision)}</span>{" "}
                  · Recall{" "}
                  <span className="text-[#3B82B8] font-mono font-medium">{pct(current.recall)}</span>
                </p>
              </div>
              {rows.length > 1 && (
                <div className="flex flex-col items-end gap-1">
                  <label className="text-[10px] text-[#64748B]">Threshold</label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-[#94A3B8]">
                      {formatThreshold(rows[0].threshold)}
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={rows.length - 1}
                      step={1}
                      value={thresholdIndex}
                      onChange={(e) => setThresholdIndex(parseInt(e.target.value, 10))}
                      className="w-36 accent-[#3A9D7C]"
                    />
                    <span className="text-xs font-mono text-[#94A3B8]">
                      {formatThreshold(rows[rows.length - 1].threshold)}
                    </span>
                  </div>
                </div>
              )}
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={rows} margin={{ top: 5, right: 16, bottom: 20, left: -10 }}>
                <CartesianGrid strokeDasharray="2 2" stroke="#F0F4F8" />
                <XAxis
                  dataKey="threshold"
                  tickFormatter={formatThreshold}
                  tick={{ fontSize: 11, fill: "#64748B" }}
                  label={{ value: "FIMO p-value threshold", position: "insideBottom", offset: -10, fontSize: 11, fill: "#64748B" }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#64748B" }}
                  tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                  domain={[0, 1]}
                />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderColor: "#D9E2E7", borderRadius: 8 }}
                  labelFormatter={(v) => `Threshold: ${formatThreshold(v)}`}
                  formatter={(v) => `${(v * 100).toFixed(1)}%`}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {current && (
                  <ReferenceLine x={current.threshold} stroke="#E9B949" strokeDasharray="4 3" strokeWidth={1.5} />
                )}
                <Line type="monotone" dataKey="precision" stroke="#3A9D7C" strokeWidth={2.5} dot={{ r: 3 }} name="Precision" />
                <Line type="monotone" dataKey="recall" stroke="#3B82B8" strokeWidth={2.5} dot={{ r: 3 }} name="Recall" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-5">
            <h3 className="text-sm font-semibold text-[#334155] mb-4">Prediction Summary</h3>
            <div className="grid grid-cols-3 gap-3 max-w-md">
              {[
                { label: "True Positives", value: current.true_positives, color: "#E8F5F0", border: "#B8DDD0", text: "#176B57" },
                { label: "False Positives", value: current.false_positives, color: "#FEF0F0", border: "#F8BFBF", text: "#D96C6C" },
                { label: "False Negatives", value: current.false_negatives, color: "#FFFBEB", border: "#FCEDB8", text: "#92400E" },
              ].map((c) => (
                <div
                  key={c.label}
                  className="rounded-lg border p-3 text-center"
                  style={{ backgroundColor: c.color, borderColor: c.border }}
                >
                  <div className="text-xl font-bold font-mono" style={{ color: c.text }}>
                    {c.value.toLocaleString()}
                  </div>
                  <div className="text-[10px] mt-1" style={{ color: c.text }}>
                    {c.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

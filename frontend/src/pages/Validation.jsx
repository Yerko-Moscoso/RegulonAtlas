import { useState, useEffect } from "react";
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

// TODO: reemplazar por api.getOrganismsList() si existe un catálogo de organismos.
const ORGANISM_OPTIONS = [
  { id: "ecoli", label: "E. coli K-12" },
  { id: "bsubtilis", label: "B. subtilis" },
  { id: "senterica", label: "S. enterica" },
];

// TODO: reemplazar por api.getReferenceDatabases() si existe un catálogo de bases curadas.
const REF_DB_OPTIONS = ["RegulonDB 12.0", "RegPrecise", "PRODORIC 8.4"];

export default function Validation() {
  const [organism, setOrganism] = useState(ORGANISM_OPTIONS[0].id);
  const [refDb, setRefDb] = useState(REF_DB_OPTIONS[0]);
  const [threshold, setThreshold] = useState(0.85);

  // Estados de datos reales (módulo OE5 de benchmark)
  const [result, setResult] = useState(null); // { precision, recall, f1, tp, fp, fn }
  const [prCurveData, setPrCurveData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchValidation = async () => {
      try {
        setLoading(true);
        setError("");
        // TODO: ajustar a tu endpoint real del módulo OE5, se asume:
        // GET /api/validation/{organism_id}?refDb=&threshold=
        const [summaryRes, curveRes] = await Promise.all([
          api.getValidationSummary(organism, { refDb, threshold }),
          // GET /api/validation/{organism_id}/pr-curve?refDb=
          api.getPrecisionRecallCurve(organism, { refDb }),
        ]);

        setResult(summaryRes.data || null);
        setPrCurveData(curveRes.data?.points || []);
      } catch (err) {
        console.error("Error al cargar la validación OE5:", err);
        setError("No se pudo cargar la validación desde la base de datos.");
        setResult(null);
        setPrCurveData([]);
      } finally {
        setLoading(false);
      }
    };

    fetchValidation();
  }, [organism, refDb]);

  const currentPoint =
    prCurveData.length > 0
      ? prCurveData.reduce((prev, curr) =>
          Math.abs(curr.threshold - threshold) < Math.abs(prev.threshold - threshold) ? curr : prev
        )
      : { threshold, precision: 0, recall: 0 };

  const res = result || { precision: 0, recall: 0, f1: 0, tp: 0, fp: 0, fn: 0 };

  return (
    <div className="space-y-6 max-w-[1100px] relative">
      {loading && (
        <div className="absolute inset-0 bg-white/70 flex flex-col items-center justify-center z-20">
          <Loader2 className="w-8 h-8 text-[#3A9D7C] animate-spin mb-2" />
          <p className="text-sm text-[#64748B]">Cargando validación...</p>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-semibold text-[#334155]">Validation</h1>
        <p className="text-sm text-[#64748B] mt-1">
          Comparison between predicted regulatory networks and curated regulatory interactions.
        </p>
      </div>

      {error && (
        <div className="bg-[#FEF0F0] border border-[#F8BFBF] text-[#D96C6C] text-sm rounded-lg px-4 py-2.5">
          {error}
        </div>
      )}

      {/* Selectors */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#64748B]">Organism</span>
          <select
            value={organism}
            onChange={(e) => setOrganism(e.target.value)}
            className="text-sm border border-[#D9E2E7] rounded-lg px-2.5 py-1.5 bg-white text-[#334155] focus:outline-none focus:ring-1 focus:ring-[#3A9D7C]"
          >
            {ORGANISM_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#64748B]">Reference database</span>
          <select
            value={refDb}
            onChange={(e) => setRefDb(e.target.value)}
            className="text-sm border border-[#D9E2E7] rounded-lg px-2.5 py-1.5 bg-white text-[#334155] focus:outline-none focus:ring-1 focus:ring-[#3A9D7C]"
          >
            {REF_DB_OPTIONS.map((d) => <option key={d}>{d}</option>)}
          </select>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-6 gap-3">
        {[
          { label: "Precision", value: `${res.precision}%`, color: "text-[#3A9D7C]" },
          { label: "Recall", value: `${res.recall}%`, color: "text-[#3B82B8]" },
          { label: "F1 Score", value: `${res.f1}%`, color: "text-[#55B8A5]" },
          { label: "True Positives", value: (res.tp ?? 0).toLocaleString(), color: "text-[#176B57]" },
          { label: "False Positives", value: (res.fp ?? 0).toLocaleString(), color: "text-[#D96C6C]" },
          { label: "False Negatives", value: (res.fn ?? 0).toLocaleString(), color: "text-[#E9B949]" },
        ].map((m) => (
          <div key={m.label} className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-4">
            <div className={`text-xl font-bold font-mono ${m.color}`}>{m.value}</div>
            <div className="text-[11px] text-[#64748B] mt-1">{m.label}</div>
          </div>
        ))}
      </div>

      {/* Chart + slider */}
      <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-[#334155]">
              Precision / Recall vs Threshold
            </h3>
            <p className="text-xs text-[#64748B]">
              Threshold at{" "}
              <span className="font-mono font-medium text-[#334155]">{threshold.toFixed(2)}</span>
              : Precision{" "}
              <span className="text-[#3A9D7C] font-mono font-medium">
                {(currentPoint.precision * 100).toFixed(0)}%
              </span>{" "}
              · Recall{" "}
              <span className="text-[#3B82B8] font-mono font-medium">
                {(currentPoint.recall * 100).toFixed(0)}%
              </span>
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <label className="text-[10px] text-[#64748B]">Threshold</label>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-[#94A3B8]">0.5</span>
              <input
                type="range"
                min={0.5}
                max={1.0}
                step={0.05}
                value={threshold}
                onChange={(e) => setThreshold(parseFloat(e.target.value))}
                className="w-36 accent-[#3A9D7C]"
              />
              <span className="text-xs font-mono text-[#94A3B8]">1.0</span>
            </div>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={prCurveData} margin={{ top: 5, right: 16, bottom: 20, left: -10 }}>
            <CartesianGrid strokeDasharray="2 2" stroke="#F0F4F8" />
            <XAxis
              dataKey="threshold"
              tick={{ fontSize: 11, fill: "#64748B" }}
              label={{ value: "Prediction threshold", position: "insideBottom", offset: -10, fontSize: 11, fill: "#64748B" }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#64748B" }}
              tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
              domain={[0, 1]}
            />
            <Tooltip
              contentStyle={{ fontSize: 11, borderColor: "#D9E2E7", borderRadius: 8 }}
              formatter={(v) => `${(v * 100).toFixed(0)}%`}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine x={threshold} stroke="#E9B949" strokeDasharray="4 3" strokeWidth={1.5} />
            <Line type="monotone" dataKey="precision" stroke="#3A9D7C" strokeWidth={2.5} dot={false} name="Precision" />
            <Line type="monotone" dataKey="recall" stroke="#3B82B8" strokeWidth={2.5} dot={false} name="Recall" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Confusion matrix visual */}
      <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-5">
        <h3 className="text-sm font-semibold text-[#334155] mb-4">Prediction Summary</h3>
        <div className="grid grid-cols-3 gap-3 max-w-md">
          {[
            { label: "True Positives", value: res.tp ?? 0, color: "#E8F5F0", border: "#B8DDD0", text: "#176B57" },
            { label: "False Positives", value: res.fp ?? 0, color: "#FEF0F0", border: "#F8BFBF", text: "#D96C6C" },
            { label: "False Negatives", value: res.fn ?? 0, color: "#FFFBEB", border: "#FCEDB8", text: "#92400E" },
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
    </div>
  );
}

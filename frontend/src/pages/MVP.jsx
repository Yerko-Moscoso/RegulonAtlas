import { useState, useEffect } from "react";
import { CheckCircle2, Clock, AlertCircle, Loader2 } from "lucide-react";
import { api } from "../services/api";

export default function MVP() {
  // Estados de datos reales
  const [mvpMetrics, setMvpMetrics] = useState([]);
  const [mvpStatus, setMvpStatus] = useState([]);
  const [organismsSubset, setOrganismsSubset] = useState([]);
  const [features, setFeatures] = useState([]);
  const [validationSnapshot, setValidationSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchMvpStatus = async () => {
      try {
        setLoading(true);
        setError("");
        // TODO: ajustar a tu endpoint real, se asume:
        // GET /api/mvp/status
        const response = await api.getMvpStatus();
        const data = response.data || {};

        setMvpMetrics(data.metrics || []);
        setMvpStatus(data.milestones || []);
        setOrganismsSubset(data.organismsSubset || []);
        setFeatures(data.features || []);
        setValidationSnapshot(data.validationSnapshot || null);
      } catch (err) {
        console.error("Error al cargar el estado del MVP:", err);
        setError("No se pudo cargar el estado del MVP desde el servidor.");
      } finally {
        setLoading(false);
      }
    };

    fetchMvpStatus();
  }, []);

  const doneCount = mvpStatus.filter((s) => s.done).length;

  return (
    <div className="space-y-6 max-w-[1000px] relative">
      {loading && (
        <div className="absolute inset-0 bg-white/70 flex flex-col items-center justify-center z-20">
          <Loader2 className="w-8 h-8 text-[#3A9D7C] animate-spin mb-2" />
          <p className="text-sm text-[#64748B]">Cargando estado del MVP...</p>
        </div>
      )}

      {error && (
        <div className="bg-[#FEF0F0] border border-[#F8BFBF] text-[#D96C6C] text-sm rounded-lg px-4 py-2.5">
          {error}
        </div>
      )}

      {/* Banner */}
      <div className="bg-gradient-to-r from-[#E8F5F0] to-[#DCEFFA] rounded-xl border border-[#B8DDD0] p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs bg-[#3A9D7C] text-white px-2 py-0.5 rounded font-mono font-bold">
                MVP
              </span>
              <span className="text-xs text-[#64748B]">Week 8 Milestone</span>
            </div>
            <h1 className="text-2xl font-semibold text-[#334155]">Minimum Viable Product</h1>
            <p className="text-sm text-[#64748B] mt-1 max-w-xl">
              End-to-end reproducible pipeline using a reduced organism subset. Demonstrates
              full flow from data ingestion to validated network metrics and interactive
              dashboard.
            </p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-3xl font-bold font-mono text-[#3A9D7C]">
              {doneCount}/{mvpStatus.length || 0}
            </div>
            <div className="text-xs text-[#64748B] mt-1">objectives met</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-5">
        {/* MVP status */}
        <div className="col-span-1 space-y-4">
          <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-5">
            <h2 className="text-sm font-semibold text-[#334155] mb-3">MVP Status</h2>
            <div className="space-y-2">
              {mvpStatus.map((s) => (
                <div key={s.label} className="flex items-start gap-2.5">
                  {s.done ? (
                    <CheckCircle2 size={15} className="text-[#3A9D7C] shrink-0 mt-0.5" />
                  ) : (
                    <Clock size={15} className="text-[#CBD5E1] shrink-0 mt-0.5" />
                  )}
                  <span className={`text-xs leading-snug ${s.done ? "text-[#334155]" : "text-[#94A3B8]"}`}>
                    {s.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-5">
            <h2 className="text-sm font-semibold text-[#334155] mb-3">
              Organisms Subset ({organismsSubset.length})
            </h2>
            <div className="space-y-1.5">
              {organismsSubset.map((o) => (
                <div key={o.id || o.name} className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${o.included ? "bg-[#3A9D7C]" : "bg-[#CBD5E1]"}`} />
                  <span className="text-[11px] text-[#334155]">{o.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Metrics + features */}
        <div className="col-span-2 space-y-4">
          {/* 5 basic metrics */}
          <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-5">
            <h2 className="text-sm font-semibold text-[#334155] mb-3">5 Basic Metrics (MVP scope)</h2>
            <div className="grid grid-cols-5 gap-3">
              {mvpMetrics.map((m) => (
                <div key={m.label} className="bg-[#F7FAFC] rounded-lg border border-[#D9E2E7] p-3 text-center">
                  <div className="text-base font-bold font-mono text-[#3A9D7C]">{m.value}</div>
                  <div className="text-[10px] font-medium text-[#334155] mt-0.5">{m.label}</div>
                  <div className="text-[9px] text-[#94A3B8] mt-0.5 leading-tight">{m.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Feature list */}
          <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-5">
            <h2 className="text-sm font-semibold text-[#334155] mb-3">MVP Features</h2>
            <div className="grid grid-cols-2 gap-3">
              {features.map((f) => (
                <div
                  key={f.title}
                  className={`rounded-lg border p-3.5 ${
                    f.done ? "bg-[#F7FAFC] border-[#D9E2E7]" : "bg-[#FAFAFA] border-dashed border-[#D9E2E7]"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    {f.done ? (
                      <CheckCircle2 size={14} className="text-[#3A9D7C] shrink-0" />
                    ) : (
                      <AlertCircle size={14} className="text-[#CBD5E1] shrink-0" />
                    )}
                    <span className={`text-xs font-semibold ${f.done ? "text-[#334155]" : "text-[#94A3B8]"}`}>
                      {f.title}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#64748B] leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Validation snapshot */}
          {validationSnapshot && (
            <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-5">
              <h2 className="text-sm font-semibold text-[#334155] mb-3">
                {validationSnapshot.organism || "Reference"} Validation Snapshot
              </h2>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Precision", value: `${validationSnapshot.precision}%`, color: "#3A9D7C" },
                  { label: "Recall", value: `${validationSnapshot.recall}%`, color: "#3B82B8" },
                  { label: "F1 Score", value: `${validationSnapshot.f1}%`, color: "#55B8A5" },
                ].map((m) => (
                  <div key={m.label} className="rounded-lg border border-[#D9E2E7] p-3 text-center">
                    <div className="text-2xl font-bold font-mono" style={{ color: m.color }}>
                      {m.value}
                    </div>
                    <div className="text-xs text-[#64748B] mt-0.5">{m.label}</div>
                  </div>
                ))}
              </div>
              <div className="mt-3 text-[10px] text-[#94A3B8]">
                vs. {validationSnapshot.referenceDb} · threshold {validationSnapshot.threshold} · region {validationSnapshot.region}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

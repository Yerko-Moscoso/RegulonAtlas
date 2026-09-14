import { useState, useEffect } from "react";
import { ArrowLeft, Network, Loader2 } from "lucide-react";
import { api } from "../services/api"; // Importamos tu servicio de conexión
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const tabs = ["Overview", "Network", "Metrics", "Validation", "Robustness", "Data"];

// Métricas estáticas temporales hasta conectar el endpoint de grafos
const mockMetrics = [
  { label: "Nodes", value: "0", mono: true },
  { label: "Edges", value: "0", mono: true },
  { label: "Density", value: "0.0000", mono: true },
  { label: "Avg Degree", value: "0.00", mono: true },
  { label: "Modularity", value: "0.000", mono: true },
  { label: "Hubs", value: "0", mono: true },
];

const thresholdCurve = [
  { t: "0.5", precision: 52, recall: 88 },
  { t: "0.65", precision: 62, recall: 79 },
  { t: "0.75", precision: 69, recall: 71 },
  { t: "0.85", precision: 72, recall: 64 },
  { t: "0.95", precision: 82, recall: 42 },
];

export default function OrganismDetail({ navigate, organismId }) {
  const [tab, setTab] = useState("Overview");
  
  // Nuevos estados para manejar la API
  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState(null);

  useEffect(() => {
    const fetchOrganismDetails = async () => {
      try {
        setLoading(true);
        // Traemos la lista de genomas para encontrar los metadatos del seleccionado
        const response = await api.getGenomes(0, 100);
        const found = response.data.items.find(item => item.accession === organismId);
        
        if (found) {
          setOrg({
            id: found.accession,
            name: found.ncbi_organism || "Organismo Desconocido",
            taxonomy: found.assembly_level || "Unknown",
            status: "Analyzed",
            genome: found.completeness || 0,
            genes: 0,      // Por conectar a BD (Tabla genes)
            operons: 0,    // Por conectar a BD (Tabla operons)
            tfs: 0,        // Por conectar a BD
            predictedInteractions: 0, 
            curatedInteractions: 0,   
            precision: 0.72, // Simulado hasta conectar validación
            recall: 0.64,
            f1: 0.68
          });
        }
      } catch (err) {
        console.error("Error al cargar los detalles:", err);
      } finally {
        setLoading(false);
      }
    };

    if (organismId) {
      fetchOrganismDetails();
    }
  }, [organismId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-[#3A9D7C] animate-spin mb-4" />
        <p className="text-sm text-[#64748B]">Cargando metadatos del organismo...</p>
      </div>
    );
  }

  if (!org) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <p className="text-[#64748B] text-sm">No se encontró información para el genoma: {organismId}</p>
        <button onClick={() => navigate("organisms")} className="mt-3 text-sm text-[#3A9D7C] hover:underline">
          Volver al catálogo
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-[1100px]">
      {/* Back + title */}
      <div>
        <button
          onClick={() => navigate("organisms")}
          className="flex items-center gap-1.5 text-sm text-[#64748B] hover:text-[#3A9D7C] mb-3 transition-colors"
        >
          <ArrowLeft size={14} /> Back to Organisms
        </button>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-[#334155]">{org.name}</h1>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-sm text-[#64748B] font-mono">{org.id}</span>
              <span className="text-sm text-[#64748B]">· {org.taxonomy}</span>
              <span className="text-[11px] bg-[#E8F5F0] text-[#176B57] px-2 py-0.5 rounded-full font-medium">
                {org.status}
              </span>
            </div>
          </div>
          <button
            onClick={() => navigate("networks", org.id)}
            className="flex items-center gap-2 px-3.5 py-2 bg-[#3A9D7C] text-white text-sm rounded-lg hover:bg-[#176B57] transition-colors"
          >
            <Network size={14} /> View Network
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-6 gap-3">
        {[
          { label: "Completeness", value: `${org.genome}%` },
          { label: "Genes", value: org.genes.toLocaleString() },
          { label: "Operons", value: org.operons.toLocaleString() },
          { label: "TFs", value: org.tfs },
          { label: "Predicted", value: org.predictedInteractions.toLocaleString() },
          { label: "Curated", value: org.curatedInteractions.toLocaleString() },
        ].map((s) => (
          <div
            key={s.label}
            className="bg-white rounded-xl border border-[#D9E2E7] p-4 shadow-sm text-center"
          >
            <div className="text-lg font-bold font-mono text-[#334155]">{s.value}</div>
            <div className="text-[11px] text-[#64748B] mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm overflow-hidden">
        <div className="border-b border-[#D9E2E7] flex px-5">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-3.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t
                  ? "border-[#3A9D7C] text-[#3A9D7C]"
                  : "border-transparent text-[#64748B] hover:text-[#334155]"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="p-6">
          {tab === "Overview" && (
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-[#334155] mb-2">
                  Organism Summary
                </h3>
                <p className="text-sm text-[#64748B] leading-relaxed">
                  <span className="font-medium text-[#334155]">{org.name}</span> is a{" "}
                  {org.taxonomy} with a completeness of {org.genome}% encoding {org.genes.toLocaleString()} genes
                  organized in {org.operons.toLocaleString()} operons. The framework identified{" "}
                  {org.tfs} transcription factor orthologs and generated{" "}
                  {org.predictedInteractions.toLocaleString()} regulatory interactions by PWM
                  scanning with FIMO.
                </p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#334155] mb-3">
                  Topological metrics
                </h3>
                <div className="grid grid-cols-6 gap-3">
                  {mockMetrics.map((m) => (
                    <div
                      key={m.label}
                      className="bg-[#F7FAFC] rounded-lg border border-[#D9E2E7] p-3 text-center"
                    >
                      <div className="text-base font-bold font-mono text-[#334155]">
                        {m.value}
                      </div>
                      <div className="text-[10px] text-[#64748B] mt-0.5">{m.label}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-[#E8F5F0] rounded-lg p-4 border border-[#B8DDD0]">
                <div className="text-xs font-semibold text-[#176B57] mb-1">
                  Data sources
                </div>
                <div className="text-xs text-[#3A9D7C] space-y-0.5">
                  <div>PWMs: RegPrecise 3.2 + PRODORIC 8.4</div>
                  <div>Genome: NCBI RefSeq {org.id}</div>
                  <div>Validation: {org.status === "Validated" ? "RegulonDB 12.0" : "N/A"}</div>
                </div>
              </div>
            </div>
          )}

          {tab === "Validation" && (
            <div className="space-y-5">
              {org.precision ? (
                <>
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { label: "Precision", value: `${(org.precision * 100).toFixed(0)}%`, color: "text-[#3A9D7C]" },
                      { label: "Recall", value: `${(org.recall * 100).toFixed(0)}%`, color: "text-[#3B82B8]" },
                      { label: "F1 Score", value: `${(org.f1 * 100).toFixed(0)}%`, color: "text-[#55B8A5]" },
                    ].map((m) => (
                      <div
                        key={m.label}
                        className="bg-white rounded-lg border border-[#D9E2E7] p-4 text-center"
                      >
                        <div className={`text-2xl font-bold font-mono ${m.color}`}>
                          {m.value}
                        </div>
                        <div className="text-xs text-[#64748B] mt-1">{m.label}</div>
                      </div>
                    ))}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-[#334155] mb-3">
                      Precision / Recall vs Threshold
                    </h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={thresholdCurve}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F0F4F8" />
                        <XAxis dataKey="t" tick={{ fontSize: 11, fill: "#64748B" }} label={{ value: "Threshold", position: "insideBottom", offset: -2, fontSize: 11, fill: "#64748B" }} />
                        <YAxis tick={{ fontSize: 11, fill: "#64748B" }} domain={[0, 100]} />
                        <Tooltip formatter={(v) => `${v}%`} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Line type="monotone" dataKey="precision" stroke="#3A9D7C" strokeWidth={2} dot={false} name="Precision" />
                        <Line type="monotone" dataKey="recall" stroke="#3B82B8" strokeWidth={2} dot={false} name="Recall" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-40 text-[#64748B] text-sm">
                  Validation not yet performed for this organism.
                </div>
              )}
            </div>
          )}

          {(tab === "Network" || tab === "Metrics" || tab === "Robustness" || tab === "Data") && (
            <div className="flex items-center justify-center h-40 text-sm text-[#64748B]">
              <div className="text-center">
                <div className="mb-2 text-[#94A3B8]">Navigate to the dedicated page for full analysis.</div>
                <button
                  onClick={() =>
                    navigate(
                      tab === "Network" ? "networks" :
                      tab === "Metrics" ? "metrics" :
                      tab === "Robustness" ? "robustness" : "provenance"
                    )
                  }
                  className="text-sm text-[#3A9D7C] hover:text-[#176B57] flex items-center gap-1 mx-auto"
                >
                  Open {tab} →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
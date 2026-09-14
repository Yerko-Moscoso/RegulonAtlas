import { useState, useEffect } from "react";
import { CheckCircle2, Circle, Loader2, X } from "lucide-react";
import { api } from "../services/api";

export default function Pipeline() {
  const [selected, setSelected] = useState(null);

  // Estados de datos reales
  const [pipelineStages, setPipelineStages] = useState([]);
  const [dataSources, setDataSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchPipeline = async () => {
      try {
        setLoading(true);
        setError("");
        // TODO: ajustar a tu endpoint real, se asume:
        // GET /api/pipeline/status
        const response = await api.getPipelineStatus();
        setPipelineStages(response.data?.stages || []);
        // TODO: ajustar a tu endpoint real si las fuentes de datos vienen aparte:
        // GET /api/pipeline/data-sources
        setDataSources(
          response.data?.dataSources || [
            { name: "PRODORIC", type: "PWM database", color: "#3A9D7C" },
            { name: "RegPrecise", type: "PWM snapshot", color: "#3A9D7C" },
            { name: "NCBI RefSeq", type: "Genomes", color: "#3B82B8" },
            { name: "KEGG", type: "Operons", color: "#3B82B8" },
            { name: "RegulonDB", type: "Validation", color: "#55B8A5" },
          ]
        );
      } catch (err) {
        console.error("Error al cargar el estado del pipeline:", err);
        setError("No se pudo cargar el estado del pipeline desde el servidor.");
        setPipelineStages([]);
      } finally {
        setLoading(false);
      }
    };

    fetchPipeline();
  }, []);

  const selectedStage = pipelineStages.find((s) => s.id === selected);

  const statusIcon = (status) => {
    if (status === "Completed") return <CheckCircle2 size={18} className="text-[#3A9D7C]" />;
    if (status === "Running") return <Loader2 size={18} className="text-[#3B82B8] animate-spin" />;
    return <Circle size={18} className="text-[#CBD5E1]" />;
  };

  const statusStyle = (status) => {
    if (status === "Completed") return "bg-[#E8F5F0] text-[#176B57] border-[#B8DDD0]";
    if (status === "Running") return "bg-[#DCEFFA] text-[#2563A0] border-[#9ED1F0]";
    return "bg-[#F7FAFC] text-[#64748B] border-[#D9E2E7]";
  };

  const completedCount = pipelineStages.filter((s) => s.status === "Completed").length;

  return (
    <div className="space-y-5 max-w-[1100px] relative">
      {loading && (
        <div className="absolute inset-0 bg-white/70 flex flex-col items-center justify-center z-20">
          <Loader2 className="w-8 h-8 text-[#3A9D7C] animate-spin mb-2" />
          <p className="text-sm text-[#64748B]">Consultando estado del pipeline...</p>
        </div>
      )}

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#334155]">Reproducible Pipeline</h1>
          <p className="text-sm text-[#64748B] mt-1">
            End-to-end computational pipeline from raw data sources to interactive dashboard.
          </p>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold font-mono text-[#3A9D7C]">
            {completedCount}/{pipelineStages.length || 0}
          </div>
          <div className="text-xs text-[#64748B]">steps completed</div>
        </div>
      </div>

      {error && (
        <div className="bg-[#FEF0F0] border border-[#F8BFBF] text-[#D96C6C] text-sm rounded-lg px-4 py-2.5">
          {error}
        </div>
      )}

      {/* Progress */}
      <div className="h-2 bg-[#F0F4F8] rounded-full">
        <div
          className="h-full bg-[#3A9D7C] rounded-full transition-all"
          style={{ width: `${pipelineStages.length ? (completedCount / pipelineStages.length) * 100 : 0}%` }}
        />
      </div>

      <div className="flex gap-5">
        {/* Pipeline diagram */}
        <div className="flex-1 bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-5">
          <div className="space-y-1">
            {pipelineStages.map((stage, idx) => (
              <div key={stage.id}>
                <div
                  className={`flex items-center gap-4 p-3 rounded-lg cursor-pointer transition-colors ${
                    selected === stage.id
                      ? "bg-[#E8F5F0] border border-[#B8DDD0]"
                      : "hover:bg-[#F7FAFC] border border-transparent"
                  }`}
                  onClick={() => setSelected(selected === stage.id ? null : stage.id)}
                >
                  <div className="shrink-0">{statusIcon(stage.status)}</div>

                  <div className="w-5 h-5 rounded-full bg-[#F0F4F8] flex items-center justify-center shrink-0">
                    <span className="text-[9px] font-mono font-semibold text-[#64748B]">
                      {idx + 1}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div
                      className={`text-sm font-medium ${
                        stage.status === "Pending" ? "text-[#94A3B8]" : "text-[#334155]"
                      }`}
                    >
                      {stage.name}
                    </div>
                    <div className="text-[10px] text-[#94A3B8] font-mono">{stage.tool}</div>
                  </div>

                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-medium border shrink-0 ${statusStyle(stage.status)}`}
                  >
                    {stage.status}
                  </span>

                  {stage.outputs && stage.outputs !== "—" && (
                    <div className="text-[10px] text-[#64748B] font-mono shrink-0 hidden lg:block">
                      {stage.outputs}
                    </div>
                  )}
                </div>

                {idx < pipelineStages.length - 1 && (
                  <div className="ml-6 flex items-center gap-1 py-0.5">
                    <div className="w-px h-4 bg-[#D9E2E7] ml-2" />
                    <svg width="12" height="8" viewBox="0 0 12 8">
                      <polygon points="0 0, 12 0, 6 8" fill="#D9E2E7" />
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Detail panel */}
        <div className="w-72 shrink-0">
          {selectedStage ? (
            <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-5 sticky top-0">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  {statusIcon(selectedStage.status)}
                  <h3 className="text-sm font-semibold text-[#334155]">{selectedStage.name}</h3>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#F7FAFC]"
                >
                  <X size={13} className="text-[#94A3B8]" />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wider mb-1">
                    Tool / Environment
                  </div>
                  <div className="text-xs font-mono text-[#334155] bg-[#F7FAFC] px-2.5 py-1.5 rounded-lg border border-[#D9E2E7]">
                    {selectedStage.tool}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wider mb-1">
                    Status
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium border ${statusStyle(selectedStage.status)}`}>
                    {selectedStage.status}
                  </span>
                </div>

                <div>
                  <div className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wider mb-1">
                    Description
                  </div>
                  <p className="text-xs text-[#64748B] leading-relaxed">
                    {selectedStage.description}
                  </p>
                </div>

                <div>
                  <div className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wider mb-1">
                    Outputs
                  </div>
                  <div className="text-xs font-mono text-[#334155]">{selectedStage.outputs}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-[#D9E2E7] border-dashed h-48 flex items-center justify-center">
              <p className="text-xs text-[#94A3B8] text-center px-4">
                Click a pipeline step to view its details, tool, and outputs.
              </p>
            </div>
          )}

          {/* Data flow summary */}
          <div className="mt-4 bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-4">
            <div className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wider mb-3">
              Data Sources
            </div>
            {dataSources.map((src) => (
              <div key={src.name} className="flex items-center gap-2 mb-1.5">
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: src.color }} />
                <span className="text-xs font-medium text-[#334155]">{src.name}</span>
                <span className="text-[10px] text-[#64748B]">— {src.type}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

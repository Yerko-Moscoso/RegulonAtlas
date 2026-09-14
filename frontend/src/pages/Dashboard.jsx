import {
  Dna,
  Network,
  Zap,
  Users,
  BarChart3,
  CircleCheck,
  TrendingUp,
  ArrowRight,
  CheckCircle2,
  Circle,
} from "lucide-react";

// 1. Datos simulados locales para no depender de archivos externos rotos
const pipelineStages = [
  { id: 1, name: "Data Ingestion", tool: "PRODORIC/RegPrecise", status: "Completed" },
  { id: 2, name: "Motif Scanning", tool: "FIMO", status: "Completed" },
  { id: 3, name: "Network Inference", tool: "NetworkX", status: "Completed" },
  { id: 4, name: "Topology Metrics", tool: "Python/Pandas", status: "Completed" },
  { id: 5, name: "Validation", tool: "RegulonDB Benchmark", status: "Completed" }
];

// Reemplazamos temporalmente la lista por los que sacaste de MariaDB
const recentOrganisms = [
  { id: "GCF_018304825.1", shortName: "Chloracidobacterium validum", taxonomy: "Complete Genome", status: "Analyzed", predictedInteractions: 344188, precision: 0.72, recall: 0.64, lastRun: "2h ago" },
  { id: "GCF_030295385.1", shortName: "Geothrix oryzae", taxonomy: "Complete Genome", status: "Analyzed", predictedInteractions: 125000, precision: 0.81, recall: 0.75, lastRun: "5h ago" }
];

function StatusBadge({ status }) {
  const map = {
    Validated: "bg-[#E8F5F0] text-[#176B57]",
    Analyzed: "bg-[#DCEFFA] text-[#2563A0]",
    Running: "bg-[#FEF3C7] text-[#92400E]",
    Pending: "bg-[#F7FAFC] text-[#64748B]",
    Completed: "bg-[#E8F5F0] text-[#176B57]",
  };
  const dotMap = {
    Validated: "bg-[#3A9D7C]",
    Analyzed: "bg-[#3B82B8]",
    Running: "bg-[#E9B949]",
    Pending: "bg-[#94A3B8]",
    Completed: "bg-[#3A9D7C]",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${map[status] || map.Pending}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotMap[status] || dotMap.Pending}`} />
      {status}
    </span>
  );
}

// 2. KPIs ajustados a la realidad de tu pipeline bioinformático
const kpis = [
  {
    icon: Dna,
    value: "2,224",
    label: "Organisms analyzed",
    color: "text-[#3A9D7C]",
    bg: "bg-[#E8F5F0]",
    trend: "MVP ready",
  },
  {
    icon: Network,
    value: "2,224",
    label: "Networks generated",
    color: "text-[#3B82B8]",
    bg: "bg-[#DCEFFA]",
    trend: "100%",
  },
  {
    icon: Zap,
    value: "344k+",
    label: "Predicted interactions",
    color: "text-[#55B8A5]",
    bg: "bg-[#E8F5F0]",
    trend: "+FIMO hits",
  },
  {
    icon: Users,
    value: "4,889",
    label: "Transcription factors",
    color: "text-[#3A9D7C]",
    bg: "bg-[#E8F5F0]",
    trend: "Curated",
  },
  {
    icon: BarChart3,
    value: "11,120",
    label: "Metrics calculated",
    color: "text-[#3B82B8]",
    bg: "bg-[#DCEFFA]",
    trend: "Topological",
  },
  {
    icon: CircleCheck,
    value: "1",
    label: "Validated organisms",
    color: "text-[#176B57]",
    bg: "bg-[#E8F5F0]",
    trend: "E. coli K-12",
  },
];

export default function Dashboard({ navigate }) {
  const completedCount = pipelineStages.filter(
    (s) => s.status === "Completed"
  ).length;

  return (
    <div className="space-y-6 max-w-[1200px]">
      <div>
        <h1 className="text-2xl font-semibold text-[#334155]">Analysis Overview</h1>
        <p className="text-sm text-[#64748B] mt-1">
          Construction, characterization, validation and robustness analysis of
          bacterial regulatory networks.
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-6 gap-3">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <div
              key={k.label}
              className="bg-white rounded-xl border border-[#D9E2E7] p-4 shadow-sm"
            >
              <div className="flex items-start justify-between mb-3">
                <div
                  className={`w-8 h-8 rounded-lg ${k.bg} flex items-center justify-center`}
                >
                  <Icon size={16} className={k.color} />
                </div>
                <div className="flex items-center gap-1 text-[10px] text-[#3A9D7C]">
                  <TrendingUp size={11} />
                  {k.trend}
                </div>
              </div>
              <div className="text-[22px] font-bold font-mono text-[#334155] leading-none mb-1">
                {k.value}
              </div>
              <div className="text-[11px] text-[#64748B] leading-tight">{k.label}</div>
            </div>
          );
        })}
      </div>

      {/* Lower row */}
      <div className="grid grid-cols-3 gap-5">
        {/* Pipeline status */}
        <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-[#334155]">Pipeline Status</h2>
            <span className="text-xs text-[#64748B] font-mono">
              {completedCount}/{pipelineStages.length}
            </span>
          </div>
          <div className="h-1.5 bg-[#F0F4F8] rounded-full mb-4">
            <div
              className="h-full bg-[#3A9D7C] rounded-full"
              style={{ width: `${(completedCount / pipelineStages.length) * 100}%` }}
            />
          </div>
          <div className="space-y-0.5 overflow-y-auto max-h-64">
            {pipelineStages.map((stage) => (
              <div key={stage.id} className="flex items-center gap-3 py-1.5">
                <div className="shrink-0">
                  {stage.status === "Completed" ? (
                    <CheckCircle2 size={15} className="text-[#3A9D7C]" />
                  ) : stage.status === "Running" ? (
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-[#3B82B8] border-t-transparent animate-spin" />
                  ) : (
                    <Circle size={15} className="text-[#CBD5E1]" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div
                    className={`text-xs font-medium truncate ${
                      stage.status === "Completed"
                        ? "text-[#334155]"
                        : stage.status === "Running"
                          ? "text-[#3B82B8]"
                          : "text-[#94A3B8]"
                    }`}
                  >
                    {stage.name}
                  </div>
                  <div className="text-[10px] text-[#94A3B8] font-mono truncate">
                    {stage.tool}
                  </div>
                </div>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
                    stage.status === "Completed"
                      ? "bg-[#E8F5F0] text-[#176B57]"
                      : stage.status === "Running"
                        ? "bg-[#DCEFFA] text-[#2563A0]"
                        : "bg-[#F0F4F8] text-[#94A3B8]"
                  }`}
                >
                  {stage.status}
                </span>
              </div>
            ))}
          </div>
          <button
            onClick={() => navigate("pipeline")}
            className="w-full mt-4 flex items-center justify-center gap-1.5 text-xs text-[#3A9D7C] hover:text-[#176B57] py-1.5 border border-[#D9E2E7] rounded-lg hover:bg-[#F7FAFC] transition-colors"
          >
            View full pipeline <ArrowRight size={11} />
          </button>
        </div>

        {/* Recent analyses */}
        <div className="col-span-2 bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-[#334155]">Recent Analyses</h2>
            <button
              onClick={() => navigate("organisms")}
              className="flex items-center gap-1 text-xs text-[#3A9D7C] hover:text-[#176B57]"
            >
              View all <ArrowRight size={11} />
            </button>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#D9E2E7]">
                {["Organism", "Status", "Network", "Precision", "Recall", "Last run"].map(
                  (h) => (
                    <th
                      key={h}
                      className="text-left text-[11px] font-medium text-[#64748B] pb-2 pr-3 last:pr-0"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {recentOrganisms.map((org) => (
                <tr
                  key={org.id}
                  className="border-b border-[#F7FAFC] last:border-0 hover:bg-[#F7FAFC] cursor-pointer transition-colors"
                  onClick={() => navigate("organism-detail", org.id)}
                >
                  <td className="py-2.5 pr-3">
                    <div className="text-[12px] font-medium text-[#334155]">
                      {org.shortName}
                    </div>
                    <div className="text-[10px] text-[#64748B] font-mono">
                      {org.taxonomy}
                    </div>
                  </td>
                  <td className="py-2.5 pr-3">
                    <StatusBadge status={org.status} />
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-[12px] text-[#334155]">
                    {org.predictedInteractions.toLocaleString()}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-[12px] text-[#334155]">
                    {org.precision ? `${(org.precision * 100).toFixed(0)}%` : "—"}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-[12px] text-[#334155]">
                    {org.recall ? `${(org.recall * 100).toFixed(0)}%` : "—"}
                  </td>
                  <td className="py-2.5 text-[11px] text-[#64748B] font-mono">
                    {org.lastRun}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { api } from "../services/api";
import { PROJECT_NAME } from "../config/constants";
import { COMPARISON_ACCESSIONS } from "../constants/comparisonGenomes";

const labels = {
  dashboard: "Dashboard",
  organisms: "Organisms",
  "organism-detail": "Organism Detail",
  networks: "Regulatory Networks",
  metrics: "Topological Metrics",
  validation: "Validation",
};

const HEALTH_INTERVAL_MS = 30000;

const statusStyle = {
  checking: { dot: "bg-[#94A3B8]", text: "Checking backend..." },
  online: { dot: "bg-[#3A9D7C]", text: "Backend online" },
  offline: { dot: "bg-[#D96C6C]", text: "Backend offline" },
};

export default function Header({ page }) {
  const [status, setStatus] = useState("checking");

  // Estado real del backend (GET /health) en vez de un "online" fijo.
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        await api.getHealth();
        if (!cancelled) setStatus("online");
      } catch {
        if (!cancelled) setStatus("offline");
      }
    };
    check();
    const id = setInterval(check, HEALTH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const s = statusStyle[status];

  return (
    <header className="h-16 bg-white border-b border-[#D9E2E7] flex items-center px-6 gap-6 shrink-0 z-10">
      <div className="flex items-center gap-1.5 text-sm whitespace-nowrap">
        <span className="text-[#3A9D7C] font-medium">{PROJECT_NAME}</span>
        <ChevronRight size={13} className="text-[#94A3B8]" />
        <span className="text-[#334155]">{labels[page] ?? ""}</span>
      </div>

      <div className="ml-auto flex items-center gap-5">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-[#64748B] text-xs">Dataset</span>
          <span className="font-medium text-[#334155] text-xs bg-[#F7FAFC] border border-[#D9E2E7] px-2 py-0.5 rounded">
            {COMPARISON_ACCESSIONS.length} Enterobacteriaceae genomes
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full inline-block ${s.dot}`} />
          <span className="text-xs text-[#64748B]">{s.text}</span>
        </div>
      </div>
    </header>
  );
}

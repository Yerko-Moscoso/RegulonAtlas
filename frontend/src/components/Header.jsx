import { Search, ChevronRight } from "lucide-react";
import { PROJECT_NAME } from "../config/constants";

const labels = {
  dashboard: "Dashboard",
  organisms: "Organisms",
  "organism-detail": "Organism Detail",
  networks: "Regulatory Networks",
  metrics: "Topological Metrics",
  fingerprints: "Fingerprints",
  validation: "Validation",
  robustness: "Robustness Analysis",
  comparison: "Organism Comparison",
  pipeline: "Pipeline",
  provenance: "Data Provenance",
  settings: "Settings",
  mvp: "MVP — Week 8",
};

export default function Header({ page }) {
  return (
    <header className="h-16 bg-white border-b border-[#D9E2E7] flex items-center px-6 gap-6 shrink-0 z-10">
      <div className="flex items-center gap-1.5 text-sm whitespace-nowrap">
        <span className="text-[#3A9D7C] font-medium">{PROJECT_NAME}</span>
        <ChevronRight size={13} className="text-[#94A3B8]" />
        <span className="text-[#334155]">{labels[page]}</span>
      </div>

      <div className="flex-1 max-w-sm relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
        <input
          type="text"
          placeholder="Search organism, TF, gene..."
          className="w-full pl-9 pr-4 py-1.5 text-sm bg-[#F7FAFC] border border-[#D9E2E7] rounded-lg text-[#334155] placeholder-[#94A3B8] focus:outline-none focus:ring-1 focus:ring-[#3A9D7C] focus:border-[#3A9D7C] transition-all"
        />
      </div>

      <div className="ml-auto flex items-center gap-5">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-[#64748B] text-xs">Dataset</span>
          <span className="font-medium text-[#334155] font-mono text-xs bg-[#F7FAFC] border border-[#D9E2E7] px-2 py-0.5 rounded">
            RegPrecise 3.2
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#3A9D7C] inline-block" />
          <span className="text-xs text-[#64748B]">Framework online</span>
        </div>
        <div className="w-8 h-8 rounded-full bg-[#3A9D7C] flex items-center justify-center text-white text-sm font-semibold">
          R
        </div>
      </div>
    </header>
  );
}
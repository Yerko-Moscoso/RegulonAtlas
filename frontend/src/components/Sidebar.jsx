import {
  LayoutDashboard,
  Dna,
  Network,
  BarChart3,
  Radar,
  CircleCheck,
  ShieldCheck,
  GitCompare,
  Workflow,
  Database,
  Settings,
} from "lucide-react";
import { PROJECT_NAME } from "../config/constants";
const navGroups = [
  {
    title: "OVERVIEW",
    items: [{ id: "dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    title: "ANALYSIS",
    items: [
      { id: "organisms", label: "Organisms", icon: Dna },
      { id: "networks", label: "Regulatory Networks", icon: Network },
      { id: "metrics", label: "Metrics", icon: BarChart3 },
      { id: "fingerprints", label: "Fingerprints", icon: Radar },
      { id: "validation", label: "Validation", icon: CircleCheck },
      { id: "robustness", label: "Robustness", icon: ShieldCheck },
      { id: "comparison", label: "Comparison", icon: GitCompare },
    ],
  },
  {
    title: "SYSTEM",
    items: [
      { id: "pipeline", label: "Pipeline", icon: Workflow },
      { id: "provenance", label: "Data Provenance", icon: Database },
      { id: "settings", label: "Settings", icon: Settings },
    ],
  },
];

export default function Sidebar({ activePage, navigate }) {
  const isActive = (id) =>
    activePage === id || (id === "organisms" && activePage === "organism-detail");

  return (
    <aside className="w-60 bg-white border-r border-[#D9E2E7] flex flex-col h-full shrink-0">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-[#D9E2E7]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#E8F5F0] flex items-center justify-center shrink-0">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="2.8" fill="#3A9D7C" />
              <circle cx="3.5" cy="4.5" r="1.8" fill="#55B8A5" />
              <circle cx="16.5" cy="4.5" r="1.8" fill="#55B8A5" />
              <circle cx="3.5" cy="15.5" r="1.8" fill="#3B82B8" />
              <circle cx="16.5" cy="15.5" r="1.8" fill="#3B82B8" />
              <line x1="3.5" y1="4.5" x2="10" y2="10" stroke="#3A9D7C" strokeWidth="1.2" opacity="0.5" />
              <line x1="16.5" y1="4.5" x2="10" y2="10" stroke="#3A9D7C" strokeWidth="1.2" opacity="0.5" />
              <line x1="3.5" y1="15.5" x2="10" y2="10" stroke="#3B82B8" strokeWidth="1.2" opacity="0.5" />
              <line x1="16.5" y1="15.5" x2="10" y2="10" stroke="#3B82B8" strokeWidth="1.2" opacity="0.5" />
            </svg>
          </div>
          <div>
            <div className="text-sm font-semibold text-[#334155] leading-tight">{PROJECT_NAME}</div>
            <div className="text-[10px] text-[#64748B] leading-tight">Bacterial Regulatory Network</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
        {navGroups.map((group) => (
          <div key={group.title}>
            <p className="text-[10px] font-semibold text-[#94A3B8] tracking-wider uppercase px-2.5 mb-1.5">
              {group.title}
            </p>
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.id);
              return (
                <button
                  key={item.id}
                  onClick={() => navigate(item.id)}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm mb-0.5 transition-colors text-left ${
                    active
                      ? "bg-[#E8F5F0] text-[#176B57] font-medium"
                      : "text-[#64748B] hover:bg-[#F7FAFC] hover:text-[#334155]"
                  }`}
                >
                  <Icon
                    size={15}
                    className={active ? "text-[#3A9D7C]" : "text-[#94A3B8]"}
                  />
                  {item.label}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* MVP */}
      <div className="px-3 py-3 border-t border-[#D9E2E7]">
        <button
          onClick={() => navigate("mvp")}
          className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors ${
            activePage === "mvp"
              ? "bg-[#E8F5F0] text-[#176B57] font-medium"
              : "text-[#3A9D7C] hover:bg-[#E8F5F0]"
          }`}
        >
          <span className="text-[10px] bg-[#3A9D7C] text-white px-1.5 py-0.5 rounded font-mono font-semibold shrink-0">
            MVP
          </span>
          <span>Week 8 Milestone</span>
        </button>
      </div>
    </aside>
  );
}
// Estado de una etapa del pipeline (GET /atlas/status): ok, warning o missing.
// Compartido por Data Provenance y Pipeline (semana 13).
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

const STATUS = {
  ok: { label: "OK", icon: CheckCircle2, cls: "bg-[#E8F5F0] text-[#176B57] border-[#B8DDD0]" },
  warning: { label: "Check", icon: AlertTriangle, cls: "bg-[#FFFBEB] text-[#92400E] border-[#FCEDB8]" },
  missing: { label: "Missing", icon: XCircle, cls: "bg-[#FEF0F0] text-[#B54848] border-[#F8BFBF]" },
};

export default function StatusBadge({ value }) {
  const s = STATUS[value] ?? STATUS.missing;
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border ${s.cls}`}>
      <Icon size={11} /> {s.label}
    </span>
  );
}

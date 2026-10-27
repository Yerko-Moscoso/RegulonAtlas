// Piezas pequeñas de la vista Validation (antes dentro de pages/Validation.jsx).
import { Loader2 } from "lucide-react";
import { fmtInt } from "../utils/atlas";
import { pct } from "../utils/validation";

export function Section({ title, subtitle, children, right }) {
  return (
    <section className="bg-white border border-[#D9E2E7] rounded-xl p-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-base font-semibold text-[#1E293B]">{title}</h2>
          {subtitle && <p className="text-xs text-[#64748B] mt-1 max-w-3xl">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Segmented({ label, options, value, onChange }) {
  const current = options.find((o) => o.id === value);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-[#64748B]">{label}</span>
      <div className="inline-flex rounded-lg border border-[#D9E2E7] overflow-hidden w-fit">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={`text-sm px-3 py-1.5 ${
              o.id === value ? "bg-[#176B57] text-white" : "bg-white text-[#334155] hover:bg-[#F0F7F4]"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <span className="text-[11px] text-[#94A3B8] max-w-xs">{current?.hint}</span>
    </div>
  );
}

export function Stat({ label, value, sub }) {
  return (
    <div className="border border-[#E2E8F0] rounded-lg px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-[#94A3B8]">{label}</div>
      <div className="text-lg font-semibold text-[#1E293B]">{value}</div>
      {sub && <div className="text-[11px] text-[#64748B]">{sub}</div>}
    </div>
  );
}

export function Spinner({ text = "Loading…" }) {
  return (
    <div className="flex items-center gap-2 text-sm text-[#64748B] py-6">
      <Loader2 size={16} className="animate-spin" /> {text}
    </div>
  );
}

export function ErrorMsg({ children }) {
  return <p className="text-sm text-red-600 py-2">{children}</p>;
}

export function PrecisionBar({ value }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-20 bg-[#EEF2F5] rounded shrink-0">
        <div className="h-2 rounded bg-[#3A9D7C]" style={{ width: `${Math.round((value ?? 0) * 100)}%` }} />
      </div>
      <span className="text-xs font-mono text-[#334155] w-12 text-right">{pct(value)}</span>
    </div>
  );
}

export function BreakdownTable({ rows, labelOf, total }) {
  if (rows.length === 0) return <p className="text-sm text-[#94A3B8]">No evaluable pairs.</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-[11px] uppercase tracking-wide text-[#94A3B8] border-b border-[#E2E8F0]">
          <th className="py-1.5 font-medium">Group</th>
          <th className="py-1.5 pl-3 font-medium text-right">Evaluable</th>
          <th className="py-1.5 pl-3 font-medium text-right">Share</th>
          <th className="py-1.5 pl-3 font-medium text-right">TP</th>
          <th className="py-1.5 pl-3 font-medium text-right">FP</th>
          <th className="py-1.5 font-medium pl-4">Precision</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="border-b border-[#F1F5F9]">
            <td className="py-1.5 text-[#334155]">{labelOf(r.key)}</td>
            <td className="py-1.5 pl-3 text-right font-mono whitespace-nowrap">{fmtInt(r.pairs_evaluable)}</td>
            <td className="py-1.5 pl-3 text-right font-mono whitespace-nowrap text-[#64748B]">{pct(r.pairs_evaluable / total)}</td>
            <td className="py-1.5 pl-3 text-right font-mono whitespace-nowrap">{fmtInt(r.TP)}</td>
            <td className="py-1.5 pl-3 text-right font-mono whitespace-nowrap">{fmtInt(r.FP)}</td>
            <td className="py-1.5 pl-4">
              <PrecisionBar value={r.precision} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function CurveTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-[#D9E2E7] rounded-lg shadow px-3 py-2 text-xs">
      {payload.map((p) => (
        <div key={`${p.payload.network_id}-${p.payload.min_confidence}`} className="text-[#334155]">
          <span className="font-semibold" style={{ color: p.color }}>
            {p.payload.network}
          </span>{" "}
          · confidence ≥ {p.payload.min_confidence.toFixed(2)} · P {pct(p.payload.precision)} · R{" "}
          {pct(p.payload.recall)}
        </div>
      ))}
    </div>
  );
}

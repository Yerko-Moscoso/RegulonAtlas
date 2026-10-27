// Sección plegable (semana 13, pasada de presentación). Se usa para el detalle que respalda un resultado:
// cerrada muestra `summary` (el resultado en una línea), abierta muestra el contenido completo.
import { useState, useId } from "react";
import { ChevronRight } from "lucide-react";

export default function Collapsible({ title, subtitle, summary, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <section className="bg-white border border-[#D9E2E7] rounded-xl shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={id}
        className="w-full text-left p-5 flex items-start gap-3 rounded-xl hover:bg-[#F8FAFC] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3A9D7C]"
      >
        <ChevronRight
          size={16}
          className={`mt-0.5 shrink-0 text-[#64748B] transition-transform ${open ? "rotate-90" : ""}`}
        />
        <span className="flex-1 min-w-0">
          <span className="block text-base font-semibold text-[#1E293B]">{title}</span>
          {subtitle && <span className="block text-xs text-[#64748B] mt-1 max-w-3xl">{subtitle}</span>}
          {!open && summary && (
            <span className="block text-xs text-[#176B57] bg-[#F0F7F4] rounded px-2 py-1 mt-2 w-fit">{summary}</span>
          )}
        </span>
        <span className="text-[11px] text-[#94A3B8] shrink-0 mt-1">{open ? "Hide" : "Show details"}</span>
      </button>
      {open && (
        <div id={id} className="px-5 pb-5">
          {children}
        </div>
      )}
    </section>
  );
}

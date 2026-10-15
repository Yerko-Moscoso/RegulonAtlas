import { useState, useEffect, useMemo, useRef } from "react";
import { Search } from "lucide-react";

// Buscador de organismos: se escribe parte del nombre o del accession y se
// elige una sugerencia con el ratón o con las flechas + Enter.
//
// options: [{ id, label, muted, meta }]
//   id    -> accession
//   label -> nombre mostrado (ncbi_organism)
//   muted -> true si el genoma no tiene datos en la vista actual (se muestra en gris)
//   meta  -> texto corto a la derecha (p. ej. "82 edges", "no metrics")
export default function OrganismSearch({ options, value, onChange, disabled }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef(null);

  const current = options.find((o) => o.id === value);

  // Todos los organismos; al escribir se filtran por nombre o accession
  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return options;
    return options.filter((o) => o.label.toLowerCase().includes(term) || o.id.toLowerCase().includes(term));
  }, [options, query]);

  // Mantiene visible la sugerencia activa al moverse con las flechas
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (option) => {
    onChange(option.id);
    setQuery("");
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && open && matches[active]) {
      e.preventDefault();
      choose(matches[active]);
    } else if (e.key === "Escape") {
      setQuery("");
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#94A3B8] pointer-events-none" />
      <input
        role="combobox"
        aria-expanded={open}
        aria-controls="organism-suggestions"
        aria-activedescendant={open && matches[active] ? `organism-${matches[active].id}` : undefined}
        disabled={disabled}
        value={open ? query : current?.label ?? ""}
        placeholder={disabled ? "Loading…" : "Search organism or accession"}
        onFocus={() => {
          setOpen(true);
          setActive(0);
        }}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        className="text-sm border border-[#D9E2E7] rounded-lg pl-8 pr-2.5 py-1.5 w-80 bg-white text-[#334155] focus:outline-none focus:ring-1 focus:ring-[#3A9D7C] disabled:bg-gray-50 disabled:text-gray-400"
      />

      {open && !disabled && (
        <ul
          id="organism-suggestions"
          role="listbox"
          ref={listRef}
          className="absolute z-30 mt-1 w-[26rem] max-h-72 overflow-y-auto bg-white border border-[#D9E2E7] rounded-lg shadow-lg py-1"
        >
          {matches.length === 0 && (
            <li className="px-3 py-2 text-sm text-[#94A3B8]">No organism matches “{query}”.</li>
          )}
          {matches.map((o, i) => (
            <li
              key={o.id}
              id={`organism-${o.id}`}
              data-index={i}
              role="option"
              aria-selected={o.id === value}
              // onMouseDown en vez de onClick: se ejecuta antes del blur del input
              onMouseDown={(e) => {
                e.preventDefault();
                choose(o);
              }}
              onMouseEnter={() => setActive(i)}
              className={`px-3 py-1.5 cursor-pointer flex items-baseline justify-between gap-3 ${
                i === active ? "bg-[#F0F7F4]" : ""
              }`}
            >
              <span
                className={`text-sm truncate ${
                  o.id === value ? "font-semibold text-[#176B57]" : o.muted ? "text-[#94A3B8]" : "text-[#334155]"
                }`}
              >
                {o.label}
              </span>
              <span className="text-[11px] font-mono text-[#94A3B8] shrink-0">
                {o.id}
                {o.meta ? `, ${o.meta}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

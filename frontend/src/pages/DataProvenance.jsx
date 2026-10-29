import { useState, useEffect } from "react";
import { Loader2, Info } from "lucide-react";
import { api } from "../services/api";
import { fmtInt, fmtDateTime } from "../utils/atlas";
import StatusBadge from "../components/StatusBadge";
import ScrollX from "../components/ScrollX";

// Procedencia de los datos (semana 13):
//   1. fuentes externas: tabla provenance de la base (GET /atlas/provenance);
//   2. exportaciones a caché y trazabilidad de cada resultado: manifiestos (GET /atlas/status).

// Limitaciones documentadas (contexto, secciones 15 y 16). Las de la caché llegan como `notes` de /atlas/status.
const LIMITATIONS = [
  "Traceability goes back to the provenance table: the code of the external pipeline and its decision log (D1–D33) are not accessible.",
  "network_metrics and the D33 benchmark come from the external pipeline and are shown only as reference.",
];

const fmtDate = (s) => (s ? String(s).slice(0, 10) : "—");

function Card({ title, subtitle, children }) {
  return (
    <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-5">
      <h2 className="text-sm font-semibold text-[#334155]">{title}</h2>
      {subtitle && <p className="text-xs text-[#64748B] mt-0.5 mb-3">{subtitle}</p>}
      {children}
    </div>
  );
}

function Th({ children, right }) {
  return (
    <th className={`py-2 pr-3 text-[11px] font-medium text-[#64748B] ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

export default function DataProvenance() {
  const [sources, setSources] = useState([]);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.getAtlasProvenance(), api.getAtlasStatus()])
      .then(([prov, st]) => {
        if (cancelled) return;
        setSources(prov.data.sources ?? []);
        setStatus(st.data);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.response?.data?.detail ?? "The provenance data could not be loaded. Check that the backend is running.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const steps = status?.steps ?? [];
  const caches = steps.filter((s) => s.kind === "cache");
  const results = steps.filter((s) => s.kind === "result");
  const nCached = caches.reduce((n, s) => n + Object.keys(s.tables ?? {}).length, 0);
  const nTraceable = results.filter((s) => s.status === "ok").length;
  const notes = [...new Set(steps.flatMap((s) => s.notes ?? []))];

  const kpis = [
    { label: "External sources", value: sources.length },
    { label: "Cached tables", value: nCached },
    { label: "Results tracked", value: results.length },
    { label: "Traceable and up to date", value: status ? `${nTraceable} / ${results.length}` : "—" },
  ];

  return (
    <div className="space-y-6 max-w-[1100px]">
      <div>
        <h1 className="text-2xl font-semibold text-[#334155]">Data Provenance</h1>
        <p className="text-sm text-[#64748B] mt-1">
          Where every number of the atlas comes from: external sources, the export to the local cache, and the code
          version that produced each result.
        </p>
        {status && (
          <p className="text-xs text-[#94A3B8] mt-1 font-mono">
            Checked {fmtDateTime(status.checked_at)} · code {status.code.git_commit ?? "—"}
            {status.code.git_dirty ? " (uncommitted changes)" : ""}
          </p>
        )}
      </div>

      {error && (
        <div className="bg-[#FEF0F0] border border-[#F8BFBF] text-[#D96C6C] text-sm rounded-lg px-4 py-2.5">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-sm text-[#64748B] gap-2">
          <Loader2 className="w-5 h-5 text-[#3A9D7C] animate-spin" /> Loading provenance…
        </div>
      ) : (
        !error && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {kpis.map((k) => (
                <div key={k.label} className="bg-white rounded-xl border border-[#D9E2E7] p-4 shadow-sm">
                  <div className="text-xl font-bold font-mono text-[#334155]">{k.value}</div>
                  <div className="text-xs text-[#64748B] mt-1">{k.label}</div>
                </div>
              ))}
            </div>

            <Card
              title="1. External sources"
              subtitle="Registered by the external pipeline in the provenance table of the database (values as stored)."
            >
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#D9E2E7]">
                      <Th>Source</Th><Th>Version</Th><Th>Retrieved</Th><Th>Parameters</Th><Th>Notes</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {sources.map((s) => (
                      <tr key={s.prov_id} className="border-b border-[#F0F4F8] align-top">
                        <td className="py-1.5 pr-3">
                          <a href={s.url} target="_blank" rel="noreferrer" className="font-medium text-[#2563A0] hover:underline">
                            {s.source}
                          </a>
                        </td>
                        <td className="py-1.5 pr-3 font-mono text-[#334155]">{s.version}</td>
                        <td className="py-1.5 pr-3 font-mono text-[#64748B] whitespace-nowrap">{fmtDate(s.retrieved_on)}</td>
                        <td className="py-1.5 pr-3 text-[#64748B]">{s.params}</td>
                        <td className="py-1.5 text-[#64748B]">{s.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card
              title="2. Local cache"
              subtitle="Read-only exports from MariaDB (SELECT only). The API and every analysis read these files, never the database."
            >
              <div className="grid md:grid-cols-3 gap-4">
                {caches.map((c) => (
                  <div key={c.id} className="border border-[#E2E8F0] rounded-lg p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[#334155]">{c.label}</span>
                      <StatusBadge value={c.status} />
                    </div>
                    <p className="text-[11px] text-[#64748B] mt-1">{c.description}</p>
                    <p className="text-[11px] text-[#94A3B8] font-mono mt-1">
                      make {c.make} · {fmtDateTime(c.created_at)}
                    </p>
                    {/* Conteos por tabla: registro de la exportación, plegado (son 13 filas en la caché del atlas) */}
                    <details className="mt-2">
                      <summary className="text-[11px] text-[#2563A0] cursor-pointer select-none">
                        {Object.keys(c.tables ?? {}).length} table{Object.keys(c.tables ?? {}).length === 1 ? "" : "s"} ·{" "}
                        {fmtInt(Object.values(c.tables ?? {}).reduce((s, n) => s + n, 0))} rows
                      </summary>
                      <table className="w-full text-[11px] mt-1">
                        <tbody>
                          {Object.entries(c.tables ?? {}).map(([t, n]) => (
                            <tr key={t} className="border-t border-[#F0F4F8]">
                              <td className="py-0.5 pr-2 font-mono text-[#64748B]">{t}</td>
                              <td className="py-0.5 text-right font-mono text-[#334155]">{fmtInt(n)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </details>
                    {c.issues.map((i) => (
                      <p key={i} className="text-[11px] text-[#92400E] mt-1">{i}</p>
                    ))}
                  </div>
                ))}
              </div>
            </Card>

            <Card
              title="3. Results"
              subtitle="Each result records the commit that produced it. A result is up to date when it was built from the current version of its input."
            >
              <ScrollX>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#D9E2E7]">
                      <Th>Result</Th><Th>Command</Th><Th>Generated</Th><Th>Commit</Th><Th>Clean tree</Th>
                      <Th right>Files</Th><Th>Up to date</Th><Th>Status</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => (
                      <tr key={r.id} className="border-b border-[#F0F4F8] align-top">
                        {/* Ancho mínimo: en pantalla angosta la descripción no queda en una columna de una palabra */}
                        <td className="py-1.5 pr-3 min-w-[200px]">
                          <div className="font-medium text-[#334155]">{r.label}</div>
                          <div className="text-[11px] text-[#94A3B8]">{r.description}</div>
                          {r.issues.map((i) => (
                            <div key={i} className="text-[11px] text-[#92400E] mt-0.5">{i}</div>
                          ))}
                        </td>
                        <td className="py-1.5 pr-3 font-mono text-[#64748B] whitespace-nowrap">make {r.make}</td>
                        <td className="py-1.5 pr-3 font-mono text-[#64748B] whitespace-nowrap">{fmtDateTime(r.created_at)}</td>
                        <td className="py-1.5 pr-3 font-mono text-[#334155]">
                          {r.git_commit ?? "—"}
                          {r.commit_in_history === false && <span className="text-[#B54848]"> (not in history)</span>}
                        </td>
                        <td className="py-1.5 pr-3 text-[#334155]">
                          {r.git_dirty == null ? "—" : r.git_dirty ? "No" : "Yes"}
                        </td>
                        <td className="py-1.5 pr-3 text-right font-mono text-[#334155] whitespace-nowrap">
                          {/* Sin manifiesto no hay archivos declarados: "—" en vez de "0 / 0" (revisión de la semana 13, C3) */}
                          {r.files_declared ? `${r.files_declared - r.files_missing.length} / ${r.files_declared}` : "—"}
                        </td>
                        <td className="py-1.5 pr-3 text-[#334155]" title={r.up_to_date_detail ?? ""}>
                          {r.up_to_date == null ? "—" : r.up_to_date ? "Yes" : "No"}
                          {/* El detalle solo se muestra cuando hay algo que revisar; si está al día queda en el title */}
                          {r.up_to_date === false && r.up_to_date_detail && (
                            <div className="text-[11px] text-[#92400E] max-w-[220px]">{r.up_to_date_detail}</div>
                          )}
                        </td>
                        <td className="py-1.5"><StatusBadge value={r.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollX>
            </Card>

            <Card title="Known limitations">
              <ul className="space-y-1.5">
                {[...notes, ...LIMITATIONS].map((l) => (
                  <li key={l} className="flex gap-2 text-xs text-[#64748B]">
                    <Info size={13} className="text-[#94A3B8] shrink-0 mt-0.5" /> {l}
                  </li>
                ))}
              </ul>
            </Card>
          </>
        )
      )}
    </div>
  );
}

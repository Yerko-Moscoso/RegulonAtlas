import { useState, useEffect } from "react";
import { Loader2, ArrowDown, Database, Server, LayoutDashboard, Globe, Cog, Terminal } from "lucide-react";
import { api } from "../services/api";
import { fmtInt, fmtDateTime } from "../utils/atlas";
import StatusBadge from "../components/StatusBadge";

// Flujo del sistema de punta a punta (semana 13), con la autoría de cada parte.
// Las etapas, sus dependencias, su regla de make y su estado salen de GET /atlas/status (manifiestos);
// las fuentes externas, de GET /atlas/provenance. Lo único fijo aquí es qué vista muestra cada resultado
// y la descripción del pipeline externo (redes reproducidas en la semana 12: robustez_semana12.md, 8.4).

// Vistas del dashboard que leen cada resultado (ids de App.jsx).
const SHOWN_IN = {
  validation: [{ page: "validation", label: "Validation" }],
  metrics: [
    { page: "metrics", label: "Metrics" },
    { page: "fingerprints", label: "Fingerprints" },
    { page: "organisms", label: "Organisms" },
  ],
  comparison: [{ page: "comparison", label: "Taxon Comparison" }],
  robustness: [{ page: "robustness", label: "Robustness" }],
  baseline: [{ page: "validation", label: "Validation (baseline)" }],
};

const OWNER = {
  external: { label: "External pipeline", cls: "bg-[#F1F5F9] text-[#475569] border-[#CBD5E1]" },
  own: { label: "This project", cls: "bg-[#E8F5F0] text-[#176B57] border-[#B8DDD0]" },
};

function OwnerBadge({ owner }) {
  const o = OWNER[owner];
  return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${o.cls}`}>{o.label}</span>;
}

// Una fila del flujo: icono, nombre de la etapa, autoría y contenido.
function Stage({ icon: Icon, title, owner, children }) {
  return (
    <div
      className={`rounded-xl border shadow-sm p-4 ${
        owner === "external" ? "bg-[#F8FAFC] border-[#D9E2E7] border-dashed" : "bg-white border-[#D9E2E7]"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <Icon size={16} className={owner === "external" ? "text-[#64748B]" : "text-[#3A9D7C]"} />
        <h2 className="text-sm font-semibold text-[#334155]">{title}</h2>
        <OwnerBadge owner={owner} />
      </div>
      {children}
    </div>
  );
}

function Arrow({ label }) {
  return (
    <div className="flex items-center justify-center gap-2 py-1.5 text-[11px] text-[#94A3B8]" aria-hidden="true">
      <ArrowDown size={16} />
      {label && <span>{label}</span>}
    </div>
  );
}

// Tarjeta de una etapa propia (caché o análisis) con su estado real.
function StepCard({ step, labels, navigate }) {
  const views = SHOWN_IN[step.id] ?? [];
  return (
    <div className="border border-[#E2E8F0] rounded-lg p-3 flex flex-col gap-1.5">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold text-[#334155]">{step.label}</span>
        <StatusBadge value={step.status} />
      </div>
      <p className="text-[11px] text-[#64748B]">{step.description}</p>
      <p className="text-[11px] font-mono text-[#334155]">make {step.make}</p>
      {step.depends_on.length > 0 && (
        <p className="text-[11px] text-[#94A3B8]">Reads: {step.depends_on.map((d) => labels[d] ?? d).join(", ")}</p>
      )}
      <p className="text-[11px] text-[#94A3B8] font-mono">
        {fmtDateTime(step.created_at)}
        {step.git_commit ? ` · ${step.git_commit}` : ""}
      </p>
      {views.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-0.5">
          {views.map((v) => (
            <button
              key={v.label}
              type="button"
              onClick={() => navigate(v.page)}
              className="text-[11px] px-2 py-0.5 rounded border border-[#D9E2E7] text-[#2563A0] hover:bg-[#F0F7FB]"
            >
              {v.label} →
            </button>
          ))}
        </div>
      )}
      {step.issues.map((i) => (
        <p key={i} className="text-[11px] text-[#92400E]">{i}</p>
      ))}
    </div>
  );
}

export default function Pipeline({ navigate }) {
  const [status, setStatus] = useState(null);
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.getAtlasStatus(), api.getAtlasProvenance()])
      .then(([st, prov]) => {
        if (cancelled) return;
        setStatus(st.data);
        setSources(prov.data.sources ?? []);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.response?.data?.detail ?? "Could not load the pipeline status.");
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
  const labels = Object.fromEntries(steps.map((s) => [s.id, s.label]));
  const db = caches.find((s) => s.id === "cache-atlas")?.tables ?? {};
  const nOk = steps.filter((s) => s.status === "ok").length;

  return (
    <div className="space-y-6 max-w-[1100px]">
      <div>
        <h1 className="text-2xl font-semibold text-[#334155]">Reproducible Pipeline</h1>
        <p className="text-sm text-[#64748B] mt-1">
          How the atlas goes from public databases to this dashboard, who built each part, and the command that
          regenerates every result.
        </p>
        {status && (
          <p className="text-xs text-[#94A3B8] mt-1 font-mono">
            {nOk} of {steps.length} stages up to date · checked {fmtDateTime(status.checked_at)} · code{" "}
            {status.code.git_commit ?? "—"}
            {status.code.git_dirty ? " (uncommitted changes)" : ""}
          </p>
        )}
      </div>

      {error && (
        <div className="bg-[#FEF0F0] border border-[#F8BFBF] text-[#D96C6C] text-sm rounded-lg px-4 py-2.5">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-sm text-[#64748B] gap-2">
          <Loader2 className="w-5 h-5 text-[#3A9D7C] animate-spin" /> Loading pipeline…
        </div>
      ) : (
        !error && (
          <>
            {/* Autoría */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] p-4">
                <OwnerBadge owner="external" />
                <p className="text-xs text-[#475569] mt-2">
                  Genome selection, motif scanning, transfer and filtering, the <span className="font-mono">regulon_atlas</span>{" "}
                  database with the five networks, <span className="font-mono">network_metrics</span> and the D33
                  benchmark. Built by the researcher; its code is not available to this project.
                </p>
              </div>
              <div className="rounded-xl border border-[#B8DDD0] bg-[#F0F7F4] p-4">
                <OwnerBadge owner="own" />
                <p className="text-xs text-[#334155] mt-2">
                  Data audit, read-only cache, independent validation, own topological metrics, taxon comparison,
                  robustness, the own baseline that rebuilds the external networks, the API, the tests and this
                  dashboard.
                </p>
              </div>
            </div>

            {/* Flujo */}
            <div>
              <Stage icon={Globe} title="1. Public sources" owner="external">
                <div className="flex flex-wrap gap-1.5">
                  {sources.map((s) => (
                    <span key={s.prov_id} className="text-[11px] px-2 py-0.5 rounded bg-white border border-[#E2E8F0] text-[#334155]">
                      {s.source} <span className="font-mono text-[#94A3B8]">{s.version}</span>
                    </span>
                  ))}
                </div>
                <p className="text-[11px] text-[#94A3B8] mt-2">Versions and download dates: Data Provenance.</p>
              </Stage>

              <Arrow />

              <Stage icon={Cog} title="2. External pipeline" owner="external">
                <p className="text-xs text-[#475569]">
                  FIMO scan of PRODORIC and RegPrecise motifs, transfer of each motif to related genomes, and three filters
                  that define the five networks: p-value threshold, transfer-tier ceiling and phylogenetic footprinting.
                  This project confirmed these filters by rebuilding the networks from the raw hits (Validation → own
                  baseline).
                </p>
              </Stage>

              <Arrow />

              <Stage icon={Database} title="3. MariaDB regulon_atlas" owner="external">
                <p className="text-xs text-[#475569]">
                  {fmtInt(db.networks)} networks · {fmtInt(db.genomes)} genomes · {fmtInt(db.motifs)} motifs ·{" "}
                  {fmtInt(db.curated_regulons)} curated RegPrecise rows. Read with SELECT only.
                </p>
              </Stage>

              <Arrow label="exported once to Parquet" />

              <Stage icon={Database} title="4. Local cache" owner="own">
                <div className="grid md:grid-cols-3 gap-3">
                  {caches.map((s) => (
                    <StepCard key={s.id} step={s} labels={labels} navigate={navigate} />
                  ))}
                </div>
              </Stage>

              <Arrow label="computed offline" />

              <Stage icon={Cog} title="5. Analyses" owner="own">
                <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {results.map((s) => (
                    <StepCard key={s.id} step={s} labels={labels} navigate={navigate} />
                  ))}
                </div>
              </Stage>

              <Arrow label="read-only" />

              <div className="grid md:grid-cols-2 gap-4">
                <Stage icon={Server} title="6. API" owner="own">
                  <p className="text-xs text-[#334155]">
                    FastAPI. Serves the cache and the results as JSON; it never queries the database or computes
                    anything heavy.
                  </p>
                </Stage>
                <Stage icon={LayoutDashboard} title="7. Dashboard" owner="own">
                  <p className="text-xs text-[#334155]">
                    React views. Each analysis card above links to the views that show it.
                  </p>
                </Stage>
              </div>
            </div>

            {/* Cómo regenerar */}
            <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-5">
              <div className="flex items-center gap-2 mb-1">
                <Terminal size={16} className="text-[#3A9D7C]" />
                <h2 className="text-sm font-semibold text-[#334155]">Regenerate the results</h2>
              </div>
              <p className="text-xs text-[#64748B] mb-3">
                Run from the project root with the conda environment active. Each command writes a manifest with the git
                commit that produced it.
              </p>
              <pre className="text-[11px] font-mono bg-[#0F172A] text-[#E2E8F0] rounded-lg p-3 overflow-x-auto">
{`make cache-atlas cache-genes cache-fimo   # cache from MariaDB (needs database access)
make all              # validation, metrics, taxon comparison, robustness and own baseline (~15 min)
make check            # API, frontend and tests`}
              </pre>
            </div>
          </>
        )
      )}
    </div>
  );
}

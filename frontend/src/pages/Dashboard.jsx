import { useEffect, useState } from "react";
import { Dna, Network, GitBranch, CircleCheck, BarChart3, Loader2, ArrowRight } from "lucide-react";
import { api } from "../services/api";
import { COMPARISON_ACCESSIONS } from "../constants/comparisonGenomes";

// Genoma de referencia con gold standard.
const REFERENCE_ACCESSION = "GCF_000005845.2";
// Umbral de la red en -log10(p); igual a NETWORK_NEG_LOG10_P del backend.
const VALIDATION_THRESHOLD = 5.0;
const GOLD_STANDARD = "RegPrecise";

const MODULES = [
  {
    page: "organisms",
    icon: Dna,
    title: "Organisms",
    desc: "Genomes included in the analysis, with their assembly and annotation data.",
  },
  {
    page: "networks",
    icon: Network,
    title: "Regulatory Networks",
    desc: "Interactive TF → target gene network predicted for each genome.",
  },
  {
    page: "metrics",
    icon: BarChart3,
    title: "Metrics",
    desc: "Nodes, edges, density, average degree and hubs of each network.",
  },
  {
    page: "validation",
    icon: CircleCheck,
    title: "Validation",
    desc: `Precision and recall of the E. coli K-12 network against curated ${GOLD_STANDARD} regulons, across FIMO thresholds.`,
  },
];

const fmtInt = (n) => (n == null ? "—" : Number(n).toLocaleString("en-US"));
const fmtPct = (x) => (x == null ? "—" : `${(x * 100).toFixed(1)}%`);
const f1Score = (p, r) => (p + r > 0 ? (2 * p * r) / (p + r) : 0);

function Spinner({ text }) {
  return (
    <div className="flex items-center justify-center py-10 text-[#64748B] text-sm gap-2">
      <Loader2 className="w-4 h-4 text-[#3A9D7C] animate-spin" />
      {text}
    </div>
  );
}

function KpiCard({ icon: Icon, value, label, note, color, bg }) {
  return (
    <div className="bg-white rounded-xl border border-[#D9E2E7] p-4 shadow-sm">
      <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center mb-3`}>
        <Icon size={16} className={color} />
      </div>
      <div className="text-[22px] font-bold font-mono text-[#334155] leading-none mb-1">
        {value}
      </div>
      <div className="text-[11px] text-[#64748B] leading-tight">{label}</div>
      {note && <div className="text-[10px] text-[#94A3B8] mt-1">{note}</div>}
    </div>
  );
}

export default function Dashboard({ navigate }) {
  // Topología y validación se cargan por separado: cada sección aparece
  // apenas su dato llega, sin esperar a la otra.
  const [topology, setTopology] = useState(null);
  const [topologyError, setTopologyError] = useState("");
  const [validation, setValidation] = useState(null);
  const [validationState, setValidationState] = useState("loading");

  useEffect(() => {
    let cancelled = false;

    api
      .getTopologySummary(COMPARISON_ACCESSIONS)
      .then((res) => !cancelled && setTopology(res.data))
      .catch(() => {
        if (!cancelled) {
          setTopology([]);
          setTopologyError("Network metrics could not be loaded. Check that the backend is running.");
        }
      });

    api
      .getValidationMetrics(REFERENCE_ACCESSION)
      .then((res) => {
        if (cancelled) return;
        const point = (res.data ?? []).find(
          (v) => v.neg_log10_pvalue_threshold === VALIDATION_THRESHOLD
        );
        setValidation(point ?? null);
        setValidationState(point ? "ready" : "empty");
      })
      .catch(() => !cancelled && setValidationState("error"));

    return () => {
      cancelled = true;
    };
  }, []);

  const rows = topology ?? [];
  const totalEdges = rows.reduce((sum, r) => sum + (r.aristas ?? 0), 0);

  return (
    <div className="space-y-6 max-w-[1200px]">
      <div>
        <h1 className="text-2xl font-semibold text-[#334155]">Analysis Overview</h1>
        <p className="text-sm text-[#64748B] mt-1 max-w-3xl">
          Prediction of transcription factor regulatory networks from curated binding motifs,
          topological characterization of each network and validation against curated regulons.
        </p>
      </div>

      {/* Modules */}
      <div className="grid grid-cols-4 gap-3">
        {MODULES.map(({ page, icon: Icon, title, desc }) => (
          <button
            key={page}
            onClick={() => navigate(page)}
            className="text-left bg-white rounded-xl border border-[#D9E2E7] p-4 shadow-sm hover:border-[#3A9D7C] transition-colors"
          >
            <div className="flex items-center gap-2 mb-1.5">
              <Icon size={15} className="text-[#3A9D7C]" />
              <span className="text-sm font-semibold text-[#334155]">{title}</span>
            </div>
            <p className="text-[12px] text-[#64748B] leading-snug">{desc}</p>
          </button>
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3">
        <KpiCard
          icon={Dna}
          value={fmtInt(COMPARISON_ACCESSIONS.length)}
          label="Genomes analyzed"
          note="Enterobacteriaceae"
          color="text-[#3A9D7C]"
          bg="bg-[#E8F5F0]"
        />
        <KpiCard
          icon={Network}
          value={topology ? `${rows.length} / ${COMPARISON_ACCESSIONS.length}` : "…"}
          label="Networks built"
          note={`FIMO p ≤ 1e-${VALIDATION_THRESHOLD}`}
          color="text-[#3B82B8]"
          bg="bg-[#DCEFFA]"
        />
        <KpiCard
          icon={GitBranch}
          value={topology ? fmtInt(totalEdges) : "…"}
          label="Predicted TF → gene edges"
          note="all genomes"
          color="text-[#55B8A5]"
          bg="bg-[#E8F5F0]"
        />
        <KpiCard
          icon={CircleCheck}
          value={validationState === "ready" ? "1" : validationState === "loading" ? "…" : "0"}
          label="Validated organisms"
          note={`E. coli K-12 vs ${GOLD_STANDARD}`}
          color="text-[#176B57]"
          bg="bg-[#E8F5F0]"
        />
      </div>

      <div className="grid grid-cols-3 gap-5">
        {/* Genomes table */}
        <div className="col-span-2 bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-[#334155]">Networks by genome</h2>
            <button
              onClick={() => navigate("metrics")}
              className="flex items-center gap-1 text-xs text-[#3A9D7C] hover:text-[#176B57]"
            >
              Metrics <ArrowRight size={11} />
            </button>
          </div>

          {topologyError && (
            <div className="bg-[#FEF0F0] border border-[#F8BFBF] text-[#D96C6C] text-sm rounded-lg px-4 py-2.5 mb-3">
              {topologyError}
            </div>
          )}

          {!topology ? (
            <Spinner text="Computing network metrics…" />
          ) : (
            <>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#D9E2E7]">
                    {["Organism", "TFs", "Targets", "Edges", "Density", "Avg degree", "Hubs"].map((h) => (
                      <th
                        key={h}
                        className="text-left text-[11px] font-medium text-[#64748B] pb-2 pr-3 last:pr-0"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.genome_acc}
                      className="border-b border-[#F7FAFC] last:border-0 hover:bg-[#F7FAFC] cursor-pointer transition-colors"
                      onClick={() => navigate("organism-detail", r.genome_acc)}
                    >
                      <td className="py-2 pr-3">
                        <div className="text-[12px] font-medium text-[#334155] italic">{r.organism}</div>
                        <div className="text-[10px] text-[#64748B] font-mono">
                          {r.genome_acc}
                          {r.genome_acc === REFERENCE_ACCESSION && " (reference)"}
                        </div>
                      </td>
                      <td className="py-2 pr-3 font-mono text-[12px] text-[#334155]">{fmtInt(r.n_tfs)}</td>
                      <td className="py-2 pr-3 font-mono text-[12px] text-[#334155]">{fmtInt(r.n_targets)}</td>
                      <td className="py-2 pr-3 font-mono text-[12px] text-[#334155]">{fmtInt(r.aristas)}</td>
                      <td className="py-2 pr-3 font-mono text-[12px] text-[#334155]">{r.densidad.toFixed(4)}</td>
                      <td className="py-2 pr-3 font-mono text-[12px] text-[#334155]">{r.grado_medio.toFixed(2)}</td>
                      <td className="py-2 font-mono text-[12px] text-[#334155]">{fmtInt(r.hubs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[10px] text-[#94A3B8] mt-3">
                Nodes = TFs + targets. Avg degree = edges / nodes. Hubs = TFs regulating more than{" "}
                {rows[0]?.hub_degree_threshold ?? 20} genes.
              </p>
            </>
          )}
        </div>

        {/* Validation snapshot */}
        <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-5 flex flex-col">
          <h2 className="text-sm font-semibold text-[#334155]">Validation</h2>
          <p className="text-[11px] text-[#64748B] mt-0.5 mb-4">
            E. coli K-12 MG1655 vs {GOLD_STANDARD}, FIMO p ≤ 1e-{VALIDATION_THRESHOLD}
          </p>

          {validationState === "loading" && <Spinner text="Loading validation…" />}
          {validationState === "error" && (
            <p className="text-[12px] text-[#D96C6C]">Validation results could not be loaded.</p>
          )}
          {validationState === "empty" && (
            <p className="text-[12px] text-[#64748B]">No validation result at this threshold.</p>
          )}
          {validationState === "ready" && (
            <>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {[
                  { label: "Precision", value: validation.precision, color: "#3A9D7C" },
                  { label: "Recall", value: validation.recall, color: "#3B82B8" },
                  { label: "F1", value: f1Score(validation.precision, validation.recall), color: "#55B8A5" },
                ].map((m) => (
                  <div key={m.label} className="rounded-lg border border-[#D9E2E7] p-2.5 text-center">
                    <div className="text-lg font-bold font-mono" style={{ color: m.color }}>
                      {fmtPct(m.value)}
                    </div>
                    <div className="text-[10px] text-[#64748B]">{m.label}</div>
                  </div>
                ))}
              </div>
              <dl className="space-y-1.5 text-[12px]">
                {[
                  ["True positives", validation.true_positives],
                  ["False positives", validation.false_positives],
                  ["False negatives", validation.false_negatives],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <dt className="text-[#64748B]">{k}</dt>
                    <dd className="font-mono text-[#334155]">{fmtInt(v)}</dd>
                  </div>
                ))}
              </dl>
              <button
                onClick={() => navigate("validation")}
                className="mt-auto pt-4 flex items-center gap-1 text-xs text-[#3A9D7C] hover:text-[#176B57]"
              >
                Precision and recall across thresholds <ArrowRight size={11} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

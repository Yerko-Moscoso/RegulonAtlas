import { useState, useEffect } from "react";
import {
  Loader2, Dna, Network, BarChart3, CircleCheck, FingerprintPattern, GitCompare, ShieldCheck, ChevronRight, Workflow,
  FileClock,
} from "lucide-react";
import { api } from "../services/api";
import { ATLAS_GENOMES, fmtInt, fmtP } from "../utils/atlas";
import ScrollX from "../components/ScrollX";

// Resumen del atlas: las 5 redes con su validación propia (make validate-atlas) y accesos a cada vista.
// Antes mostraba los 8 genomas del MVP (data/results/mvp).

const VIEWS = [
  { page: "organisms", label: "Organisms", icon: Dna, text: "Catalog of the 2,644 genomes with their own metrics." },
  { page: "networks", label: "Regulatory Networks", icon: Network, text: "TF → operon graph of any genome and network." },
  { page: "metrics", label: "Metrics", icon: BarChart3, text: "Own topological metrics and agreement with the external table." },
  { page: "validation", label: "Validation", icon: CircleCheck, text: "Precision and recall against RegPrecise, and the own baseline." },
  { page: "fingerprints", label: "Fingerprints", icon: FingerprintPattern, text: "Percentile profile of a genome against its family and the atlas." },
  { page: "comparison", label: "Taxon Comparison", icon: GitCompare, text: "Metrics across GTDB phyla, classes, orders and families." },
  { page: "robustness", label: "Robustness", icon: ShieldCheck, text: "Metric stability across networks and under edge removal." },
  { page: "pipeline", label: "Pipeline", icon: Workflow, text: "From public databases to this dashboard: who built each part and how to rerun it." },
  { page: "provenance", label: "Data Provenance", icon: FileClock, text: "Sources, cache exports and the code version behind every result." },
];

const pct = (v) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);
const dec = (v) => (v == null ? "—" : Number(v).toFixed(3));

function Stat({ label, value, sub }) {
  return (
    <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm px-4 py-3">
      <div className="text-xs text-[#64748B]">{label}</div>
      <div className="text-2xl font-semibold text-[#334155] font-mono mt-0.5">{value}</div>
      {sub && <div className="text-[11px] text-[#94A3B8] mt-0.5">{sub}</div>}
    </div>
  );
}

export default function Dashboard({ navigate }) {
  const [networks, setNetworks] = useState([]);
  const [all, setAll] = useState([]); // validación modo all, universo genome_tf
  const [indep, setIndep] = useState([]); // modo independent
  const [gold, setGold] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.getAtlasNetworks(),
      api.getAtlasValidationSummary("regprecise", { mode: "all", universe: "genome_tf" }),
      api.getAtlasValidationSummary("regprecise", { mode: "independent", universe: "genome_tf" }),
      api.getAtlasValidationManifest(),
    ])
      .then(([n, a, i, m]) => {
        if (cancelled) return;
        setNetworks(n.data);
        setAll(a.data.rows ?? []);
        setIndep(i.data.rows ?? []);
        setGold(m.data.gold_stats);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.response?.data?.detail ?? "The atlas summary could not be loaded. Check that the backend is running.");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const row = (rows, id) => rows.find((r) => r.network_id === id);
  const bestF1 = Math.max(...all.map((r) => r.f1 ?? 0));
  const balanced = row(all, 3);

  return (
    <div className="space-y-6 max-w-[1100px]">
      <div>
        <h1 className="text-2xl font-semibold text-[#334155]">RegulonAtlas</h1>
        <p className="text-sm text-[#64748B] mt-1">
          Predicted transcriptional regulatory networks (TF → operon) for {fmtInt(ATLAS_GENOMES)} bacterial genomes, one
          per GTDB genus. Networks come from an external pipeline; validation, metrics, comparison and robustness are
          computed by this project.
        </p>
      </div>

      {error && (
        <div className="bg-[#FEF0F0] border border-[#F8BFBF] text-[#D96C6C] text-sm rounded-lg px-4 py-2.5">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-sm text-[#64748B] gap-2">
          <Loader2 className="w-5 h-5 text-[#3A9D7C] animate-spin" />
          Loading the atlas summary…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat label="Atlas genomes" value={fmtInt(ATLAS_GENOMES)} sub="+ 420 auxiliary genomes" />
            {/* Sin datos de la API se muestra "—", no "0" (revisión de la semana 13, E1) */}
            <Stat label="Networks" value={networks.length ? fmtInt(networks.length) : "—"} sub="nested filters of one FIMO scan" />
            <Stat
              label="Validable genomes"
              value={fmtInt(gold?.validable_genomes)}
              sub={`${fmtInt(gold?.gold_tf_operon_pairs)} curated TF–operon pairs (RegPrecise)`}
            />
            <Stat label="Best F1 (balanced)" value={dec(balanced?.f1)} sub={`precision ${pct(balanced?.precision)} · recall ${pct(balanced?.recall)}`} />
          </div>

          <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-5">
            <h3 className="text-sm font-semibold text-[#334155] mb-1">The five networks</h3>
            <p className="text-xs text-[#64748B] mb-3">
              Own validation against RegPrecise (TF → operon, universe genome–TF). Independent mode excludes motifs built
              from the regulog of the evaluated genome.
            </p>
            <ScrollX>
              <table className="w-full text-sm [&_th]:whitespace-nowrap [&_td]:whitespace-nowrap [&_th+th]:pl-4 [&_td+td]:pl-4">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-[#94A3B8] border-b border-[#E2E8F0]">
                    <th className="py-1.5 font-medium">Network</th>
                    <th className="py-1.5 font-medium">p · tier ceiling · footprint</th>
                    <th className="py-1.5 font-medium text-right">TF–operon pairs</th>
                    <th className="py-1.5 font-medium text-right">Precision</th>
                    <th className="py-1.5 font-medium text-right">Recall</th>
                    <th className="py-1.5 font-medium text-right">F1</th>
                    <th className="py-1.5 font-medium text-right">F1 independent</th>
                    <th className="py-1.5 font-medium text-right">Evaluable pairs</th>
                  </tr>
                </thead>
                <tbody>
                  {networks.map((n) => {
                    const a = row(all, n.network_id);
                    const i = row(indep, n.network_id);
                    return (
                      <tr key={n.network_id} className="border-b border-[#F1F5F9]">
                        <td className="py-1.5 text-[#334155]">
                          {n.name}
                          {n.network_id === 3 && <span className="ml-1.5 text-[10px] text-[#3A9D7C]">default</span>}
                        </td>
                        <td className="py-1.5 text-xs font-mono text-[#64748B]">
                          ≤ {fmtP(n.p_threshold)} · {n.tier_ceiling} · ≥ {n.params?.footprint_enrichment_min ?? 0}
                        </td>
                        <td className="py-1.5 text-right font-mono">{fmtInt(a?.pairs_total)}</td>
                        <td className="py-1.5 text-right font-mono">{pct(a?.precision)}</td>
                        <td className="py-1.5 text-right font-mono">{pct(a?.recall)}</td>
                        <td className={`py-1.5 text-right font-mono ${a?.f1 === bestF1 ? "font-semibold text-[#176B57]" : ""}`}>
                          {dec(a?.f1)}
                        </td>
                        <td className="py-1.5 text-right font-mono">{dec(i?.f1)}</td>
                        <td className="py-1.5 text-right font-mono text-[#64748B]">{a?.pairs_total ? pct(a.pairs_evaluable / a.pairs_total) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ScrollX>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {VIEWS.map((v) => (
              <button
                key={v.page}
                onClick={() => navigate(v.page)}
                className="text-left bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-4 hover:border-[#3A9D7C] transition-colors group"
              >
                <div className="flex items-center gap-2">
                  <v.icon size={16} className="text-[#3A9D7C]" />
                  <span className="text-sm font-semibold text-[#334155]">{v.label}</span>
                  <ChevronRight size={14} className="ml-auto text-[#CBD5E1] group-hover:text-[#3A9D7C]" />
                </div>
                <p className="text-xs text-[#64748B] mt-1.5">{v.text}</p>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

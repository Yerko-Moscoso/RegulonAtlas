import { useState, useEffect, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceDot,
} from "recharts";
import { Loader2 } from "lucide-react";
import { api } from "../services/api";
import NetworkSelector from "../components/NetworkSelector";
import OrganismSearch from "../components/OrganismSearch";
import { DEFAULT_NETWORK, DEFAULT_GENOME, fmtInt } from "../utils/atlas";

// Validación de las 5 redes del atlas contra RegPrecise.
// La evaluación se calcula offline (make validate-atlas); esta vista solo lee resultados.

const NET_COLORS = { 1: "#176B57", 2: "#7C3AED", 3: "#2563EB", 4: "#D97706", 5: "#DB2777" };

const pct = (v) => (v == null || Number.isNaN(v) ? "—" : `${(v * 100).toFixed(1)}%`);
const pctTick = (v) => `${Math.round(v * 100)}%`;
const dec = (v) => (v == null ? "—" : Number(v).toFixed(3));
const detail = (err, fallback) => err?.response?.data?.detail ?? fallback;

const MODES = [
  {
    id: "all",
    label: "All edges",
    hint: "Includes motifs built from the same RegPrecise regulog as the evaluated genome (comparable with D33).",
  },
  {
    id: "independent",
    label: "Independent",
    hint: "Excludes motifs whose source regulog contains the evaluated genome, so no genome validates its own motifs.",
  },
];

const UNIVERSES = [
  {
    id: "genome_tf",
    label: "Curated TFs only",
    hint: "Only predictions for (genome, TF) pairs with a curated regulon are scored. Other predictions are not evaluable.",
  },
  {
    id: "genome",
    label: "Whole genome",
    hint: "Every prediction in a validable genome is scored. Lower bound for precision.",
  },
];

const TIER_ORDER = [
  "within_genus",
  "same_genus",
  "within_family",
  "same_family",
  "within_order",
  "same_order",
  "within_class",
  "same_class",
  "within_phylum",
  "same_phylum",
  "cross_phylum",
];

const ORIGIN_LABELS = {
  self_regulog: "Same RegPrecise regulog (circular)",
  regprecise_transfer: "RegPrecise, other regulog",
  prodoric: "PRODORIC",
  unknown: "Unknown source",
};

// ------------------------------------------------------------------ piezas pequeñas

function Section({ title, subtitle, children, right }) {
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

function Segmented({ label, options, value, onChange }) {
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

function Stat({ label, value, sub }) {
  return (
    <div className="border border-[#E2E8F0] rounded-lg px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-[#94A3B8]">{label}</div>
      <div className="text-lg font-semibold text-[#1E293B]">{value}</div>
      {sub && <div className="text-[11px] text-[#64748B]">{sub}</div>}
    </div>
  );
}

function Spinner({ text = "Loading…" }) {
  return (
    <div className="flex items-center gap-2 text-sm text-[#64748B] py-6">
      <Loader2 size={16} className="animate-spin" /> {text}
    </div>
  );
}

function ErrorMsg({ children }) {
  return <p className="text-sm text-red-600 py-2">{children}</p>;
}

function PrecisionBar({ value }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-32 bg-[#EEF2F5] rounded">
        <div className="h-2 rounded bg-[#3A9D7C]" style={{ width: `${Math.round((value ?? 0) * 100)}%` }} />
      </div>
      <span className="text-xs font-mono text-[#334155] w-12 text-right">{pct(value)}</span>
    </div>
  );
}

function BreakdownTable({ rows, labelOf, total }) {
  if (rows.length === 0) return <p className="text-sm text-[#94A3B8]">No evaluable pairs.</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-[11px] uppercase tracking-wide text-[#94A3B8] border-b border-[#E2E8F0]">
          <th className="py-1.5 font-medium">Group</th>
          <th className="py-1.5 font-medium text-right">Evaluable</th>
          <th className="py-1.5 font-medium text-right">Share</th>
          <th className="py-1.5 font-medium text-right">TP</th>
          <th className="py-1.5 font-medium text-right">FP</th>
          <th className="py-1.5 font-medium pl-4">Precision</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="border-b border-[#F1F5F9]">
            <td className="py-1.5 text-[#334155]">{labelOf(r.key)}</td>
            <td className="py-1.5 text-right font-mono">{fmtInt(r.pairs_evaluable)}</td>
            <td className="py-1.5 text-right font-mono text-[#64748B]">{pct(r.pairs_evaluable / total)}</td>
            <td className="py-1.5 text-right font-mono">{fmtInt(r.TP)}</td>
            <td className="py-1.5 text-right font-mono">{fmtInt(r.FP)}</td>
            <td className="py-1.5 pl-4">
              <PrecisionBar value={r.precision} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CurveTooltip({ active, payload }) {
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

// ------------------------------------------------------------------ línea base (semana 12)
// Red de prueba del pipeline propio desde fimo_hits, solo en los 312 genomas validables (make baseline-atlas).
const BASELINE_LABEL = { scan: "Scan only", order_ceiling: "Tier ≤ same_order", class_ceiling: "Tier ≤ same_class" };

function baselineLabel(v) {
  const m = v.match(/^(\w+) p<=1e-(\d)$/);
  return m ? `${BASELINE_LABEL[m[1]] ?? m[1]}, p ≤ 1e-${m[2]}` : v;
}

function BaselineRow({ r, label, bestF1 }) {
  return (
    <tr className="border-b border-[#F1F5F9]">
      <td className="py-1.5 text-[#334155]">{label}</td>
      <td className="py-1.5 text-right font-mono text-[#64748B]">{fmtInt(r.pairs_validable_genomes)}</td>
      <td className="py-1.5 text-right font-mono">{pct(r.precision)}</td>
      <td className="py-1.5 text-right font-mono">{pct(r.recall)}</td>
      <td className={`py-1.5 text-right font-mono ${r.f1 === bestF1 ? "font-semibold text-[#176B57]" : ""}`}>{dec(r.f1)}</td>
    </tr>
  );
}

function BaselineSection({ mode, universe }) {
  const [rows, setRows] = useState([]);
  const [repro, setRepro] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([api.getAtlasBaselineSummary(mode, universe), api.getAtlasBaselineReproduction()])
      .then(([s, r]) => {
        if (cancelled) return;
        setRows(s.data.rows ?? []);
        setRepro(r.data.rows ?? []);
      })
      .catch((err) => !cancelled && setError(detail(err, "Baseline results could not be loaded (make baseline-atlas).")))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [mode, universe]);

  const external = rows.filter((r) => r.source === "external");
  const baseline = rows.filter((r) => r.source === "baseline");
  const bestF1 = Math.max(...rows.map((r) => r.f1 ?? 0));

  return (
    <Section
      title="Own baseline vs external networks"
      subtitle="Test network built by this project directly from the FIMO hits of the 312 validable genomes: a p-value threshold and, optionally, the transfer-tier ceiling of the external networks, without phylogenetic footprinting. Same gold standard and evaluation as above."
    >
      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorMsg>{error}</ErrorMsg>
      ) : (
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="text-sm font-semibold text-[#334155] mb-1">What the external filters add</h3>
            <p className="text-xs text-[#64748B] mb-2">
              Each external network compared with the baseline that uses its own p-value threshold and tier ceiling.
              Every external pair is in that baseline; the share kept is the effect of footprinting.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-[#94A3B8] border-b border-[#E2E8F0]">
                    <th className="py-1.5 font-medium">Network</th>
                    <th className="py-1.5 font-medium">Threshold · tier · footprint</th>
                    <th className="py-1.5 font-medium text-right">Baseline pairs</th>
                    <th className="py-1.5 font-medium text-right">Network pairs</th>
                    <th className="py-1.5 font-medium text-right">Network in baseline</th>
                    <th className="py-1.5 font-medium text-right">Baseline kept</th>
                  </tr>
                </thead>
                <tbody>
                  {repro.map((r) => (
                    <tr key={r.network_id} className="border-b border-[#F1F5F9]">
                      <td className="py-1.5 text-[#334155]">{r.network}</td>
                      <td className="py-1.5 text-xs font-mono text-[#64748B]">
                        p ≤ {r.p_threshold.toExponential(0)} · {r.tier_ceiling} · ≥ {r.footprint_min ?? 0}
                      </td>
                      <td className="py-1.5 text-right font-mono">{fmtInt(r.baseline_pairs)}</td>
                      <td className="py-1.5 text-right font-mono">{fmtInt(r.external_pairs)}</td>
                      <td className="py-1.5 text-right font-mono">{pct(r.external_in_baseline)}</td>
                      <td className="py-1.5 text-right font-mono">{pct(r.baseline_kept_by_external)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-[#94A3B8] mt-1">
              no-footprint is reproduced exactly (same threshold and tier, no footprinting): at the TF–operon level the
              external pipeline is threshold + tier ceiling + footprinting.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-[#334155] mb-1">Precision and recall</h3>
            <p className="text-xs text-[#64748B] mb-2">
              Mode and universe as selected above. Pairs are counted in the 312 validable genomes
              {mode !== "all" ? " (external networks: mode all only)" : ""}. Best F1 in bold.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-[#94A3B8] border-b border-[#E2E8F0]">
                    <th className="py-1.5 font-medium">Network</th>
                    <th className="py-1.5 font-medium text-right">Pairs</th>
                    <th className="py-1.5 font-medium text-right">Precision</th>
                    <th className="py-1.5 font-medium text-right">Recall</th>
                    <th className="py-1.5 font-medium text-right">F1</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colSpan={5} className="pt-2 pb-1 text-[11px] font-semibold text-[#64748B]">External networks</td>
                  </tr>
                  {external.map((r) => (
                    <BaselineRow key={r.variant} r={r} label={r.variant} bestF1={bestF1} />
                  ))}
                  <tr>
                    <td colSpan={5} className="pt-3 pb-1 text-[11px] font-semibold text-[#64748B]">Own baseline</td>
                  </tr>
                  {baseline.map((r) => (
                    <BaselineRow key={r.variant} r={r} label={baselineLabel(r.variant)} bestF1={bestF1} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </Section>
  );
}

// ------------------------------------------------------------------ vista

export default function Validation({ initialOrganism }) {
  const [networks, setNetworks] = useState([]);
  const [networkId, setNetworkId] = useState(DEFAULT_NETWORK);
  const [mode, setMode] = useState("all");
  const [universe, setUniverse] = useState("genome_tf");

  const [manifest, setManifest] = useState(null);
  const [summary, setSummary] = useState([]);
  const [loadingBase, setLoadingBase] = useState(true);
  const [error, setError] = useState("");

  const [curve, setCurve] = useState([]);
  const [loadingCurve, setLoadingCurve] = useState(false);
  const [curveError, setCurveError] = useState("");

  const [tiers, setTiers] = useState([]);
  const [origins, setOrigins] = useState([]);
  const [genomes, setGenomes] = useState([]);
  const [genomeAcc, setGenomeAcc] = useState(initialOrganism || DEFAULT_GENOME);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState("");

  // Redes, definición de la evaluación y resumen (una sola vez)
  useEffect(() => {
    let cancelled = false;
    Promise.all([api.getAtlasNetworks(), api.getAtlasValidationManifest(), api.getAtlasValidationSummary()])
      .then(([netRes, manRes, sumRes]) => {
        if (cancelled) return;
        const list = Array.isArray(netRes.data) ? netRes.data : netRes.data.networks ?? netRes.data.items ?? [];
        setNetworks(list);
        setManifest(manRes.data);
        setSummary(sumRes.data.rows ?? []);
      })
      .catch((err) => !cancelled && setError(detail(err, "Validation results could not be loaded.")))
      .finally(() => !cancelled && setLoadingBase(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // Curvas P/R de las 5 redes en el modo elegido
  useEffect(() => {
    let cancelled = false;
    setLoadingCurve(true);
    setCurveError("");
    api
      .getAtlasValidationCurve(undefined, mode)
      .then((res) => !cancelled && setCurve(res.data.points ?? []))
      .catch((err) => !cancelled && setCurveError(detail(err, "The P/R curves could not be loaded.")))
      .finally(() => !cancelled && setLoadingCurve(false));
    return () => {
      cancelled = true;
    };
  }, [mode]);

  // Desglose por tier/origen y tabla por genoma de la red elegida
  useEffect(() => {
    let cancelled = false;
    setLoadingDetail(true);
    setDetailError("");
    Promise.all([
      api.getAtlasValidationBreakdown("tier", networkId, mode),
      api.getAtlasValidationBreakdown("origin", networkId, mode),
      api.getAtlasValidationGenomes(networkId, mode, { limit: 5000 }),
    ])
      .then(([tierRes, originRes, genRes]) => {
        if (cancelled) return;
        setTiers(tierRes.data.rows ?? []);
        setOrigins(originRes.data.rows ?? []);
        setGenomes(genRes.data.rows ?? []);
      })
      .catch((err) => !cancelled && setDetailError(detail(err, "The network breakdown could not be loaded.")))
      .finally(() => !cancelled && setLoadingDetail(false));
    return () => {
      cancelled = true;
    };
  }, [networkId, mode]);

  // Si el genoma elegido no es validable, se cae a E. coli K-12 o al primero
  useEffect(() => {
    if (genomes.length === 0 || genomes.some((g) => g.accession === genomeAcc)) return;
    const fallback = genomes.find((g) => g.accession === DEFAULT_GENOME) ?? genomes[0];
    setGenomeAcc(fallback.accession);
  }, [genomes, genomeAcc]);

  // ---------------------------------------------------------------- derivados

  const tableRows = useMemo(
    () =>
      summary
        .filter((r) => r.mode === mode && r.universe === universe)
        .sort((a, b) => a.network_id - b.network_id),
    [summary, mode, universe]
  );
  const bestF1 = Math.max(...tableRows.map((r) => r.f1 ?? 0), 0);

  const curvesByNetwork = useMemo(() => {
    const groups = {};
    curve.forEach((p) => {
      if (p.precision == null || p.recall == null) return;
      (groups[p.network_id] ??= []).push(p);
    });
    Object.values(groups).forEach((pts) => pts.sort((a, b) => b.min_confidence - a.min_confidence));
    return groups;
  }, [curve]);

  const maxRecall = useMemo(() => {
    const m = Math.max(0.1, ...curve.map((p) => p.recall ?? 0));
    return Math.min(1, Math.ceil(m * 10) / 10);
  }, [curve]);

  const d33Points = useMemo(
    () => summary.filter((r) => r.mode === "all" && r.universe === "genome_tf"),
    [summary]
  );

  const thresholdData = useMemo(() => {
    const pts = curve.filter((p) => p.network_id === networkId).sort((a, b) => a.min_confidence - b.min_confidence);
    const base = pts[0]?.pairs_total || 1;
    return pts.map((p) => ({ ...p, kept: p.pairs_total / base }));
  }, [curve, networkId]);

  const tierRows = useMemo(() => {
    const rank = (t) => (TIER_ORDER.includes(t) ? TIER_ORDER.indexOf(t) : TIER_ORDER.length);
    return tiers.map((r) => ({ ...r, key: r.tier })).sort((a, b) => rank(a.key) - rank(b.key));
  }, [tiers]);
  const tierTotal = tierRows.reduce((s, r) => s + r.pairs_evaluable, 0);

  const originRows = useMemo(
    () => origins.map((r) => ({ ...r, key: r.origin })).sort((a, b) => b.pairs_evaluable - a.pairs_evaluable),
    [origins]
  );
  const originTotal = originRows.reduce((s, r) => s + r.pairs_evaluable, 0);

  const genomeOptions = useMemo(
    () =>
      genomes
        .map((g) => ({
          id: g.accession,
          label: g.ncbi_organism || g.accession,
          muted: g.pairs_evaluable === 0,
          meta: `${fmtInt(g.n_gold)} curated`,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [genomes]
  );
  const genome = genomes.find((g) => g.accession === genomeAcc);
  const withPredictions = genomes.filter((g) => g.pairs_evaluable > 0).length;

  const gs = manifest?.gold_stats;
  const lostRows = gs ? gs.rows_without_genome + gs.rows_unmatched_locus : null;
  const selectedName = tableRows.find((r) => r.network_id === networkId)?.network ?? `network ${networkId}`;

  // ---------------------------------------------------------------- render

  if (loadingBase) return <Spinner text="Loading validation results…" />;
  if (error)
    return (
      <div className="p-6">
        <ErrorMsg>{error}</ErrorMsg>
      </div>
    );

  return (
    <div className="flex flex-col gap-5 p-6">
      <header>
        <h1 className="text-xl font-semibold text-[#1E293B]">Validation against RegPrecise 3.0</h1>
        <p className="text-sm text-[#64748B] mt-1 max-w-4xl">
          Predicted TF → operon interactions compared with curated regulons. Curated genes are projected to their
          operon; TFs are matched by normalized name. Results are computed offline and read from{" "}
          <span className="font-mono text-xs">data/results/validation</span>.
        </p>
        {gs && (
          <p className="text-xs text-[#64748B] mt-2">
            Gold standard: <b>{fmtInt(gs.gold_tf_operon_pairs)}</b> curated TF–operon pairs in{" "}
            <b>{fmtInt(gs.validable_genomes)}</b> genomes. {fmtInt(lostRows)} of {fmtInt(gs.curated_rows)} curated rows (
            {pct(lostRows / gs.curated_rows)}) could not be used: {fmtInt(gs.rows_without_genome)} without a genome in
            the database and {fmtInt(gs.rows_unmatched_locus)} with unmatched locus tags.
          </p>
        )}
      </header>

      <div className="flex flex-wrap gap-6 items-start">
        <NetworkSelector networks={networks} value={networkId} onChange={setNetworkId} />
        <Segmented label="Edges" options={MODES} value={mode} onChange={setMode} />
        <Segmented label="Scored predictions" options={UNIVERSES} value={universe} onChange={setUniverse} />
      </div>

      {/* Resumen de las 5 redes */}
      <Section
        title="Networks"
        subtitle="Recall is computed over all curated pairs. D33 are the values reported by the external pipeline; its exact evaluation definition is unknown, so only the ranking is expected to match. Click a row to select the network."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-[#94A3B8] border-b border-[#E2E8F0]">
                <th className="py-2 font-medium">Network</th>
                <th className="py-2 font-medium text-right">Precision</th>
                <th className="py-2 font-medium text-right">Recall</th>
                <th className="py-2 font-medium text-right">F1</th>
                <th className="py-2 font-medium text-right">D33 P / R / F1</th>
                <th className="py-2 font-medium text-right">Evaluable pairs</th>
                <th className="py-2 font-medium text-right">Genomes</th>
                <th className="py-2 font-medium text-right">Median P / R per genome</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((r) => (
                <tr
                  key={r.network_id}
                  onClick={() => setNetworkId(r.network_id)}
                  className={`border-b border-[#F1F5F9] cursor-pointer ${
                    r.network_id === networkId ? "bg-[#F0F7F4]" : "hover:bg-[#F8FAFC]"
                  }`}
                >
                  <td className="py-2">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle"
                      style={{ background: NET_COLORS[r.network_id] }}
                    />
                    <span className="font-medium text-[#334155]">{r.network}</span>
                  </td>
                  <td className="py-2 text-right font-mono">{dec(r.precision)}</td>
                  <td className="py-2 text-right font-mono">{dec(r.recall)}</td>
                  <td className={`py-2 text-right font-mono ${r.f1 === bestF1 ? "font-bold text-[#176B57]" : ""}`}>
                    {dec(r.f1)}
                  </td>
                  <td className="py-2 text-right font-mono text-[#94A3B8]">
                    {dec(r.d33_precision)} / {dec(r.d33_recall)} / {dec(r.d33_f1)}
                  </td>
                  <td className="py-2 text-right font-mono">
                    {fmtInt(r.pairs_evaluable)}
                    <span className="text-[#94A3B8]"> of {fmtInt(r.pairs_total)} ({pct(r.pairs_evaluable / r.pairs_total)})</span>
                  </td>
                  <td className="py-2 text-right font-mono">{fmtInt(r.genomes_evaluated)}</td>
                  <td className="py-2 text-right font-mono text-[#64748B]">
                    {dec(r.precision_macro_median)} / {dec(r.recall_macro_median)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-[#94A3B8] mt-3">
          Predictions outside the scored set are reported as not evaluable, not as false positives: the gold standard is
          incomplete, so the scores describe only the evaluable fraction of each network.
        </p>
      </Section>

      {/* Curvas */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Section
          title="Precision–recall curves"
          subtitle={`Each curve sweeps the minimum edge confidence from 1 to 0 (curated TFs only, ${
            mode === "all" ? "all edges" : "independent edges"
          }). Hollow dots: values reported in D33.`}
        >
          {loadingCurve ? (
            <Spinner />
          ) : curveError ? (
            <ErrorMsg>{curveError}</ErrorMsg>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart margin={{ top: 10, right: 20, bottom: 25, left: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis
                  type="number"
                  dataKey="recall"
                  domain={[0, maxRecall]}
                  tickFormatter={pctTick}
                  allowDuplicatedCategory={false}
                  fontSize={11}
                  label={{ value: "Recall", position: "insideBottom", offset: -15, fontSize: 12 }}
                />
                <YAxis
                  type="number"
                  domain={[0, 1]}
                  tickFormatter={pctTick}
                  fontSize={11}
                  label={{ value: "Precision", angle: -90, position: "insideLeft", fontSize: 12 }}
                />
                <Tooltip content={<CurveTooltip />} />
                <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 12 }} />
                {Object.entries(curvesByNetwork).map(([id, pts]) => (
                  <Line
                    key={id}
                    data={pts}
                    dataKey="precision"
                    name={pts[0].network}
                    stroke={NET_COLORS[id]}
                    strokeWidth={Number(id) === networkId ? 3 : 1.5}
                    dot={false}
                    type="linear"
                    isAnimationActive={false}
                  />
                ))}
                {d33Points.map((r) => (
                  <ReferenceDot
                    key={`d33-${r.network_id}`}
                    x={r.d33_recall}
                    y={r.d33_precision}
                    r={5}
                    fill="#fff"
                    stroke={NET_COLORS[r.network_id]}
                    strokeWidth={2}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </Section>

        <Section
          title={`Confidence threshold — ${selectedName}`}
          subtitle="Precision, recall and F1 when only edges with confidence ≥ threshold are kept. The dashed line is the share of the network's TF–operon pairs that survive the threshold."
        >
          {loadingCurve ? (
            <Spinner />
          ) : thresholdData.length === 0 ? (
            <p className="text-sm text-[#94A3B8]">No curve for this network.</p>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={thresholdData} margin={{ top: 10, right: 20, bottom: 25, left: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis
                  type="number"
                  dataKey="min_confidence"
                  domain={[0, 1]}
                  fontSize={11}
                  label={{ value: "Minimum confidence", position: "insideBottom", offset: -15, fontSize: 12 }}
                />
                <YAxis type="number" domain={[0, 1]} tickFormatter={pctTick} fontSize={11} />
                <Tooltip
                  formatter={(v) => pct(v)}
                  labelFormatter={(v) => `confidence ≥ ${Number(v).toFixed(2)}`}
                  contentStyle={{ fontSize: 12 }}
                />
                <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 12 }} />
                <Line dataKey="precision" name="Precision" stroke="#176B57" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line dataKey="recall" name="Recall" stroke="#2563EB" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line dataKey="f1" name="F1" stroke="#D97706" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line
                  dataKey="kept"
                  name="Pairs kept"
                  stroke="#94A3B8"
                  strokeDasharray="5 4"
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Section>
      </div>

      {/* Desglose de la red elegida */}
      {detailError && <ErrorMsg>{detailError}</ErrorMsg>}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Section
          title="Precision by transfer tier"
          subtitle="Tier of the motif transfer to the evaluated genome, ordered from closest to most distant relative."
        >
          {loadingDetail ? <Spinner /> : <BreakdownTable rows={tierRows} labelOf={(k) => k} total={tierTotal} />}
        </Section>
        <Section
          title="Precision by motif origin"
          subtitle={
            mode === "all"
              ? "Circular pairs come from a RegPrecise motif built with the same regulog that contains the evaluated genome."
              : "Circular pairs are excluded in independent mode."
          }
        >
          {loadingDetail ? (
            <Spinner />
          ) : (
            <BreakdownTable rows={originRows} labelOf={(k) => ORIGIN_LABELS[k] ?? k} total={originTotal} />
          )}
        </Section>
      </div>

      {/* Por genoma */}
      <Section
        title="Per genome"
        subtitle={`${fmtInt(genomes.length)} genomes have curated regulons; ${fmtInt(
          withPredictions
        )} have evaluable predictions in ${selectedName} (genomes without them are shown in gray).`}
        right={
          <OrganismSearch options={genomeOptions} value={genomeAcc} onChange={setGenomeAcc} disabled={loadingDetail} />
        }
      >
        {loadingDetail ? (
          <Spinner />
        ) : !genome ? (
          <p className="text-sm text-[#94A3B8]">Select a genome.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div>
              <div className="text-sm font-semibold text-[#334155]">{genome.ncbi_organism}</div>
              <div className="text-xs font-mono text-[#94A3B8]">
                {genome.accession} · {genome.gtdb_family ?? "—"}
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              <Stat label="Precision" value={pct(genome.precision)} />
              <Stat label="Recall" value={pct(genome.recall)} />
              <Stat label="Curated pairs" value={fmtInt(genome.n_gold)} />
              <Stat label="Evaluable predictions" value={fmtInt(genome.pairs_evaluable)} />
              <Stat label="TP" value={fmtInt(genome.TP)} />
              <Stat label="FP" value={fmtInt(genome.FP)} />
              <Stat label="FN" value={fmtInt(genome.FN)} />
            </div>
            {genome.pairs_evaluable === 0 && (
              <p className="text-xs text-[#94A3B8]">
                This network has no predictions for the curated TFs of this genome, so precision is undefined.
              </p>
            )}
          </div>
        )}
      </Section>

      <BaselineSection mode={mode} universe={universe} />
    </div>
  );
}

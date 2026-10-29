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
import { api } from "../services/api";
import NetworkSelector from "../components/NetworkSelector";
import OrganismSearch from "../components/OrganismSearch";
import { DEFAULT_NETWORK, DEFAULT_GENOME, fmtInt } from "../utils/atlas";
import { pct, pctTick, dec, detail } from "../utils/validation";
import { Section, Segmented, Stat, Spinner, ErrorMsg, BreakdownTable, CurveTooltip } from "../components/ValidationParts";
import BaselineSection from "../components/BaselineSection";
import Collapsible from "../components/Collapsible";
import ScrollX from "../components/ScrollX";
import { clickable, FOCUS_RING } from "../utils/a11y";
import { Info } from "lucide-react";

// Validación de las 5 redes del atlas contra RegPrecise.
// La evaluación se calcula offline (make validate-atlas); esta vista solo lee resultados.

const NET_COLORS = { 1: "#176B57", 2: "#7C3AED", 3: "#2563EB", 4: "#D97706", 5: "#DB2777" };

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
      .catch((err) => !cancelled && setError(detail(err, "Validation results could not be loaded. Check that the backend is running and the results exist (make validate-atlas).")))
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
  const selectedRow = tableRows.find((r) => r.network_id === networkId);
  const selectedName = selectedRow?.network ?? `network ${networkId}`;

  // Resumen de los desgloses para la sección plegada (rango de precisión por tier y precisión circular).
  // Solo tiers con al menos el 1 % de los pares evaluables: un grupo de 50 pares no representa a la red.
  const tierScored = tierRows.filter((r) => r.precision != null && r.pairs_evaluable >= 0.01 * tierTotal);
  const tierMin = tierScored.reduce((m, r) => (m == null || r.precision < m.precision ? r : m), null);
  const tierMax = tierScored.reduce((m, r) => (m == null || r.precision > m.precision ? r : m), null);
  const circular = originRows.find((r) => r.key === "self_regulog");
  const nonCircular = originRows.filter((r) => r.key !== "self_regulog");
  const nonCircularN = nonCircular.reduce((s, r) => s + r.pairs_evaluable, 0);
  const nonCircularP = nonCircularN ? nonCircular.reduce((s, r) => s + r.TP, 0) / nonCircularN : null;
  const breakdownSummary =
    tierMin && tierMax
      ? `Precision by tier ranges from ${pct(tierMin.precision)} (${tierMin.key}) to ${pct(tierMax.precision)} (${tierMax.key})` +
        (circular && nonCircularP != null
          ? `; circular pairs ${pct(circular.precision)} vs ${pct(nonCircularP)} for independent motifs.`
          : ".")
      : null;

  // ---------------------------------------------------------------- render

  if (loadingBase) return <Spinner text="Loading validation results…" />;
  // Mismo recuadro rojo que las demás vistas (revisión de la semana 13, C1)
  if (error)
    return (
      <div className="p-6">
        <div className="bg-[#FEF0F0] border border-[#F8BFBF] text-[#D96C6C] text-sm rounded-lg px-4 py-2.5">{error}</div>
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

      {selectedRow && (
        <div className="bg-[#F0F7FB] border border-[#CFE3EF] rounded-lg px-4 py-3 text-xs text-[#334155] flex gap-2">
          <Info className="w-4 h-4 text-[#3B82B8] shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">{selectedName}</span>
            {mode === "independent" ? " (independent edges)" : ""}: <b>{pct(selectedRow.precision)}</b> of the scored
            predictions match a curated interaction (precision) and the network recovers <b>{pct(selectedRow.recall)}</b> of
            the curated TF–operon pairs (recall). Only {pct(selectedRow.pairs_evaluable / selectedRow.pairs_total)} of its{" "}
            {fmtInt(selectedRow.pairs_total)} pairs can be scored; the rest have no curated regulon to compare with and are
            not counted as errors.
          </div>
        </div>
      )}

      {/* Resumen de las 5 redes */}
      <Section
        title="Networks"
        subtitle="Recall is computed over all curated pairs. D33 are the values reported by the external pipeline; its exact evaluation definition is unknown, so only the ranking is expected to match. Click a row to select the network."
      >
        <ScrollX>
          <table className="w-full text-sm [&_th]:whitespace-nowrap [&_td]:whitespace-nowrap [&_th+th]:pl-4 [&_td+td]:pl-4">
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
                  {...clickable(() => setNetworkId(r.network_id))}
                  className={`border-b border-[#F1F5F9] cursor-pointer ${FOCUS_RING} ${
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
        </ScrollX>
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
      <Collapsible
        title={`Where the precision comes from — ${selectedName}`}
        subtitle="Precision split by how distant the motif source is (transfer tier) and by where the motif was built (motif origin)."
        summary={loadingDetail ? null : breakdownSummary}
      >
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm font-semibold text-[#334155]">By transfer tier</h3>
            <p className="text-xs text-[#64748B] mt-0.5 mb-2">
              Tier of the motif transfer to the evaluated genome, from closest to most distant relative.
            </p>
            {loadingDetail ? <Spinner /> : <BreakdownTable rows={tierRows} labelOf={(k) => k} total={tierTotal} />}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#334155]">By motif origin</h3>
            <p className="text-xs text-[#64748B] mt-0.5 mb-2">
              {mode === "all"
                ? "Circular pairs come from a RegPrecise motif built with the same regulog that contains the evaluated genome."
                : "Circular pairs are excluded in independent mode."}
            </p>
            {loadingDetail ? (
              <Spinner />
            ) : (
              <BreakdownTable rows={originRows} labelOf={(k) => ORIGIN_LABELS[k] ?? k} total={originTotal} />
            )}
          </div>
        </div>
      </Collapsible>

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

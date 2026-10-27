import { useState, useEffect, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { Loader2, Info } from "lucide-react";
import { api } from "../services/api";
import NetworkSelector from "../components/NetworkSelector";
import OrganismSearch from "../components/OrganismSearch";
import { DEFAULT_NETWORK, DEFAULT_GENOME, fmtInt, selectClass } from "../utils/atlas";
import { METRIC_LABELS } from "../utils/metrics";
import Collapsible from "../components/Collapsible";

// Robustez de las métricas propias (make robustness-atlas):
//   1. submuestreo de aristas: ¿se conserva el orden de los genomas si la red está incompleta?
//   2. entre redes: anidamiento, orden de los genomas entre redes y efecto del footprinting.

const STRATEGIES = [
  { key: "random", label: "Random", color: "#3A9D7C", help: "edges removed uniformly at random" },
  { key: "degree_biased", label: "Degree-biased", color: "#D97706", help: "edges of high-degree TFs removed first" },
  { key: "low_confidence", label: "Low confidence", color: "#6D5BD0", help: "lowest-confidence edges removed (like a stricter threshold)" },
];
const RATES = [0.1, 0.25, 0.5, 0.75];

const METRICS = [
  { key: "n_tf", label: METRIC_LABELS.n_tf, digits: 0 },
  { key: "n_targets", label: METRIC_LABELS.n_targets, digits: 0 },
  { key: "n_edges", label: METRIC_LABELS.n_edges, digits: 0 },
  { key: "density", label: METRIC_LABELS.density, digits: 4 },
  { key: "edges_per_tf", label: METRIC_LABELS.edges_per_tf, digits: 2 },
  { key: "frac_multi_reg", label: METRIC_LABELS.frac_multi_reg, digits: 3 },
  { key: "frac_genome_targeted", label: METRIC_LABELS.frac_genome_targeted, digits: 3 },
  { key: "frac_largest", label: METRIC_LABELS.frac_largest, digits: 3 },
  { key: "mean_out_degree", label: METRIC_LABELS.mean_out_degree, digits: 2 },
  { key: "max_out_degree", label: METRIC_LABELS.max_out_degree, digits: 0 },
  { key: "mean_in_degree", label: METRIC_LABELS.mean_in_degree, digits: 2 },
  { key: "out_degree_entropy", label: METRIC_LABELS.out_degree_entropy, digits: 3 },
  { key: "out_degree_gini", label: METRIC_LABELS.out_degree_gini, digits: 3 },
  { key: "hub_share", label: METRIC_LABELS.hub_share, digits: 3 },
  { key: "n_components", label: METRIC_LABELS.n_components, digits: 0 },
];

const CLASSES = {
  robust: { label: "Robust", cls: "bg-[#E8F5F0] text-[#176B57] border-[#B8DDD0]" },
  moderate: { label: "Moderate", cls: "bg-[#FFFBEB] text-[#92400E] border-[#FCEDB8]" },
  not_robust: { label: "Not robust", cls: "bg-[#FEF0F0] text-[#B54848] border-[#F8BFBF]" },
  trivial: { label: "Trivial", cls: "bg-[#F1F5F9] text-[#475569] border-[#D9E2E7]" },
  undefined: { label: "Not defined", cls: "bg-[#F1F5F9] text-[#64748B] border-[#D9E2E7]" },
};

const NET_ORDER = ["validated", "high-precision", "balanced", "permissive", "no-footprint"];
const GENOME_COLOR = "#3A9D7C";
const ATLAS_COLOR = "#D97706";

const metricInfo = (key) => METRICS.find((m) => m.key === key) ?? { key, label: key, digits: 2 };
const fmt = (v, digits) =>
  v == null ? "—" : digits === 0 ? fmtInt(Math.round(v * 10) / 10) : Number(v).toFixed(digits);
const pct = (v) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const fmtRho = (v) => (v == null ? "—" : v.toFixed(2));

function ClassBadge({ value }) {
  const c = CLASSES[value] ?? CLASSES.undefined;
  return <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded border ${c.cls}`}>{c.label}</span>;
}

function Card({ loading, children }) {
  return (
    <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-5 relative">
      {loading && (
        <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-10 rounded-xl">
          <Loader2 className="w-6 h-6 text-[#3A9D7C] animate-spin" />
        </div>
      )}
      {children}
    </div>
  );
}

function SeriesTooltip({ active, payload, label, valueFmt }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-[#D9E2E7] rounded-lg p-3 shadow-lg text-xs">
      <div className="font-semibold text-[#334155] mb-1">{pct(label)} of edges removed</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-1.5 text-[#64748B]">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          {p.name}: <span className="font-mono text-[#334155]">{valueFmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// Matriz 5x5 con sombreado según el valor (0-1)
function Matrix({ title, subtitle, cells, valueFmt }) {
  const get = (a, b) => cells.find((c) => c.a === a && c.b === b)?.value;
  return (
    <div>
      <h4 className="text-xs font-semibold text-[#334155]">{title}</h4>
      <p className="text-[11px] text-[#64748B] mb-2">{subtitle}</p>
      <table className="text-xs">
        <thead>
          <tr>
            <th />
            {NET_ORDER.map((n) => (
              <th key={n} className="px-2 py-1 font-medium text-[#64748B] text-center">{n}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {NET_ORDER.map((a) => (
            <tr key={a}>
              <td className="pr-2 py-1 font-medium text-[#64748B] text-right">{a}</td>
              {NET_ORDER.map((b) => {
                const v = get(a, b);
                return (
                  <td
                    key={b}
                    className="px-2 py-1 text-center font-mono text-[#334155] border border-white"
                    style={{ backgroundColor: v == null ? "#F8FAFC" : `rgba(58,157,124,${0.08 + 0.5 * Math.max(0, v)})` }}
                  >
                    {v == null ? "—" : valueFmt(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Robustness({ initialOrganism }) {
  const [networks, setNetworks] = useState([]);
  const [networkId, setNetworkId] = useState(DEFAULT_NETWORK);
  const [strategy, setStrategy] = useState("random");
  const [metric, setMetric] = useState("n_tf");
  const [rate, setRate] = useState(0.25);
  const [genomes, setGenomes] = useState([]);
  const [organism, setOrganism] = useState("");

  const [summary, setSummary] = useState([]); // submuestreo, todas las estrategias de la red elegida
  const [genomeRows, setGenomeRows] = useState([]);
  const [nesting, setNesting] = useState([]);
  const [between, setBetween] = useState([]);
  const [footprint, setFootprint] = useState([]);
  const [loading, setLoading] = useState(true);
  const [genomeLoading, setGenomeLoading] = useState(false);
  const [error, setError] = useState("");
  const [genomeError, setGenomeError] = useState("");

  // 1. Redes y datos que no dependen de la red (anidamiento, footprinting)
  useEffect(() => {
    api
      .getAtlasNetworks()
      .then((res) => setNetworks(res.data))
      .catch(() => setError("The network list could not be loaded. Check that the backend is running."));
    Promise.all([api.getAtlasRobustnessNesting(), api.getAtlasRobustnessFootprint()])
      .then(([n, f]) => {
        setNesting(n.data.rows ?? []);
        setFootprint(f.data.rows ?? []);
      })
      .catch((err) =>
        setError(
          err?.response?.data?.detail ??
            "Robustness results could not be loaded. Check that the backend is running and the results exist (make robustness-atlas)."
        )
      );
  }, []);

  // 2. Submuestreo de la red elegida y genomas del atlas con aristas (para el buscador)
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.getAtlasRobustnessSubsampling(networkId),
      api.getAtlasOwnMetrics(networkId, { atlasOnly: true, withEdgesOnly: true }),
    ])
      .then(([s, g]) => {
        if (cancelled) return;
        setSummary(s.data.rows ?? []);
        const list = g.data.rows ?? [];
        setGenomes(list);
        setOrganism((prev) => {
          const ok = (id) => list.some((r) => r.accession === id && r.n_edges >= 10);
          if (prev && ok(prev)) return prev;
          return [initialOrganism, DEFAULT_GENOME].find((id) => id && ok(id)) ?? list.find((r) => r.n_edges >= 10)?.accession ?? "";
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setSummary([]);
        setError(
          err?.response?.data?.detail ??
            "Robustness results could not be loaded. Check that the backend is running and the results exist (make robustness-atlas)."
        );
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [networkId, initialOrganism]);

  // 3. Orden de los genomas entre redes para la métrica elegida
  useEffect(() => {
    api
      .getAtlasRobustnessBetween(metric)
      .then((res) => setBetween(res.data.rows ?? []))
      .catch(() => setBetween([]));
  }, [metric]);

  // 4. Ficha del genoma elegido
  useEffect(() => {
    if (!organism) return;
    let cancelled = false;
    setGenomeLoading(true);
    setGenomeError("");
    api
      .getAtlasRobustnessGenome(networkId, organism)
      .then((res) => !cancelled && setGenomeRows(res.data.rows ?? []))
      .catch((err) => {
        if (cancelled) return;
        setGenomeRows([]);
        setGenomeError(err?.response?.data?.detail ?? "Subsampling results for this genome could not be loaded.");
      })
      .finally(() => !cancelled && setGenomeLoading(false));
    return () => {
      cancelled = true;
    };
  }, [networkId, organism]);

  const info = metricInfo(metric);
  const strat = STRATEGIES.find((s) => s.key === strategy);
  const genome = genomes.find((g) => g.accession === organism);

  const options = useMemo(
    () =>
      genomes.map((g) => ({
        id: g.accession,
        label: g.ncbi_organism || g.accession,
        muted: g.n_edges < 10,
        meta: g.n_edges < 10 ? `${fmtInt(g.n_edges)} edges (fewer than 10, not subsampled)` : `${fmtInt(g.n_edges)} edges`,
      })),
    [genomes]
  );

  // Curva de estabilidad del orden: una serie por estrategia
  const rankCurve = useMemo(
    () => [
      { rate: 0, ...Object.fromEntries(STRATEGIES.map((s) => [s.key, 1])) },
      ...RATES.map((r) => ({
        rate: r,
        ...Object.fromEntries(
          STRATEGIES.map((s) => [
            s.key,
            summary.find((x) => x.metric === metric && x.strategy === s.key && x.rate === r)?.spearman ?? null,
          ])
        ),
      })),
    ],
    [summary, metric]
  );
  const isTrivial = summary.some((x) => x.metric === metric && x.trivial);

  // Curva de retención: genoma elegido vs mediana del atlas
  const retentionCurve = useMemo(
    () => [
      { rate: 0, genome: 1, atlas: 1 },
      ...RATES.map((r) => ({
        rate: r,
        genome: genomeRows.find((x) => x.metric === metric && x.strategy === strategy && x.rate === r)?.retention ?? null,
        atlas:
          summary.find((x) => x.metric === metric && x.strategy === strategy && x.rate === r)?.retention_median ?? null,
      })),
    ],
    [genomeRows, summary, metric, strategy]
  );

  const stratSummary = summary.filter((x) => x.strategy === strategy);
  const cell = (m, r) => stratSummary.find((x) => x.metric === m && x.rate === r);
  const atRate = stratSummary.filter((x) => x.rate === 0.5 && !x.trivial);
  const nRobust = atRate.filter((x) => x.robustness === "robust").length;

  // Resumen de la ficha del genoma: métricas que quedan dentro de ±20 % de su valor original a la tasa elegida.
  const genomeAtRate = genomeRows.filter((x) => x.strategy === strategy && x.rate === rate && x.retention != null);
  const genomeStable = genomeAtRate.filter((x) => Math.abs(x.retention - 1) <= 0.2).length;
  const genomeSummary = genomeAtRate.length
    ? `With ${pct(rate)} of the edges removed (${strat.label.toLowerCase()}), ${genomeStable} of ${genomeAtRate.length} metrics stay within ±20% of their original value in this genome.`
    : null;

  // Resumen del footprinting: pares que conserva un genoma típico y métricas cuyo orden se mantiene (ρ ≥ 0.90).
  const fpPairs = footprint.find((x) => x.metric === "n_edges");
  const fpStable = footprint.filter((x) => x.spearman != null && x.spearman >= 0.9).length;
  const footprintSummary = fpPairs
    ? `A typical genome keeps ${pct(fpPairs.median_ratio)} of its TF–operon pairs after footprinting, and ${fpStable} of ${footprint.length} metrics keep the ranking of genomes (Spearman ≥ 0.90).`
    : null;

  const nestingCells = nesting.map((n) => ({ a: n.from_network, b: n.to_network, value: n.share_in_to }));
  const betweenCells = between.flatMap((r) => [
    { a: r.a, b: r.b, value: r.spearman },
    { a: r.b, b: r.a, value: r.spearman },
  ]).concat(NET_ORDER.map((n) => ({ a: n, b: n, value: 1 })));

  return (
    <div className="space-y-6 max-w-[1100px]">
      <div>
        <h1 className="text-2xl font-semibold text-[#334155]">Metric Robustness</h1>
        <p className="text-sm text-[#64748B] mt-1">
          How stable the own topological metrics are when the network is incomplete (edge subsampling) and when a
          different network definition is used.
        </p>
      </div>

      {error && (
        <div className="bg-[#FEF0F0] border border-[#F8BFBF] text-[#D96C6C] text-sm rounded-lg px-4 py-2.5">{error}</div>
      )}

      {/* Controles */}
      <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-4 flex flex-wrap items-end gap-4">
        <NetworkSelector networks={networks} value={networkId} onChange={setNetworkId} />
        <div className="flex flex-col gap-1">
          <span className="text-xs text-[#64748B]">Removal strategy</span>
          <div className="flex rounded-lg border border-[#D9E2E7] overflow-hidden">
            {STRATEGIES.map((s) => (
              <button
                key={s.key}
                onClick={() => setStrategy(s.key)}
                title={s.help}
                className={`px-3 py-1.5 text-xs transition-colors ${
                  strategy === s.key ? "bg-[#3A9D7C] text-white" : "bg-white text-[#64748B] hover:bg-[#F7FAFC]"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[#64748B]">Metric</span>
          <select value={metric} onChange={(e) => setMetric(e.target.value)} className={selectClass}>
            {METRICS.map((m) => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </select>
        </label>
        <div className="flex flex-col gap-1 min-w-[260px] flex-1">
          <span className="text-xs text-[#64748B]">Organism</span>
          <OrganismSearch options={options} value={organism} onChange={setOrganism} disabled={!options.length} />
        </div>
      </div>

      {!loading && atRate.length > 0 && (
        <div className="bg-[#F0F7FB] border border-[#CFE3EF] rounded-lg px-4 py-3 text-xs text-[#334155] flex gap-2">
          <Info className="w-4 h-4 text-[#3B82B8] shrink-0 mt-0.5" />
          <div>
            With <span className="font-semibold">{strat.label.toLowerCase()}</span> removal of half of the edges ({strat.help}),{" "}
            <span className="font-semibold">{nRobust} of {atRate.length}</span> metrics keep the ranking of atlas genomes
            (Spearman ≥ 0.90 between original and subsampled values). Robust ≥ 0.90, moderate ≥ 0.70, not robust &lt; 0.70.
            Atlas genomes with at least 10 TF–operon pairs; random and degree-biased are averaged over 10 replicates.
          </div>
        </div>
      )}

      {/* 1a. Estabilidad del orden vs tasa de eliminación */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card loading={loading}>
          <h3 className="text-sm font-semibold text-[#334155]">Rank stability — {info.label}</h3>
          <p className="text-xs text-[#64748B] mb-3">
            Spearman correlation across atlas genomes between the original and the subsampled value.
            {isTrivial && " TF–operon pairs is trivial: every strategy removes a fixed share of pairs."}
          </p>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={rankCurve} margin={{ top: 8, right: 16, bottom: 18, left: -8 }}>
              <CartesianGrid strokeDasharray="2 2" stroke="#F0F4F8" />
              <XAxis
                dataKey="rate"
                type="number"
                domain={[0, 0.75]}
                ticks={[0, ...RATES]}
                tickFormatter={pct}
                tick={{ fontSize: 11, fill: "#64748B" }}
                stroke="#D9E2E7"
                label={{ value: "Edges removed", position: "insideBottom", offset: -8, fontSize: 11, fill: "#64748B" }}
              />
              <YAxis domain={[0, 1]} tick={{ fontSize: 11, fill: "#64748B" }} stroke="#D9E2E7" />
              <ReferenceLine y={0.9} stroke="#94A3B8" strokeDasharray="4 3" />
              <ReferenceLine y={0.7} stroke="#CBD5E1" strokeDasharray="4 3" />
              <Tooltip content={<SeriesTooltip valueFmt={fmtRho} />} />
              <Legend verticalAlign="top" height={24} wrapperStyle={{ fontSize: 11, color: "#64748B" }} />
              {STRATEGIES.map((s) => (
                <Line
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.color}
                  strokeWidth={s.key === strategy ? 2.5 : 2}
                  dot={{ r: 4, fill: s.color, stroke: "#FFFFFF", strokeWidth: 2 }}
                  isAnimationActive={false}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </Card>

        {/* 1b. Retención del genoma elegido vs mediana del atlas */}
        <Card loading={genomeLoading}>
          <h3 className="text-sm font-semibold text-[#334155]">
            Degradation curve — {genome?.ncbi_organism ?? organism}
          </h3>
          <p className="text-xs text-[#64748B] mb-3">
            {info.label}: subsampled value / original value ({strat.label.toLowerCase()} removal), this genome and the
            atlas median.
          </p>
          {genomeError ? (
            <div className="text-xs text-[#D96C6C] py-10 text-center">{genomeError}</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={retentionCurve} margin={{ top: 8, right: 16, bottom: 18, left: -8 }}>
                <CartesianGrid strokeDasharray="2 2" stroke="#F0F4F8" />
                <XAxis
                  dataKey="rate"
                  type="number"
                  domain={[0, 0.75]}
                  ticks={[0, ...RATES]}
                  tickFormatter={pct}
                  tick={{ fontSize: 11, fill: "#64748B" }}
                  stroke="#D9E2E7"
                  label={{ value: "Edges removed", position: "insideBottom", offset: -8, fontSize: 11, fill: "#64748B" }}
                />
                <YAxis tick={{ fontSize: 11, fill: "#64748B" }} stroke="#D9E2E7" tickFormatter={(v) => v.toFixed(1)} />
                <ReferenceLine y={1} stroke="#CBD5E1" />
                <Tooltip content={<SeriesTooltip valueFmt={(v) => (v == null ? "—" : v.toFixed(3))} />} />
                <Legend verticalAlign="top" height={24} wrapperStyle={{ fontSize: 11, color: "#64748B" }} />
                <Line dataKey="genome" name="This genome" stroke={GENOME_COLOR} strokeWidth={2}
                  dot={{ r: 4, fill: GENOME_COLOR, stroke: "#FFFFFF", strokeWidth: 2 }} isAnimationActive={false} connectNulls />
                <Line dataKey="atlas" name="Atlas median" stroke={ATLAS_COLOR} strokeWidth={2} strokeDasharray="5 3"
                  dot={{ r: 4, fill: ATLAS_COLOR, stroke: "#FFFFFF", strokeWidth: 2 }} isAnimationActive={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* 1c. Tabla métricas x tasa */}
      <Card loading={loading}>
        <h3 className="text-sm font-semibold text-[#334155] mb-1">Edge subsampling — all metrics ({strat.label})</h3>
        <p className="text-xs text-[#64748B] mb-3">
          Rank stability (Spearman) and median retention across atlas genomes for each removal rate. Click a row to plot it.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[#64748B] border-b border-[#D9E2E7]">
                <th className="py-2 pr-3 font-medium">Metric</th>
                {RATES.map((r) => (
                  <th key={r} className="py-2 pr-3 font-medium text-right">{pct(r)} removed</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {METRICS.map((m) => (
                <tr
                  key={m.key}
                  onClick={() => setMetric(m.key)}
                  className={`border-b border-[#F0F4F8] cursor-pointer hover:bg-[#F7FAFC] ${m.key === metric ? "bg-[#F0F7F4]" : ""}`}
                >
                  <td className="py-1.5 pr-3 text-[#334155]">{m.label}</td>
                  {RATES.map((r) => {
                    const c = cell(m.key, r);
                    return (
                      <td key={r} className="py-1.5 pr-3 text-right whitespace-nowrap">
                        <span className="font-mono text-[#334155] mr-1.5">{fmtRho(c?.spearman)}</span>
                        <span className="font-mono text-[#94A3B8] mr-1.5">{pct(c?.retention_median)}</span>
                        <ClassBadge value={c?.robustness} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-[#94A3B8] mt-2">Each cell: Spearman · median retention · class.</p>
      </Card>

      {/* 1d. Ficha del genoma */}
      <Collapsible
        title={`Selected genome — ${genome?.ncbi_organism ?? organism}`}
        subtitle="Original value and mean ± SD after removing edges. Class is the atlas-wide rank stability at that rate."
        summary={genomeLoading ? null : genomeSummary}
      >
        <div className="flex justify-end mb-3">
          <div className="flex rounded-lg border border-[#D9E2E7] overflow-hidden">
            {RATES.map((r) => (
              <button
                key={r}
                onClick={() => setRate(r)}
                className={`px-3 py-1.5 text-xs transition-colors ${
                  rate === r ? "bg-[#3A9D7C] text-white" : "bg-white text-[#64748B] hover:bg-[#F7FAFC]"
                }`}
              >
                {pct(r)}
              </button>
            ))}
          </div>
        </div>
        {genomeLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 text-[#3A9D7C] animate-spin" /></div>
        ) : genomeError ? (
          <div className="text-xs text-[#D96C6C]">{genomeError}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[#64748B] border-b border-[#D9E2E7]">
                  <th className="py-2 pr-3 font-medium">Metric</th>
                  <th className="py-2 pr-3 font-medium text-right">Original</th>
                  <th className="py-2 pr-3 font-medium text-right">After removal (mean ± SD)</th>
                  <th className="py-2 pr-3 font-medium text-right">Retention</th>
                  <th className="py-2 font-medium">Atlas class</th>
                </tr>
              </thead>
              <tbody>
                {METRICS.map((m) => {
                  const r = genomeRows.find((x) => x.metric === m.key && x.strategy === strategy && x.rate === rate);
                  return (
                    <tr key={m.key} className="border-b border-[#F0F4F8]">
                      <td className="py-1.5 pr-3 text-[#334155]">{m.label}</td>
                      <td className="py-1.5 pr-3 text-right font-mono text-[#334155]">{fmt(r?.original, m.digits)}</td>
                      <td className="py-1.5 pr-3 text-right font-mono text-[#334155]">
                        {fmt(r?.mean, m.digits === 0 ? 1 : m.digits)}
                        {r?.sd != null && <span className="text-[#94A3B8]"> ± {fmt(r.sd, m.digits === 0 ? 1 : m.digits)}</span>}
                      </td>
                      <td className="py-1.5 pr-3 text-right font-mono text-[#64748B]">{pct(r?.retention)}</td>
                      <td className="py-1.5"><ClassBadge value={cell(m.key, rate)?.robustness} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Collapsible>

      {/* 2. Entre redes */}
      <Card loading={false}>
        <h3 className="text-sm font-semibold text-[#334155] mb-1">Between networks</h3>
        <p className="text-xs text-[#64748B] mb-4">
          The five networks are nested filters of the same scan. Changing the network changes the values and partly the
          ranking of genomes.
        </p>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 overflow-x-auto">
          <Matrix
            title="Nesting of TF–operon pairs"
            subtitle="Share of the pairs of the row network that are also in the column network."
            cells={nestingCells}
            valueFmt={pct}
          />
          <Matrix
            title={`Ranking of genomes — ${info.label}`}
            subtitle="Spearman across atlas genomes with edges in both networks."
            cells={betweenCells}
            valueFmt={fmtRho}
          />
        </div>

      </Card>

      {/* 2b. Efecto del footprinting */}
      <Collapsible
        title="Effect of phylogenetic footprinting"
        subtitle={`validated vs no-footprint: same p-value and tier, only footprinting changes${
          footprint[0] ? ` (${fmtInt(footprint[0].genomes)} genomes with edges in both).` : "."
        }`}
        summary={footprintSummary}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[#64748B] border-b border-[#D9E2E7]">
                <th className="py-2 pr-3 font-medium">Metric</th>
                <th className="py-2 pr-3 font-medium text-right">Median validated</th>
                <th className="py-2 pr-3 font-medium text-right">Median no-footprint</th>
                <th className="py-2 pr-3 font-medium text-right">Median ratio</th>
                <th className="py-2 font-medium text-right">Spearman</th>
              </tr>
            </thead>
            <tbody>
              {METRICS.map((m) => {
                const f = footprint.find((x) => x.metric === m.key);
                if (!f) return null;
                return (
                  <tr key={m.key} className="border-b border-[#F0F4F8]">
                    <td className="py-1.5 pr-3 text-[#334155]">{m.label}</td>
                    <td className="py-1.5 pr-3 text-right font-mono text-[#334155]">{fmt(f.median_validated, m.digits)}</td>
                    <td className="py-1.5 pr-3 text-right font-mono text-[#334155]">{fmt(f.median_no_footprint, m.digits)}</td>
                    <td className="py-1.5 pr-3 text-right font-mono text-[#64748B]">{fmt(f.median_ratio, 2)}</td>
                    <td className="py-1.5 text-right font-mono text-[#64748B]">{fmtRho(f.spearman)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Collapsible>
    </div>
  );
}

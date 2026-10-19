import { useState, useEffect, useMemo } from "react";
import {
  ComposedChart, Bar, Line, ErrorBar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Loader2, Info } from "lucide-react";
import { api } from "../services/api";
import NetworkSelector from "../components/NetworkSelector";
import { DEFAULT_NETWORK, fmtInt, selectClass } from "../utils/atlas";
import { METRIC_LABELS } from "../utils/metrics";

// Comparación de las métricas propias entre taxones de GTDB (make comparison-atlas).
// Cada taxón se resume con los mismos genomas para la métrica propia y para network_metrics
// (externo), y la tabla de concordancia dice cuánto se parece la comparación propia a la externa.

const LEVELS = [
  { key: "phylum", label: "Phylum" },
  { key: "class", label: "Class" },
  { key: "order", label: "Order" },
  { key: "family", label: "Family" },
];

// Orden = de mayor a menor concordancia con network_metrics en la exploración (explore_comparison.py)
const METRICS = [
  { key: "n_edges", label: METRIC_LABELS.n_edges, digits: 0 },
  { key: "n_targets", label: METRIC_LABELS.n_targets, digits: 0 },
  { key: "n_tf", label: METRIC_LABELS.n_tf, digits: 0 },
  { key: "max_out_degree", label: METRIC_LABELS.max_out_degree, digits: 0 },
  { key: "n_components", label: METRIC_LABELS.n_components, digits: 0 },
  { key: "frac_largest", label: METRIC_LABELS.frac_largest, digits: 3 },
  { key: "mean_out_degree", label: METRIC_LABELS.mean_out_degree, digits: 2 },
  { key: "max_in_degree", label: METRIC_LABELS.max_in_degree, digits: 0 },
  { key: "mean_in_degree", label: METRIC_LABELS.mean_in_degree, digits: 2 },
  { key: "frac_multi_reg", label: METRIC_LABELS.frac_multi_reg, digits: 3 },
  { key: "density", label: METRIC_LABELS.density, digits: 4 },
];

const AGREEMENT = {
  high: { label: "High", cls: "bg-[#E8F5F0] text-[#2F7D63] border-[#BFE3D5]" },
  moderate: { label: "Moderate", cls: "bg-[#FFF7E6] text-[#9A5B00] border-[#F6D9A8]" },
  low: { label: "Low", cls: "bg-[#FEF0F0] text-[#B54848] border-[#F8BFBF]" },
  different_definition: { label: "Different definition", cls: "bg-[#F1F5F9] text-[#475569] border-[#D9E2E7]" },
  undefined: { label: "Not defined", cls: "bg-[#F1F5F9] text-[#64748B] border-[#D9E2E7]" },
};

// Paleta validada con dataviz/validate_palette.js (modo claro): propia = teal del proyecto, externa = ámbar.
const OWN_COLOR = "#3A9D7C";
const EXT_COLOR = "#D97706";
const MAX_CHART_TAXA = 25;

const metricInfo = (key) => METRICS.find((m) => m.key === key) ?? { key, label: key, digits: 2 };
const fmt = (v, digits) =>
  v == null ? "—" : digits === 0 ? fmtInt(Math.round(v * 10) / 10) : Number(v).toFixed(digits);
const fmtRho = (v) => (v == null ? "—" : v.toFixed(2));

function AgreementBadge({ value }) {
  const a = AGREEMENT[value] ?? AGREEMENT.undefined;
  return <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded border ${a.cls}`}>{a.label}</span>;
}

function TaxonTooltip({ active, payload, digits, showExternal }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white border border-[#D9E2E7] rounded-lg p-3 shadow-lg text-xs">
      <div className="font-semibold text-[#334155] mb-1">{d.taxon}</div>
      <div className="text-[#64748B] space-y-0.5">
        <div>Genomes: <span className="font-mono text-[#334155]">{fmtInt(d.genomes)}</span></div>
        <div>
          Own median: <span className="font-mono text-[#334155]">{fmt(d.median, digits)}</span>{" "}
          <span className="text-[#94A3B8]">(IQR {fmt(d.q1, digits)}–{fmt(d.q3, digits)})</span>
        </div>
        {showExternal && (
          <div>
            External median: <span className="font-mono text-[#334155]">{fmt(d.median_ext, digits)}</span>{" "}
            <span className="text-[#94A3B8]">(IQR {fmt(d.q1_ext, digits)}–{fmt(d.q3_ext, digits)})</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Comparison() {
  const [networks, setNetworks] = useState([]);
  const [networkId, setNetworkId] = useState(DEFAULT_NETWORK);
  const [level, setLevel] = useState("phylum");
  const [metric, setMetric] = useState("n_edges");
  const [showExternal, setShowExternal] = useState(true);

  const [taxa, setTaxa] = useState([]); // todas las métricas de la red y el nivel elegidos
  const [tests, setTests] = useState([]); // Kruskal-Wallis y concordancia por métrica
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // 1. Lista de redes
  useEffect(() => {
    api
      .getAtlasNetworks()
      .then((res) => setNetworks(res.data))
      .catch(() => setError("The network list could not be loaded. Check that the backend is running."));
  }, []);

  // 2. Distribución por taxón y pruebas de la red y el nivel elegidos (la métrica se filtra en el navegador)
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([api.getAtlasComparisonTaxa(networkId, level), api.getAtlasComparisonTests(networkId, level)])
      .then(([taxaRes, testsRes]) => {
        if (cancelled) return;
        setTaxa(taxaRes.data.rows ?? []);
        setTests(testsRes.data.rows ?? []);
      })
      .catch((err) => {
        if (cancelled) return;
        setTaxa([]);
        setTests([]);
        setError(
          err?.response?.data?.detail ??
            "Taxon comparison could not be loaded. Check that the backend is running and the results exist (make comparison-atlas)."
        );
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [networkId, level]);

  const info = metricInfo(metric);
  const test = tests.find((t) => t.metric === metric);
  const network = networks.find((n) => n.network_id === networkId);
  const levelLabel = LEVELS.find((l) => l.key === level)?.label ?? level;
  // density externa usa otra definición (todos los operones del genoma): no se dibuja en el mismo eje
  const externalComparable = test?.agreement !== "different_definition";
  const drawExternal = showExternal && externalComparable;

  const rows = useMemo(
    () => taxa.filter((r) => r.metric === metric).sort((a, b) => (b.median ?? 0) - (a.median ?? 0)),
    [taxa, metric]
  );
  // En orden y familia hay demasiados taxones para un gráfico: se dibujan los más poblados
  const chartRows = useMemo(() => {
    const top = rows.length > MAX_CHART_TAXA
      ? new Set([...rows].sort((a, b) => b.genomes - a.genomes).slice(0, MAX_CHART_TAXA).map((r) => r.taxon))
      : null;
    return rows
      .filter((r) => !top || top.has(r.taxon))
      .map((r) => ({ ...r, iqr: [r.median - r.q1, r.q3 - r.median] }));
  }, [rows]);

  const sortedTests = useMemo(
    () => METRICS.map((m) => tests.find((t) => t.metric === m.key)).filter(Boolean),
    [tests]
  );
  const comparable = sortedTests.filter((t) => t.agreement !== "different_definition");
  const nHigh = comparable.filter((t) => t.agreement === "high").length;
  const nSame = comparable.filter((t) => t.same_conclusion).length;

  return (
    <div className="space-y-6 max-w-[1100px]">
      <div>
        <h1 className="text-2xl font-semibold text-[#334155]">Taxon Comparison</h1>
        <p className="text-sm text-[#64748B] mt-1">
          How the own topological metrics vary across GTDB taxa, and how closely that comparison matches the external
          network_metrics table on the same genomes.
        </p>
      </div>

      {error && (
        <div className="bg-[#FEF0F0] border border-[#F8BFBF] text-[#D96C6C] text-sm rounded-lg px-4 py-2.5">
          {error}
        </div>
      )}

      {/* Controles */}
      <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-4 flex flex-wrap items-end gap-4">
        <NetworkSelector networks={networks} value={networkId} onChange={setNetworkId} />
        <div className="flex flex-col gap-1">
          <span className="text-xs text-[#64748B]">Taxonomic level (GTDB)</span>
          <div className="flex rounded-lg border border-[#D9E2E7] overflow-hidden">
            {LEVELS.map((l) => (
              <button
                key={l.key}
                onClick={() => setLevel(l.key)}
                className={`px-3 py-1.5 text-xs transition-colors ${
                  level === l.key ? "bg-[#3A9D7C] text-white" : "bg-white text-[#64748B] hover:bg-[#F7FAFC]"
                }`}
              >
                {l.label}
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
        <label className="flex items-center gap-2 text-xs text-[#64748B] pb-2">
          <input
            type="checkbox"
            checked={showExternal}
            onChange={(e) => setShowExternal(e.target.checked)}
            className="accent-[#D97706]"
          />
          Show external (network_metrics)
        </label>
      </div>

      {/* Resumen de concordancia */}
      {!loading && comparable.length > 0 && (
        <div className="bg-[#F0F7FB] border border-[#CFE3EF] rounded-lg px-4 py-3 text-xs text-[#334155] flex gap-2">
          <Info className="w-4 h-4 text-[#3B82B8] shrink-0 mt-0.5" />
          <div>
            In <span className="font-semibold">{network?.name ?? "this network"}</span> at {levelLabel.toLowerCase()} level,{" "}
            <span className="font-semibold">{nHigh} of {comparable.length}</span> comparable metrics rank the taxa almost
            as network_metrics does (Spearman ≥ 0.85 between taxon medians), and{" "}
            <span className="font-semibold">{nSame} of {comparable.length}</span> reach the same Kruskal–Wallis
            conclusion. Absolute values can differ (own edges are one per TF–operon pair), so the comparison is by rank.
            Taxa with at least 5 genomes; network_metrics is external and shown only as a reference.
            <div className="mt-1.5 text-[#64748B]">
              Caution: differences between taxa largely reflect the method, not only biology. In balanced, genome size
              plus the number of motifs that come from the same family, order or class explain 88% of the phylum effect
              on the number of TFs (scripts/explore_motif_origin.py).
            </div>
          </div>
        </div>
      )}

      {/* Gráfico por taxón */}
      <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-5 relative">
        {loading && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-10 rounded-xl">
            <Loader2 className="w-6 h-6 text-[#3A9D7C] animate-spin" />
          </div>
        )}
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <h3 className="text-sm font-semibold text-[#334155]">
              {info.label} by {levelLabel.toLowerCase()}
            </h3>
            <p className="text-xs text-[#64748B]">
              Bar: own median with interquartile range. {drawExternal && "Dot: external median on the same genomes. "}
              {rows.length > MAX_CHART_TAXA &&
                `Showing the ${MAX_CHART_TAXA} ${levelLabel.toLowerCase()} taxa with most genomes (all ${rows.length} are in the table below).`}
            </p>
            {showExternal && !externalComparable && (
              <p className="text-xs text-[#9A5B00] mt-1">
                External density uses a different definition (n_edges / (n_tf × all operons of the genome)), so it is
                not drawn on the same axis. See the table below.
              </p>
            )}
          </div>
          {test && (
            <div className="text-right shrink-0">
              <AgreementBadge value={test.agreement} />
              <div className="text-[11px] text-[#64748B] mt-1">
                ρ taxon medians <span className="font-mono text-[#334155]">{fmtRho(test.spearman_taxon_medians)}</span>
              </div>
            </div>
          )}
        </div>
        {chartRows.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(220, chartRows.length * 26 + 60)}>
            <ComposedChart data={chartRows} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
              <CartesianGrid strokeDasharray="2 2" stroke="#F0F4F8" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fontSize: 11, fill: "#64748B" }}
                tickFormatter={(v) => fmt(v, info.digits)}
                stroke="#D9E2E7"
              />
              <YAxis type="category" dataKey="taxon" width={170} tick={{ fontSize: 11, fill: "#334155" }} stroke="#D9E2E7" />
              <Tooltip
                content={<TaxonTooltip digits={info.digits} showExternal={drawExternal} />}
                cursor={{ fill: "#F7FAFC" }}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: "#64748B" }} />
              <Bar dataKey="median" name="Own median (IQR)" fill={OWN_COLOR} barSize={12} radius={[0, 4, 4, 0]}>
                <ErrorBar dataKey="iqr" direction="x" width={4} strokeWidth={1.5} stroke="#334155" />
              </Bar>
              {drawExternal && (
                <Line
                  dataKey="median_ext"
                  name="External median"
                  stroke="none"
                  legendType="circle"
                  isAnimationActive={false}
                  dot={{ r: 5, fill: EXT_COLOR, stroke: "#FFFFFF", strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: EXT_COLOR, stroke: "#FFFFFF", strokeWidth: 2 }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          !loading && <div className="text-sm text-[#94A3B8] py-10 text-center">No taxa with at least 5 genomes.</div>
        )}
      </div>

      {/* Concordancia por métrica */}
      <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-5">
        <h3 className="text-sm font-semibold text-[#334155] mb-1">Agreement with network_metrics</h3>
        <p className="text-xs text-[#64748B] mb-3">
          Per metric, at {levelLabel.toLowerCase()} level: Spearman correlation between own and external taxon medians,
          effect size of the taxon (Kruskal–Wallis ε²) with each source, and whether both give the same test result
          (p &lt; 0.05). Click a row to plot that metric.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[#64748B] border-b border-[#D9E2E7]">
                <th className="py-2 pr-3 font-medium">Metric</th>
                <th className="py-2 pr-3 font-medium">Agreement</th>
                <th className="py-2 pr-3 font-medium text-right">ρ taxon medians</th>
                <th className="py-2 pr-3 font-medium text-right">ρ genomes</th>
                <th className="py-2 pr-3 font-medium text-right">ε² own</th>
                <th className="py-2 pr-3 font-medium text-right">ε² external</th>
                <th className="py-2 pr-3 font-medium">Same test result</th>
                <th className="py-2 font-medium text-right">Taxa / genomes</th>
              </tr>
            </thead>
            <tbody>
              {sortedTests.map((t) => (
                <tr
                  key={t.metric}
                  onClick={() => setMetric(t.metric)}
                  className={`border-b border-[#F0F4F8] cursor-pointer hover:bg-[#F7FAFC] ${
                    t.metric === metric ? "bg-[#F0F7F4]" : ""
                  }`}
                >
                  <td className="py-1.5 pr-3 text-[#334155]">{metricInfo(t.metric).label}</td>
                  <td className="py-1.5 pr-3"><AgreementBadge value={t.agreement} /></td>
                  <td className="py-1.5 pr-3 text-right font-mono text-[#334155]">{fmtRho(t.spearman_taxon_medians)}</td>
                  <td className="py-1.5 pr-3 text-right font-mono text-[#64748B]">{fmtRho(t.spearman_genomes)}</td>
                  <td className="py-1.5 pr-3 text-right font-mono text-[#334155]">{fmt(t.eps2, 3)}</td>
                  <td className="py-1.5 pr-3 text-right font-mono text-[#64748B]">{fmt(t.eps2_ext, 3)}</td>
                  <td className="py-1.5 pr-3 text-[#334155]">
                    {t.same_conclusion == null ? "—" : t.same_conclusion ? "Yes" : "No"}
                  </td>
                  <td className="py-1.5 text-right font-mono text-[#64748B]">
                    {fmtInt(t.taxa)} / {fmtInt(t.genomes)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tabla por taxón */}
      <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-5">
        <h3 className="text-sm font-semibold text-[#334155] mb-1">
          {info.label}: all {levelLabel.toLowerCase()} taxa ({rows.length})
        </h3>
        <p className="text-xs text-[#64748B] mb-3">
          Genomes = atlas genomes with edges and a row in network_metrics (used for both sources). With edges = all atlas
          genomes of the taxon with edges in this network.
        </p>
        <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white">
              <tr className="text-left text-[#64748B] border-b border-[#D9E2E7]">
                <th className="py-2 pr-3 font-medium">Taxon</th>
                <th className="py-2 pr-3 font-medium text-right">Genomes</th>
                <th className="py-2 pr-3 font-medium text-right">With edges</th>
                <th className="py-2 pr-3 font-medium text-right">Own median</th>
                <th className="py-2 pr-3 font-medium text-right">Own IQR</th>
                <th className="py-2 pr-3 font-medium text-right">External median</th>
                <th className="py-2 font-medium text-right">Own / external</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.taxon} className="border-b border-[#F0F4F8]">
                  <td className="py-1.5 pr-3 text-[#334155]">{r.taxon}</td>
                  <td className="py-1.5 pr-3 text-right font-mono text-[#334155]">{fmtInt(r.genomes)}</td>
                  <td className="py-1.5 pr-3 text-right font-mono text-[#64748B]">{fmtInt(r.genomes_with_edges)}</td>
                  <td className="py-1.5 pr-3 text-right font-mono text-[#334155]">{fmt(r.median, info.digits)}</td>
                  <td className="py-1.5 pr-3 text-right font-mono text-[#64748B]">
                    {fmt(r.q1, info.digits)}–{fmt(r.q3, info.digits)}
                  </td>
                  <td className="py-1.5 pr-3 text-right font-mono text-[#64748B]">
                    {fmt(r.median_ext, metric === "density" ? 5 : info.digits)}
                  </td>
                  <td className="py-1.5 text-right font-mono text-[#64748B]">
                    {r.median_ext ? (r.median / r.median_ext).toFixed(2) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

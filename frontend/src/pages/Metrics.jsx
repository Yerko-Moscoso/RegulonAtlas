import { useState, useEffect, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Loader2, Info, ArrowUp, ArrowDown } from "lucide-react";
import { api } from "../services/api";
import { clickable, FOCUS_RING } from "../utils/a11y";
import NetworkSelector from "../components/NetworkSelector";
import CoverageNote from "../components/CoverageNote";
import OrganismSearch from "../components/OrganismSearch";
import { DEFAULT_NETWORK, DEFAULT_GENOME, fmtInt, networkFilters, selectClass } from "../utils/atlas";
import { METRIC_LABELS } from "../utils/metrics";

// Métricas topológicas propias de las redes del atlas (make metrics-atlas,
// endpoint /atlas/metrics). Se calculan con NetworkX sobre el grafo dirigido
// TF -> operón de cada genoma y reemplazan a la tabla externa network_metrics,
// que no se reproduce desde `edges`. La comparación con la tabla externa se
// muestra como referencia (correlación de rangos por red).

const fmtDec = (digits) => (v) => (v == null ? "—" : Number(v).toFixed(digits));
const fmtPct = (v) => (v == null ? "—" : `${(Number(v) * 100).toFixed(1)}%`);

const COLOR = { green: "#3A9D7C", blue: "#3B82B8", highlight: "#E9B949" };

// Tarjetas principales
const MAIN_METRICS = [
  { key: "n_tf", label: METRIC_LABELS.n_tf, fmt: fmtInt, color: "text-[#3A9D7C]" },
  { key: "n_targets", label: METRIC_LABELS.n_targets, fmt: fmtInt, color: "text-[#3B82B8]" },
  { key: "n_edges", label: METRIC_LABELS.n_edges, fmt: fmtInt, color: "text-[#55B8A5]" },
  { key: "density", label: METRIC_LABELS.density, fmt: fmtDec(4), color: "text-[#3A9D7C]" },
  { key: "mean_out_degree", label: METRIC_LABELS.mean_out_degree, fmt: fmtDec(2), color: "text-[#3B82B8]" },
];

// Resto de las métricas, en un panel compacto
const DETAIL_METRICS = [
  { key: "max_out_degree", label: METRIC_LABELS.max_out_degree, fmt: fmtInt, hint: "Target operons of the most connected TF" },
  { key: "mean_in_degree", label: METRIC_LABELS.mean_in_degree, fmt: fmtDec(2), hint: "Average number of TFs per target operon" },
  { key: "max_in_degree", label: METRIC_LABELS.max_in_degree, fmt: fmtInt, hint: "TFs of the most regulated operon" },
  { key: "frac_multi_reg", label: METRIC_LABELS.frac_multi_reg, fmt: fmtPct, hint: "Operons regulated by two or more TFs" },
  { key: "n_target_genes", label: METRIC_LABELS.n_target_genes, fmt: fmtInt, hint: "Genes in the target operons" },
  { key: "frac_genome_targeted", label: METRIC_LABELS.frac_genome_targeted, fmt: fmtPct, hint: "Share of the genome's genes in target operons" },
  {
    key: "out_degree_gini",
    label: METRIC_LABELS.out_degree_gini,
    fmt: fmtDec(2),
    hint: "0: every TF regulates the same number of operons; close to 1: a few TFs regulate most of them",
  },
  { key: "hub_share", label: METRIC_LABELS.hub_share, fmt: fmtPct, hint: "Share of the edges that come from the most connected TF" },
  { key: "n_components", label: METRIC_LABELS.n_components, fmt: fmtInt, hint: "Weakly connected components" },
  { key: "frac_largest", label: METRIC_LABELS.frac_largest, fmt: fmtPct, hint: "Share of the nodes in the largest component" },
];

// Métricas que necesitan ubicar el gen de cada TF por nombre: solo cota inferior
const LOWER_BOUND_METRICS = [
  { key: "tf_resolved_rate", label: METRIC_LABELS.tf_resolved_rate, fmt: fmtPct },
  { key: "n_autoreg", label: METRIC_LABELS.n_autoreg, fmt: fmtInt },
  { key: "n_tf_tf_edges", label: METRIC_LABELS.n_tf_tf_edges, fmt: fmtInt },
];

// Métricas que se pueden graficar. Los conteos tienen colas largas, así que van en
// intervalos logarítmicos; las fracciones y promedios en intervalos lineales.
const CHART_METRICS = [
  { key: "n_edges", label: METRIC_LABELS.n_edges, scale: "log", fmt: fmtInt },
  { key: "n_tf", label: METRIC_LABELS.n_tf, scale: "log", fmt: fmtInt },
  { key: "n_targets", label: METRIC_LABELS.n_targets, scale: "log", fmt: fmtInt },
  { key: "edges_per_tf", label: METRIC_LABELS.edges_per_tf, scale: "linear", fmt: fmtDec(2) },
  { key: "density", label: METRIC_LABELS.density, scale: "linear", fmt: fmtDec(4) },
  { key: "frac_multi_reg", label: METRIC_LABELS.frac_multi_reg, scale: "linear", fmt: fmtPct },
  { key: "out_degree_gini", label: METRIC_LABELS.out_degree_gini, scale: "linear", fmt: fmtDec(2) },
  { key: "frac_genome_targeted", label: METRIC_LABELS.frac_genome_targeted, scale: "linear", fmt: fmtPct },
  { key: "frac_largest", label: METRIC_LABELS.frac_largest, scale: "linear", fmt: fmtPct },
];

const TABLE_COLUMNS = [
  { key: "n_tf", label: METRIC_LABELS.n_tf, fmt: fmtInt },
  { key: "n_targets", label: METRIC_LABELS.n_targets, fmt: fmtInt },
  { key: "n_edges", label: METRIC_LABELS.n_edges, fmt: fmtInt },
  { key: "density", label: METRIC_LABELS.density, fmt: fmtDec(4) },
  { key: "mean_out_degree", label: METRIC_LABELS.mean_out_degree, fmt: fmtDec(2) },
  { key: "frac_multi_reg", label: METRIC_LABELS.frac_multi_reg, fmt: fmtPct },
  { key: "out_degree_gini", label: METRIC_LABELS.out_degree_gini, fmt: fmtDec(2) },
  { key: "frac_largest", label: METRIC_LABELS.frac_largest, fmt: fmtPct },
];

const EXTERNAL_LABELS = { n_tf: "TFs", n_targets: "targets", n_edges: "edges", density: "density" };

const LOG_BOUNDS = [0, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, Infinity];
const LINEAR_BINS = 20;
const FAMILY_CHART_MAX = 30;

// Histograma de una métrica sobre los genomas del atlas. Marca el intervalo
// donde cae el genoma elegido.
function buildHistogram(values, metric, selectedValue) {
  const vals = values.filter((v) => v != null);
  if (vals.length === 0) return [];
  let bins;

  if (metric.scale === "log") {
    bins = LOG_BOUNDS.slice(0, -1).map((lo, i) => {
      const hi = LOG_BOUNDS[i + 1];
      const bin =
        hi === Infinity ? `≥ ${fmtInt(lo)}` : hi - lo === 1 ? fmtInt(lo) : `${fmtInt(lo)}–${fmtInt(hi - 1)}`;
      return { bin, lo, hi, range: bin, count: 0 };
    });
    vals.forEach((v) => {
      const b = bins.find((x) => v >= x.lo && v < x.hi);
      if (b) b.count += 1;
    });
    // Se quitan los intervalos vacíos de los extremos
    const first = bins.findIndex((b) => b.count > 0);
    const last = bins.length - 1 - [...bins].reverse().findIndex((b) => b.count > 0);
    bins = bins.slice(first, last + 1);
    bins.forEach((b) => {
      b.selected = selectedValue != null && selectedValue >= b.lo && selectedValue < b.hi;
    });
  } else {
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const n = min === max ? 1 : LINEAR_BINS;
    const width = (max - min) / n || 1;
    bins = Array.from({ length: n }, (_, i) => {
      const lo = min + i * width;
      const hi = i === n - 1 ? max : lo + width;
      return { bin: metric.fmt(lo), lo, hi, range: `${metric.fmt(lo)} – ${metric.fmt(hi)}`, count: 0 };
    });
    const indexOf = (v) => Math.max(0, Math.min(n - 1, Math.floor((v - min) / width)));
    vals.forEach((v) => {
      bins[indexOf(v)].count += 1;
    });
    if (selectedValue != null) bins[indexOf(selectedValue)].selected = true;
  }
  return bins;
}

// "Escherichia coli str. K-12 substr. MG1655" -> "Escherichia coli"
const shortName = (name = "") => name.split(" ").slice(0, 2).join(" ");

const median = (values) => {
  const s = values.filter((v) => v != null).sort((a, b) => a - b);
  if (s.length === 0) return null;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

function Spinner() {
  return (
    <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-10 rounded-xl">
      <Loader2 className="w-6 h-6 text-[#3A9D7C] animate-spin" />
    </div>
  );
}

function SortIcon({ active, dir }) {
  if (!active) return null;
  return dir === "asc" ? <ArrowUp size={11} className="inline ml-0.5" /> : <ArrowDown size={11} className="inline ml-0.5" />;
}

export default function Metrics({ initialOrganism }) {
  const [networks, setNetworks] = useState([]);
  const [networkId, setNetworkId] = useState(DEFAULT_NETWORK);

  const [all, setAll] = useState([]); // los 2.644 genomas con sus métricas propias (has_edges=false si no tienen aristas)
  const [external, setExternal] = useState([]); // concordancia con network_metrics (por métrica)
  const [organism, setOrganism] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [chartKey, setChartKey] = useState("n_edges");
  const [sort, setSort] = useState({ key: "n_edges", dir: "desc" });

  // 1. Lista de redes
  useEffect(() => {
    api
      .getAtlasNetworks()
      .then((res) => setNetworks(res.data))
      .catch(() => setError("The network list could not be loaded. Check that the backend is running."));
  }, []);

  // 2. Métricas de la red elegida (una llamada) y su concordancia con la tabla externa.
  //    El genoma elegido, los gráficos y la tabla se resuelven en el navegador.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    api
      .getAtlasOwnMetrics(networkId)
      .then((res) => {
        if (cancelled) return;
        const list = res.data.rows ?? [];
        setAll(list);
        // Se conserva el organismo al cambiar de red; en la primera carga se usa
        // initialOrganism o E. coli K-12.
        setOrganism((prev) => {
          if (prev && list.some((g) => g.accession === prev)) return prev;
          const start = [initialOrganism, DEFAULT_GENOME].find((id) => list.some((g) => g.accession === id));
          return start ?? list[0]?.accession ?? "";
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err?.response?.data?.detail ??
            "Network metrics could not be loaded. Check that the backend is running and the metrics exist (make metrics-atlas)."
        );
      })
      .finally(() => !cancelled && setLoading(false));
    // La concordancia es opcional: si falla, la vista funciona igual
    api
      .getAtlasMetricsVsExternal(networkId)
      .then((res) => !cancelled && setExternal(res.data.rows ?? []))
      .catch(() => !cancelled && setExternal([]));
    return () => {
      cancelled = true;
    };
  }, [networkId, initialOrganism]);

  const byAcc = useMemo(() => new Map(all.map((r) => [r.accession, r])), [all]);
  const rows = useMemo(() => all.filter((r) => r.has_edges), [all]); // genomas con aristas
  const atlasRows = useMemo(() => rows.filter((r) => r.in_atlas), [rows]);
  const network = networks.find((n) => n.network_id === networkId);
  const filters = networkFilters(network);
  const genome = byAcc.get(organism);
  const current = genome?.has_edges ? genome : null;
  const chartMetric = CHART_METRICS.find((m) => m.key === chartKey);

  // Opciones del buscador: en gris los genomas sin aristas en la red elegida
  const options = useMemo(
    () =>
      all.map((g) => ({
        id: g.accession,
        label: g.ncbi_organism || g.accession,
        muted: !g.has_edges,
        meta: `${g.has_edges ? `${fmtInt(g.n_tf)} TFs, ${fmtInt(g.n_edges)} edges` : "no edges"}${
          g.in_atlas ? "" : ", auxiliary"
        }`,
      })),
    [all]
  );

  const missingReason = () => {
    if (!genome) return "";
    const name = genome.ncbi_organism || genome.accession;
    return `${name} has no edges in the ${
      network?.name ?? "selected"
    } network, so it has no metrics. Choose a less strict network, such as permissive.`;
  };

  // Concordancia con network_metrics, en una frase
  const externalSummary = useMemo(() => {
    const counts = external.filter((r) => r.metric !== "density" && r.spearman != null);
    if (counts.length === 0) return null;
    const n = Math.max(...external.map((r) => r.genomes_compared ?? 0));
    const parts = counts.map((r) => `${EXTERNAL_LABELS[r.metric] ?? r.metric} ρ = ${Number(r.spearman).toFixed(2)}`);
    const density = external.find((r) => r.metric === "density");
    return { n, parts, density };
  }, [external]);

  // Gráfico 1: distribución de la métrica en los genomas del atlas
  const histogram = useMemo(
    () => buildHistogram(atlasRows.map((r) => r[chartKey]), chartMetric, current?.[chartKey]),
    [atlasRows, chartKey, chartMetric, current]
  );
  const selectedBin = histogram.find((b) => b.selected);

  // Gráfico 2 y tabla: genomas con aristas de la misma familia GTDB
  const family = genome?.gtdb_family;
  const familyAll = useMemo(() => (family ? rows.filter((r) => r.gtdb_family === family) : []), [rows, family]);

  const familyChart = useMemo(() => {
    const sorted = [...familyAll].sort((a, b) => (b[chartKey] ?? -Infinity) - (a[chartKey] ?? -Infinity));
    let top = sorted.slice(0, FAMILY_CHART_MAX);
    // El genoma elegido siempre aparece, aunque quede fuera del top
    if (current && !top.some((r) => r.accession === current.accession)) top = [...top.slice(0, -1), current];
    return top.map((r) => ({
      accession: r.accession,
      name: shortName(r.ncbi_organism),
      fullName: r.ncbi_organism,
      value: r[chartKey],
      selected: r.accession === organism,
    }));
  }, [familyAll, chartKey, current, organism]);

  const familyRows = useMemo(() => {
    const { key, dir } = sort;
    const sign = dir === "asc" ? 1 : -1;
    return [...familyAll].sort((a, b) =>
      key === "ncbi_organism"
        ? sign * (a.ncbi_organism ?? "").localeCompare(b.ncbi_organism ?? "")
        : sign * ((a[key] ?? -Infinity) - (b[key] ?? -Infinity))
    );
  }, [familyAll, sort]);

  const familyStats = useMemo(
    () =>
      Object.fromEntries(
        TABLE_COLUMNS.map((c) => {
          const values = familyRows.map((r) => r[c.key]);
          return [c.key, { max: Math.max(...values.map((v) => v ?? -Infinity)), median: median(values) }];
        })
      ),
    [familyRows]
  );

  const toggleSort = (key) =>
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "ncbi_organism" ? "asc" : "desc" }
    );

  return (
    <div className="space-y-5 max-w-[1100px]">
      <div>
        <h1 className="text-2xl font-semibold text-[#334155]">Topological Metrics</h1>
        <p className="text-sm text-[#64748B] mt-1">
          Architecture of each predicted regulatory network (transcription factor → target operon) in the
          RegulonAtlas database.
        </p>
      </div>

      <CoverageNote networkId={networkId} />

      {error && (
        <div className="bg-[#FEF0F0] border border-[#F8BFBF] text-[#D96C6C] text-sm rounded-lg px-4 py-2.5">{error}</div>
      )}

      {/* Controles */}
      <div className="bg-white border border-[#D9E2E7] rounded-xl p-3 flex flex-wrap items-end gap-4 shadow-sm">
        <NetworkSelector networks={networks} value={networkId} onChange={setNetworkId} />

        <div className="flex flex-col gap-1">
          <span className="text-xs text-[#64748B]">
            {loading && all.length === 0
              ? "Organism (Loading genomes…)"
              : `Organism (${fmtInt(rows.length)} of ${fmtInt(all.length)} genomes have edges in this network)`}
          </span>
          <OrganismSearch options={options} value={organism} onChange={setOrganism} disabled={loading && all.length === 0} />
        </div>

        <div className="ml-auto text-xs text-[#64748B] text-right">
          {genome && (
            <div>
              {genome.gtdb_phylum}, {genome.gtdb_family}. {fmtInt(genome.n_genes)} genes in the genome.
              {!genome.in_atlas && <span className="text-[#94A3B8]"> Auxiliary genome ({genome.selection}).</span>}
            </div>
          )}
          {filters && <div className="text-[11px] mt-0.5 text-[#94A3B8]">Network filters: {filters}</div>}
        </div>
      </div>

      {/* Definición y concordancia con la tabla externa */}
      <div className="flex gap-2.5 items-start bg-[#F7FAFC] border border-[#D9E2E7] rounded-lg px-4 py-2.5">
        <Info size={15} className="text-[#64748B] shrink-0 mt-0.5" />
        <div className="text-[12px] text-[#64748B] space-y-1">
          <p>
            Metrics are computed by RegulonAtlas with NetworkX from the network edges: one node per transcription factor
            (normalized name) and per target operon, and one edge per TF–operon pair. They replace the metrics reported
            by the external pipeline, which cannot be reproduced from the edges.
          </p>
          {externalSummary && (
            <p className="text-[11px] text-[#94A3B8]">
              Agreement with the external table in this network ({fmtInt(externalSummary.n)} genomes, Spearman rank
              correlation): {externalSummary.parts.join(", ")}. Values differ in scale but rank genomes the same way.
              {externalSummary.density &&
                ` Density is defined differently (ρ = ${Number(externalSummary.density.spearman).toFixed(2)}) and is not comparable.`}
            </p>
          )}
        </div>
      </div>

      {/* Tarjetas del genoma elegido */}
      {!loading && genome && !current ? (
        <div className="bg-white border border-dashed border-[#D9E2E7] rounded-xl px-6 py-8 text-center">
          <p className="text-sm text-[#64748B] max-w-xl mx-auto">{missingReason()}</p>
        </div>
      ) : (
        <>
          <div className="relative grid grid-cols-5 gap-3">
            {loading && <Spinner />}
            {MAIN_METRICS.map((m) => (
              <div key={m.key} className="bg-white rounded-xl border border-[#D9E2E7] p-4 shadow-sm">
                <div className={`text-xl font-bold font-mono ${m.color}`}>{m.fmt(current?.[m.key])}</div>
                <div className="text-[11px] text-[#64748B] mt-1">{m.label}</div>
              </div>
            ))}
          </div>

          <div className="relative bg-white rounded-xl border border-[#D9E2E7] shadow-sm px-5 py-4">
            {loading && <Spinner />}
            <dl className="grid grid-cols-3 gap-x-8 gap-y-2.5">
              {DETAIL_METRICS.map((m) => (
                <div key={m.key} className="flex items-baseline justify-between gap-3">
                  <dt className="text-[12px] text-[#64748B] cursor-help" title={m.hint}>
                    {m.label}
                  </dt>
                  <dd className="font-mono text-[13px] font-semibold text-[#334155]">{m.fmt(current?.[m.key])}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 pt-3 border-t border-[#F0F4F8]">
              <p className="text-[11px] text-[#94A3B8] mb-2">
                Lower bound: TF → TF edges need the gene of each TF, which can only be located by gene name. This works
                for a minority of TFs (median about 18% in balanced), so these values are not comparable between genomes.
              </p>
              <dl className="grid grid-cols-3 gap-x-8 gap-y-2.5">
                {LOWER_BOUND_METRICS.map((m) => (
                  <div key={m.key} className="flex items-baseline justify-between gap-3">
                    <dt className="text-[12px] text-[#94A3B8]">{m.label}</dt>
                    <dd className="font-mono text-[13px] text-[#64748B]">{m.fmt(current?.[m.key])}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </>
      )}

      {/* Métrica de los gráficos */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-[#64748B]">Charts show</span>
        <select aria-label="Metric shown in the charts" value={chartKey} onChange={(e) => setChartKey(e.target.value)} className={selectClass}>
          {CHART_METRICS.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-5">
        {/* Distribución en el atlas */}
        <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-5 relative">
          {loading && <Spinner />}
          <h3 className="text-sm font-semibold text-[#334155] mb-1">Distribution across the atlas</h3>
          <p className="text-xs text-[#64748B] mb-4">
            {fmtInt(atlasRows.length)} atlas genomes with edges in the {network?.name ?? "selected"} network, by{" "}
            {chartMetric.label.toLowerCase()}
            {chartMetric.scale === "log" ? " (logarithmic intervals)" : ""}.{" "}
            {selectedBin ? "The highlighted bar contains the selected organism." : ""}
          </p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={histogram} margin={{ top: 0, right: 4, bottom: 10, left: -6 }}>
              <CartesianGrid strokeDasharray="2 2" stroke="#F0F4F8" vertical={false} />
              <XAxis
                dataKey="bin"
                interval={0}
                tick={{ fontSize: 9, fill: "#64748B" }}
                angle={-40}
                textAnchor="end"
                height={50}
              />
              <YAxis tick={{ fontSize: 10, fill: "#64748B" }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ fontSize: 11, borderColor: "#D9E2E7", borderRadius: 8 }}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.range ?? ""}
                formatter={(v) => [fmtInt(v), "Genomes"]}
              />
              <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                {histogram.map((b) => (
                  <Cell key={b.bin} fill={b.selected ? COLOR.highlight : COLOR.green} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Ranking en la familia */}
        <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-5 relative">
          {loading && <Spinner />}
          <h3 className="text-sm font-semibold text-[#334155] mb-1">Ranking within {family ?? "the family"}</h3>
          <p className="text-xs text-[#64748B] mb-4">
            {familyAll.length > FAMILY_CHART_MAX
              ? `Top ${FAMILY_CHART_MAX} of ${fmtInt(familyAll.length)} genomes`
              : `${fmtInt(familyAll.length)} genome${familyAll.length === 1 ? "" : "s"}`}{" "}
            of this GTDB family by {chartMetric.label.toLowerCase()}. Click a bar to select it.
          </p>
          {familyChart.length === 0 ? (
            <p className="text-sm text-[#94A3B8] py-16 text-center">No genome of this family has edges in this network.</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(220, familyChart.length * 20)}>
              <BarChart data={familyChart} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 4 }}>
                <CartesianGrid strokeDasharray="2 2" stroke="#F0F4F8" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: "#64748B" }} tickFormatter={(v) => chartMetric.fmt(v)} />
                <YAxis
                  dataKey="name"
                  type="category"
                  interval={0}
                  tick={{ fontSize: 10, fill: "#334155", fontStyle: "italic" }}
                  width={130}
                />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderColor: "#D9E2E7", borderRadius: 8 }}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ?? ""}
                  formatter={(v) => [chartMetric.fmt(v), chartMetric.label]}
                />
                <Bar
                  dataKey="value"
                  radius={[0, 3, 3, 0]}
                  cursor="pointer"
                  onClick={(entry) => {
                    const acc = entry?.accession ?? entry?.payload?.accession;
                    if (acc) setOrganism(acc);
                  }}
                >
                  {familyChart.map((d) => (
                    <Cell key={d.accession} fill={d.selected ? COLOR.highlight : COLOR.blue} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Tabla comparativa dentro de la familia GTDB */}
      {!loading && family && familyRows.length > 0 && (
        <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-5">
          <h3 className="text-sm font-semibold text-[#334155] mb-1">Comparison within {family}</h3>
          <p className="text-xs text-[#64748B] mb-4">
            Bold marks the highest value and the last row is the family median. "aux" marks auxiliary genomes outside the
            2,224-genome atlas. Click a column to sort and a row to select it.
          </p>
          <div className="max-h-[420px] overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-[#D9E2E7]">
                  <th
                    {...clickable(() => toggleSort("ncbi_organism"))}
                    aria-sort={sort.key === "ncbi_organism" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                    className={`text-left text-[11px] font-medium text-[#64748B] pb-2 cursor-pointer select-none ${FOCUS_RING}`}
                  >
                    Organism
                    <SortIcon active={sort.key === "ncbi_organism"} dir={sort.dir} />
                  </th>
                  {TABLE_COLUMNS.map((c) => (
                    <th
                      key={c.key}
                      {...clickable(() => toggleSort(c.key))}
                      aria-sort={sort.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                      className={`text-right text-[11px] font-medium text-[#64748B] pb-2 pl-3 cursor-pointer select-none whitespace-nowrap ${FOCUS_RING}`}
                    >
                      {c.label}
                      <SortIcon active={sort.key === c.key} dir={sort.dir} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {familyRows.map((r) => (
                  <tr
                    key={r.accession}
                    {...clickable(() => setOrganism(r.accession))}
                    className={`border-b border-[#F7FAFC] cursor-pointer transition-colors ${FOCUS_RING} ${
                      r.accession === organism ? "bg-[#E8F5F0]" : "hover:bg-[#F7FAFC]"
                    }`}
                  >
                    <td className="py-2 text-[12px] text-[#334155] italic">
                      {r.ncbi_organism}
                      {!r.in_atlas && <span className="ml-1 not-italic text-[10px] text-[#94A3B8]">aux</span>}
                    </td>
                    {TABLE_COLUMNS.map((c) => (
                      <td
                        key={c.key}
                        className={`py-2 pl-3 text-right font-mono text-[12px] text-[#334155] ${
                          familyRows.length > 1 && r[c.key] === familyStats[c.key].max ? "font-bold" : ""
                        }`}
                      >
                        {c.fmt(r[c.key])}
                      </td>
                    ))}
                  </tr>
                ))}
                {familyRows.length > 1 && (
                  <tr className="border-t border-[#D9E2E7]">
                    <td className="py-2 text-[12px] text-[#64748B]">Family median</td>
                    {TABLE_COLUMNS.map((c) => (
                      <td key={c.key} className="py-2 pl-3 text-right font-mono text-[12px] text-[#64748B]">
                        {c.fmt(familyStats[c.key].median)}
                      </td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
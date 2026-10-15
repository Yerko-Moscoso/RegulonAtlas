import { useState, useEffect, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Loader2, Info, ArrowUp, ArrowDown } from "lucide-react";
import { api } from "../services/api";
import NetworkSelector from "../components/NetworkSelector";
import OrganismSearch from "../components/OrganismSearch";
import {
  DEFAULT_NETWORK,
  DEFAULT_GENOME,
  ATLAS_SELECTIONS,
  fmtInt,
  parseBenchmark,
  selectClass,
} from "../utils/atlas";

// Métricas topológicas de las redes reales del atlas, tal como las reporta la
// tabla network_metrics del pipeline externo. No se reproducen desde `edges`
// (diagnóstico semana 9), por eso la vista lo declara de forma visible.
// network_metrics trae una fila por genoma: los gráficos comparan genomas entre
// sí (distribución en el atlas y ranking en la familia), no grados por nodo.

const fmtDec = (digits) => (v) => (v == null ? "—" : Number(v).toFixed(digits));
const fmtPct = (v) => (v == null ? "—" : `${(Number(v) * 100).toFixed(1)}%`);

const COLOR = { green: "#3A9D7C", blue: "#3B82B8", highlight: "#E9B949" };

// Tarjetas principales (mismo formato que el MVP)
const MAIN_METRICS = [
  { key: "n_tf", label: "Transcription factors", fmt: fmtInt, color: "text-[#3A9D7C]" },
  { key: "n_targets", label: "Targets", fmt: fmtInt, color: "text-[#3B82B8]" },
  { key: "n_edges", label: "Edges", fmt: fmtInt, color: "text-[#55B8A5]" },
  { key: "density", label: "Density", fmt: fmtDec(4), color: "text-[#3A9D7C]" },
  { key: "mean_out_deg", label: "Average out-degree", fmt: fmtDec(2), color: "text-[#3B82B8]" },
];

// Resto de network_metrics, en un panel compacto
const DETAIL_METRICS = [
  { key: "max_out_deg", label: "Max out-degree", fmt: fmtInt, hint: "Targets of the most connected TF" },
  { key: "mean_in_deg", label: "Average in-degree", fmt: fmtDec(2), hint: "Average number of regulators per target" },
  { key: "max_in_deg", label: "Max in-degree", fmt: fmtInt, hint: "Regulators of the most regulated target" },
  { key: "frac_multi_reg", label: "Multi-regulated targets", fmt: fmtPct },
  { key: "n_autoreg", label: "Autoregulations", fmt: fmtInt },
  { key: "n_ffl", label: "Feed-forward loops", fmt: fmtInt },
  { key: "n_cascade", label: "Cascades", fmt: fmtInt },
  { key: "n_components", label: "Connected components", fmt: fmtInt },
  { key: "frac_largest", label: "Largest component", fmt: fmtPct },
];

// Métricas que se pueden graficar. Los conteos tienen colas largas (de 1 a miles
// de aristas), así que van en intervalos logarítmicos; las fracciones y promedios
// en intervalos lineales.
const CHART_METRICS = [
  { key: "n_edges", label: "Edges", scale: "log", fmt: fmtInt },
  { key: "n_tf", label: "Transcription factors", scale: "log", fmt: fmtInt },
  { key: "n_targets", label: "Targets", scale: "log", fmt: fmtInt },
  { key: "n_ffl", label: "Feed-forward loops", scale: "log", fmt: fmtInt },
  { key: "mean_out_deg", label: "Average out-degree", scale: "linear", fmt: fmtDec(2) },
  { key: "density", label: "Density", scale: "linear", fmt: fmtDec(4) },
  { key: "frac_multi_reg", label: "Multi-regulated targets", scale: "linear", fmt: fmtPct },
  { key: "frac_largest", label: "Largest component", scale: "linear", fmt: fmtPct },
];

const TABLE_COLUMNS = [
  { key: "n_tf", label: "TFs", fmt: fmtInt },
  { key: "n_targets", label: "Targets", fmt: fmtInt },
  { key: "n_edges", label: "Edges", fmt: fmtInt },
  { key: "density", label: "Density", fmt: fmtDec(4) },
  { key: "mean_out_deg", label: "Avg. out-deg.", fmt: fmtDec(2) },
  { key: "n_ffl", label: "FFLs", fmt: fmtInt },
  { key: "frac_largest", label: "Largest comp.", fmt: fmtPct },
];

const LOG_BOUNDS = [0, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, Infinity];
const LINEAR_BINS = 20;
const FAMILY_CHART_MAX = 30;

// Histograma de una métrica sobre todos los genomas de la red. Marca el
// intervalo donde cae el genoma elegido.
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
    const indexOf = (v) => Math.min(n - 1, Math.floor((v - min) / width));
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

  const [genomes, setGenomes] = useState([]); // los 2.644 genomas, con n_edges en la red elegida
  const [rows, setRows] = useState([]); // filas de network_metrics de la red elegida
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

  // 2. Genomas y métricas de la red elegida: una sola llamada a cada endpoint.
  //    El genoma elegido, los gráficos y la tabla se resuelven en el navegador.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([api.getAtlasGenomes(networkId), api.getAtlasMetrics(networkId)])
      .then(([genomesRes, metricsRes]) => {
        if (cancelled) return;
        const list = genomesRes.data;
        setGenomes(list);
        setRows(metricsRes.data);
        // Se conserva el organismo al cambiar de red; en la primera carga se usa
        // initialOrganism o E. coli K-12.
        setOrganism((prev) => {
          if (prev && list.some((g) => g.accession === prev)) return prev;
          const start = [initialOrganism, DEFAULT_GENOME].find((id) => list.some((g) => g.accession === id));
          return start ?? list[0]?.accession ?? "";
        });
      })
      .catch(() => {
        if (cancelled) return;
        setError(
          "Network metrics could not be loaded. Check that the backend is running and the atlas cache exists (make cache-atlas)."
        );
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [networkId, initialOrganism]);

  const metricsByAcc = useMemo(() => new Map(rows.map((r) => [r.accession, r])), [rows]);
  const network = networks.find((n) => n.network_id === networkId);
  const benchmark = parseBenchmark(network?.params?.source);
  const genome = genomes.find((g) => g.accession === organism);
  const current = metricsByAcc.get(organism);
  const chartMetric = CHART_METRICS.find((m) => m.key === chartKey);

  // Opciones del buscador: en gris los genomas sin fila en network_metrics
  const options = useMemo(
    () =>
      genomes.map((g) => {
        const m = metricsByAcc.get(g.accession);
        return {
          id: g.accession,
          label: g.ncbi_organism || g.accession,
          muted: !m,
          meta: m
            ? `${fmtInt(m.n_tf)} TFs, ${fmtInt(m.n_edges)} edges`
            : ATLAS_SELECTIONS.has(g.selection)
            ? "no metrics"
            : "auxiliary",
        };
      }),
    [genomes, metricsByAcc]
  );

  // Por qué el genoma elegido no tiene métricas
  const missingReason = () => {
    if (!genome) return "";
    const name = genome.ncbi_organism || genome.accession;
    if (!ATLAS_SELECTIONS.has(genome.selection)) {
      return `${name} is an auxiliary genome (${genome.selection}). Metrics are reported only for the 2,224 atlas genomes.`;
    }
    if (!genome.n_edges) {
      return `${name} has no edges in the ${network?.name ?? "selected"} network, so it has no metrics. Choose a less strict network, such as permissive.`;
    }
    return `${name} has ${fmtInt(genome.n_edges)} edges in this network, but the external pipeline reported no metrics for it.`;
  };

  // Gráfico 1: distribución de la métrica en todos los genomas de la red
  const histogram = useMemo(
    () => buildHistogram(rows.map((r) => r[chartKey]), chartMetric, current?.[chartKey]),
    [rows, chartKey, chartMetric, current]
  );
  const selectedBin = histogram.find((b) => b.selected);

  // Gráfico 2 y tabla: genomas de la misma familia GTDB
  const family = current?.gtdb_family ?? genome?.gtdb_family;
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
          RegulomeAtlas database.
        </p>
      </div>

      {error && (
        <div className="bg-[#FEF0F0] border border-[#F8BFBF] text-[#D96C6C] text-sm rounded-lg px-4 py-2.5">{error}</div>
      )}

      {/* Controles */}
      <div className="bg-white border border-[#D9E2E7] rounded-xl p-3 flex flex-wrap items-end gap-4 shadow-sm">
        <NetworkSelector networks={networks} value={networkId} onChange={setNetworkId} />

        <div className="flex flex-col gap-1">
          <span className="text-xs text-[#64748B]">
            Organism ({fmtInt(rows.length)} of {fmtInt(genomes.length)} have metrics in this network)
          </span>
          <OrganismSearch
            options={options}
            value={organism}
            onChange={setOrganism}
            disabled={loading && genomes.length === 0}
          />
        </div>

        <div className="ml-auto text-xs text-[#64748B] text-right">
          {current && (
            <div>
              {current.gtdb_phylum}, {current.gtdb_family}. {fmtInt(current.n_operons)} operons in the genome.
            </div>
          )}
          {benchmark && (
            <div className="text-[11px] mt-0.5 text-[#94A3B8]">
              Benchmark against RegPrecise: precision {benchmark.p}, recall {benchmark.r}, F1 {benchmark.f1}
            </div>
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
                  <dt className="text-[12px] text-[#64748B]" title={m.hint}>
                    {m.label}
                  </dt>
                  <dd className="font-mono text-[13px] font-semibold text-[#334155]">{m.fmt(current?.[m.key])}</dd>
                </div>
              ))}
            </dl>
          </div>
        </>
      )}

      {/* Métrica de los gráficos */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-[#64748B]">Charts show</span>
        <select value={chartKey} onChange={(e) => setChartKey(e.target.value)} className={selectClass}>
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
            Genomes per {chartMetric.label.toLowerCase()} value in the {network?.name ?? "selected"} network
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
          <h3 className="text-sm font-semibold text-[#334155] mb-1">
            Ranking within {family ?? "the family"}
          </h3>
          <p className="text-xs text-[#64748B] mb-4">
            {familyAll.length > FAMILY_CHART_MAX
              ? `Top ${FAMILY_CHART_MAX} of ${fmtInt(familyAll.length)} genomes`
              : `${fmtInt(familyAll.length)} genome${familyAll.length === 1 ? "" : "s"}`}{" "}
            of this GTDB family by {chartMetric.label.toLowerCase()}. Click a bar to select it.
          </p>
          {familyChart.length === 0 ? (
            <p className="text-sm text-[#94A3B8] py-16 text-center">No genome of this family has metrics in this network.</p>
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
            Bold marks the highest value and the last row is the family median. Click a column to sort and a row to
            select it.
          </p>
          <div className="max-h-[420px] overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-[#D9E2E7]">
                  <th
                    onClick={() => toggleSort("ncbi_organism")}
                    className="text-left text-[11px] font-medium text-[#64748B] pb-2 cursor-pointer select-none"
                  >
                    Organism
                    <SortIcon active={sort.key === "ncbi_organism"} dir={sort.dir} />
                  </th>
                  {TABLE_COLUMNS.map((c) => (
                    <th
                      key={c.key}
                      onClick={() => toggleSort(c.key)}
                      className="text-right text-[11px] font-medium text-[#64748B] pb-2 pl-3 cursor-pointer select-none whitespace-nowrap"
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
                    onClick={() => setOrganism(r.accession)}
                    className={`border-b border-[#F7FAFC] cursor-pointer transition-colors ${
                      r.accession === organism ? "bg-[#E8F5F0]" : "hover:bg-[#F7FAFC]"
                    }`}
                  >
                    <td className="py-2 text-[12px] text-[#334155] italic">{r.ncbi_organism}</td>
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
          <p className="text-[11px] text-[#94A3B8] mt-3">
            Density, degrees and components as defined by the external pipeline (network_metrics).
          </p>
        </div>
      )}
    </div>
  );
}
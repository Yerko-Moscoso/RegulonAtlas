import { useState, useEffect, useMemo } from "react";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Loader2, Info, X, Check, Plus } from "lucide-react";
import { api } from "../services/api";
import ScrollX from "../components/ScrollX";
import { clickable, FOCUS_RING } from "../utils/a11y";
import NetworkSelector from "../components/NetworkSelector";
import OrganismSearch from "../components/OrganismSearch";
import { DEFAULT_NETWORK, DEFAULT_GENOME, fmtInt } from "../utils/atlas";
import { METRIC_LABELS } from "../utils/metrics";

// Huella topológica de cada genoma: su posición (percentil) en cada métrica
// respecto de los genomas del atlas con aristas en la red elegida. El percentil
// no depende de qué genomas se muestran y resiste las colas largas.
// Fuente: métricas propias (make metrics-atlas, endpoint /atlas/metrics), calculadas
// con NetworkX sobre el grafo TF -> operón. No se usan las métricas que dependen de
// ubicar el gen del TF por nombre (autorregulación, aristas TF -> TF).

const fmtDec = (digits) => (v) => (v == null ? "—" : Number(v).toFixed(digits));
const fmtPct = (v) => (v == null ? "—" : `${(Number(v) * 100).toFixed(1)}%`);

const FP_METRICS = [
  { key: "n_edges", label: METRIC_LABELS.n_edges, fmt: fmtInt },
  { key: "n_tf", label: METRIC_LABELS.n_tf, fmt: fmtInt },
  { key: "edges_per_tf", label: METRIC_LABELS.edges_per_tf, fmt: fmtDec(2) },
  { key: "frac_multi_reg", label: METRIC_LABELS.frac_multi_reg, fmt: fmtPct },
  { key: "out_degree_gini", label: METRIC_LABELS.out_degree_gini, fmt: fmtDec(2) },
  { key: "hub_share", label: METRIC_LABELS.hub_share, fmt: fmtPct },
  { key: "frac_genome_targeted", label: METRIC_LABELS.frac_genome_targeted, fmt: fmtPct },
  { key: "frac_largest", label: METRIC_LABELS.frac_largest, fmt: fmtPct },
];

const MAX_PINNED = 4;
const SERIES_COLOR = {
  selected: "#3A9D7C",
  family: "#3B82B8",
  atlas: "#94A3B8",
  pinned: ["#E9B949", "#D96C6C", "#8B5CF6", "#0EA5E9"],
};

function heatColor(norm) {
  if (norm == null) return "#F7FAFC";
  if (norm >= 0.8) return "#176B57";
  if (norm >= 0.6) return "#3A9D7C";
  if (norm >= 0.4) return "#55B8A5";
  if (norm >= 0.2) return "#DCEFFA";
  return "#F7FAFC";
}
const heatTextColor = (norm) => (norm != null && norm >= 0.6 ? "#fff" : "#334155");

const median = (values) => {
  const s = values.filter((v) => v != null).sort((a, b) => a - b);
  if (s.length === 0) return null;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

// Primer índice de s (ordenado) cuyo valor es >= v (o > v si strict)
const bound = (s, v, strict) => {
  let lo = 0;
  let hi = s.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (strict ? s[mid] <= v : s[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

// "Escherichia coli str. K-12 substr. MG1655" -> "Escherichia coli"
const shortName = (name = "") => name.split(" ").slice(0, 2).join(" ");

export default function Fingerprints({ initialOrganism }) {
  const [networks, setNetworks] = useState([]);
  const [networkId, setNetworkId] = useState(DEFAULT_NETWORK);

  const [all, setAll] = useState([]); // los 2.644 genomas con sus métricas propias (has_edges=false si no tienen aristas)
  const [organism, setOrganism] = useState("");
  const [pinned, setPinned] = useState([]); // accessions que se comparan en el radar
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hoveredCell, setHoveredCell] = useState(null);

  // 1. Lista de redes
  useEffect(() => {
    api
      .getAtlasNetworks()
      .then((res) => setNetworks(res.data))
      .catch(() => setError("The network list could not be loaded. Check that the backend is running."));
  }, []);

  // 2. Métricas propias de todos los genomas en la red elegida (una sola llamada)
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
    return () => {
      cancelled = true;
    };
  }, [networkId, initialOrganism]);

  const byAcc = useMemo(() => new Map(all.map((r) => [r.accession, r])), [all]);
  const rows = useMemo(() => all.filter((r) => r.has_edges), [all]); // genomas con aristas
  const atlasRows = useMemo(() => rows.filter((r) => r.in_atlas), [rows]); // población de referencia
  const network = networks.find((n) => n.network_id === networkId);
  const genome = byAcc.get(organism);
  const current = genome?.has_edges ? genome : null;
  // Familia como valor propio (texto): así el compilador de React puede conservar el useMemo de familyRows.
  const family = useMemo(() => byAcc.get(organism)?.gtdb_family, [byAcc, organism]);

  // Valores ordenados por métrica (solo genomas del atlas), para calcular percentiles
  const sorted = useMemo(
    () =>
      Object.fromEntries(
        FP_METRICS.map((m) => [
          m.key,
          atlasRows
            .map((r) => r[m.key])
            .filter((v) => v != null)
            .sort((a, b) => a - b),
        ])
      ),
    [atlasRows]
  );

  // Percentil (0-100) con empates repartidos al medio
  const percentile = (key, v) => {
    const s = sorted[key];
    if (v == null || !s || s.length === 0) return null;
    const below = bound(s, v, false);
    const upTo = bound(s, v, true);
    return ((below + (upTo - below) / 2) / s.length) * 100;
  };

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
    } network, so it has no fingerprint. Choose a less strict network, such as permissive.`;
  };

  // Genomas de la misma familia GTDB con aristas, de mayor a menor número de aristas
  const familyRows = useMemo(
    () =>
      family
        ? rows.filter((r) => r.gtdb_family === family).sort((a, b) => (b.n_edges ?? 0) - (a.n_edges ?? 0))
        : [],
    [rows, family]
  );

  const familyMedian = useMemo(
    () => Object.fromEntries(FP_METRICS.map((m) => [m.key, median(familyRows.map((r) => r[m.key]))])),
    [familyRows]
  );

  // Comparadores fijados que tienen aristas en la red actual
  const pinnedRows = pinned
    .filter((acc) => acc !== organism)
    .map((acc) => byAcc.get(acc))
    .filter((r) => r?.has_edges);

  const togglePin = (acc) =>
    setPinned((p) => (p.includes(acc) ? p.filter((a) => a !== acc) : p.length >= MAX_PINNED ? p : [...p, acc]));

  const radarData = FP_METRICS.map((m) => {
    const point = { metric: m.label };
    if (current) point.selected = Math.round(percentile(m.key, current[m.key]));
    if (familyRows.length > 1) point.family = Math.round(percentile(m.key, familyMedian[m.key]));
    point.atlas = 50;
    pinnedRows.forEach((r) => {
      point[r.accession] = Math.round(percentile(m.key, r[m.key]));
    });
    return point;
  });

  return (
    <div className="space-y-5 max-w-[1100px]">
      <div>
        <h1 className="text-2xl font-semibold text-[#334155]">Regulatory Network Fingerprints</h1>
        <p className="text-sm text-[#64748B] mt-1">
          Where each genome's regulatory network stands in the atlas: every metric is shown as a percentile among the
          atlas genomes with edges in the selected network.
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
            Organism ({fmtInt(rows.length)} of {fmtInt(all.length)} genomes have edges in this network)
          </span>
          <OrganismSearch options={options} value={organism} onChange={setOrganism} disabled={loading && all.length === 0} />
        </div>
        {genome && (
          <div className="ml-auto text-xs text-[#64748B] text-right">
            {genome.gtdb_phylum}, {genome.gtdb_family}
            {!genome.in_atlas && <div className="text-[11px] text-[#94A3B8]">Auxiliary genome ({genome.selection})</div>}
          </div>
        )}
      </div>

      <div className="flex gap-2.5 items-start bg-[#F7FAFC] border border-[#D9E2E7] rounded-lg px-4 py-2.5">
        <Info size={15} className="text-[#64748B] shrink-0 mt-0.5" />
        <p className="text-[12px] text-[#64748B]">
          Metrics are computed by RegulonAtlas from the network edges: a directed graph with one node per transcription
          factor (normalized name) and per target operon. Percentiles are relative to the {fmtInt(atlasRows.length)} atlas
          genomes with edges in this network. Absolute sizes (edges, TFs) grow strongly with less strict networks;
          compare genomes within the same network.
        </p>
      </div>

      {loading && (
        <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-8 flex items-center justify-center gap-2 text-sm text-[#64748B]">
          <Loader2 className="w-5 h-5 text-[#3A9D7C] animate-spin" />
          Loading fingerprints…
        </div>
      )}

      {!loading && genome && !current && (
        <div className="bg-white border border-dashed border-[#D9E2E7] rounded-xl px-6 py-8 text-center">
          <p className="text-sm text-[#64748B] max-w-xl mx-auto">{missingReason()}</p>
        </div>
      )}

      {/* Valores y percentiles del genoma elegido */}
      {!loading && current && (
        <div className="grid grid-cols-4 lg:grid-cols-8 gap-2.5">
          {FP_METRICS.map((m) => {
            const p = percentile(m.key, current[m.key]);
            return (
              <div key={m.key} className="bg-white rounded-xl border border-[#D9E2E7] p-3 shadow-sm">
                <div className="text-lg font-bold font-mono text-[#3A9D7C]">{m.fmt(current[m.key])}</div>
                <div className="text-[11px] text-[#64748B] mt-0.5 leading-tight">{m.label}</div>
                <div className="text-[11px] text-[#94A3B8] mt-1.5">{p == null ? "—" : `Percentile ${Math.round(p)}`}</div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && (current || familyRows.length > 0) && (
        <>
          {/* Radar */}
          <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-5">
            <div className="flex items-start justify-between gap-4 mb-2">
              <div>
                <h3 className="text-sm font-semibold text-[#334155]">Fingerprint radar</h3>
                <p className="text-xs text-[#64748B] mt-0.5">
                  Percentile of each metric among the {fmtInt(atlasRows.length)} atlas genomes of the{" "}
                  {network?.name ?? "selected"} network. The grey ring is the atlas median (50); the blue profile is the
                  median of {family ?? "the family"}. Add up to {MAX_PINNED} genomes from the table below to compare.
                </p>
              </div>
            </div>

            {pinnedRows.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {pinnedRows.map((r, i) => (
                  <span
                    key={r.accession}
                    className="inline-flex items-center gap-1.5 text-[11px] text-[#334155] bg-[#F7FAFC] border border-[#D9E2E7] rounded-full pl-2 pr-1 py-0.5"
                  >
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: SERIES_COLOR.pinned[i] }} />
                    <span className="italic">{shortName(r.ncbi_organism)}</span>
                    <button
                      onClick={() => togglePin(r.accession)}
                      aria-label={`Remove ${r.ncbi_organism} from the comparison`}
                      className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-[#E2E8F0]"
                    >
                      <X size={10} className="text-[#64748B]" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <ResponsiveContainer width="100%" height={360}>
              <RadarChart data={radarData} margin={{ top: 10, right: 40, bottom: 10, left: 40 }}>
                <PolarGrid stroke="#E2E8F0" />
                <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fill: "#64748B" }} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 9, fill: "#94A3B8" }} tickCount={5} />
                <Radar
                  name="Atlas median"
                  dataKey="atlas"
                  stroke={SERIES_COLOR.atlas}
                  strokeDasharray="4 3"
                  fill="none"
                  strokeWidth={1}
                />
                {familyRows.length > 1 && (
                  <Radar
                    name={`${family} median`}
                    dataKey="family"
                    stroke={SERIES_COLOR.family}
                    strokeDasharray="5 3"
                    fill={SERIES_COLOR.family}
                    fillOpacity={0.05}
                    strokeWidth={1.5}
                  />
                )}
                {pinnedRows.map((r, i) => (
                  <Radar
                    key={r.accession}
                    name={shortName(r.ncbi_organism)}
                    dataKey={r.accession}
                    stroke={SERIES_COLOR.pinned[i]}
                    fill={SERIES_COLOR.pinned[i]}
                    fillOpacity={0.04}
                    strokeWidth={1.5}
                  />
                ))}
                {current && (
                  <Radar
                    name={shortName(current.ncbi_organism)}
                    dataKey="selected"
                    stroke={SERIES_COLOR.selected}
                    fill={SERIES_COLOR.selected}
                    fillOpacity={0.25}
                    strokeWidth={2.5}
                  />
                )}
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderColor: "#D9E2E7", borderRadius: 8 }}
                  formatter={(v, name) => [`Percentile ${v}`, name]}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          {/* Matriz de la familia */}
          {familyRows.length > 0 && (
            <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-5">
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-[#334155]">Fingerprints within {family}</h3>
                <p className="text-xs text-[#64748B] mt-0.5">
                  {fmtInt(familyRows.length)} genome{familyRows.length === 1 ? "" : "s"} of this GTDB family with edges,
                  ordered by number of edges ("aux" marks auxiliary genomes outside the 2,224-genome atlas). Cells show
                  the real value; the color is its percentile in the atlas. Click a name to select it, or + to add it to
                  the radar.
                </p>
              </div>
              <ScrollX className="max-h-[480px] overflow-y-auto">
                <table className="w-full min-w-max">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr>
                      <th className="w-7 pb-2" />
                      <th className="text-left text-[10px] font-medium text-[#64748B] pb-2 pr-3 w-52">Organism</th>
                      {FP_METRICS.map((m) => (
                        <th key={m.key} className="text-center text-[10px] font-medium text-[#64748B] pb-2 px-1 min-w-[76px]">
                          {m.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {familyRows.map((r, rowIdx) => {
                      const isSelected = r.accession === organism;
                      const isPinned = pinned.includes(r.accession);
                      const pinDisabled = isSelected || (!isPinned && pinned.length >= MAX_PINNED);
                      return (
                        <tr key={r.accession} className={`border-t border-[#F0F4F8] ${isSelected ? "bg-[#E8F5F0]" : ""}`}>
                          <td className="py-1 pr-1">
                            <button
                              onClick={() => togglePin(r.accession)}
                              disabled={pinDisabled}
                              aria-label={isPinned ? "Remove from radar" : "Add to radar"}
                              title={
                                isSelected
                                  ? "Selected organism"
                                  : isPinned
                                  ? "Remove from radar"
                                  : pinned.length >= MAX_PINNED
                                  ? `Up to ${MAX_PINNED} genomes can be compared`
                                  : "Add to radar"
                              }
                              className={`w-6 h-6 flex items-center justify-center rounded-md border ${
                                isPinned
                                  ? "bg-[#3A9D7C] border-[#3A9D7C] text-white"
                                  : "border-[#D9E2E7] text-[#64748B] hover:bg-[#F7FAFC]"
                              } disabled:opacity-30 disabled:cursor-not-allowed`}
                            >
                              {isPinned ? <Check size={12} /> : <Plus size={12} />}
                            </button>
                          </td>
                          <td
                            {...clickable(() => setOrganism(r.accession))}
                            className={`text-[11px] pr-3 py-1.5 italic cursor-pointer hover:underline ${FOCUS_RING} ${
                              isSelected ? "text-[#176B57] font-semibold" : "text-[#334155]"
                            }`}
                          >
                            {r.ncbi_organism}
                            {!r.in_atlas && <span className="ml-1 not-italic text-[9px] text-[#94A3B8]">aux</span>}
                          </td>
                          {FP_METRICS.map((m, colIdx) => {
                            const p = percentile(m.key, r[m.key]);
                            const norm = p == null ? null : p / 100;
                            const isHovered = hoveredCell?.row === rowIdx && hoveredCell?.col === colIdx;
                            return (
                              <td key={m.key} className="px-0.5 py-1">
                                <div
                                  className="h-8 rounded flex items-center justify-center text-[10px] font-mono font-medium"
                                  style={{
                                    backgroundColor: heatColor(norm),
                                    color: heatTextColor(norm),
                                    opacity: hoveredCell && !isHovered ? 0.6 : 1,
                                  }}
                                  onMouseEnter={() => setHoveredCell({ row: rowIdx, col: colIdx })}
                                  onMouseLeave={() => setHoveredCell(null)}
                                  title={`${r.ncbi_organism}, ${m.label}: ${m.fmt(r[m.key])} (percentile ${
                                    p == null ? "—" : Math.round(p)
                                  })`}
                                >
                                  {m.fmt(r[m.key])}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </ScrollX>
              <div className="flex items-center gap-2 mt-4 pt-3 border-t border-[#F0F4F8]">
                <span className="text-[10px] text-[#64748B]">Low percentile in the atlas</span>
                <div
                  className="flex-1 max-w-48 h-2 rounded-full"
                  style={{ background: "linear-gradient(to right, #F7FAFC, #DCEFFA, #55B8A5, #3A9D7C, #176B57)" }}
                />
                <span className="text-[10px] text-[#64748B]">High</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
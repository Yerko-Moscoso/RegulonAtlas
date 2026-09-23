import { useState, useEffect, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Loader2 } from "lucide-react";
import { api } from "../services/api";
import { COMPARISON_ACCESSIONS } from "../constants/comparisonGenomes";

const fmtInt = (n) => (n == null ? "—" : Number(n).toLocaleString("en-US"));

// Las 5 métricas básicas del MVP, tal como las calcula compute_metrics.py
// (NetworkX) sobre la red completa.
const METRICS = [
  { key: "nodos", label: "Nodes", fmt: fmtInt, color: "text-[#3A9D7C]" },
  { key: "aristas", label: "Edges", fmt: fmtInt, color: "text-[#3B82B8]" },
  { key: "densidad", label: "Density", fmt: (v) => v?.toFixed(4) ?? "—", color: "text-[#55B8A5]" },
  { key: "grado_medio", label: "Average degree", fmt: (v) => v?.toFixed(2) ?? "—", color: "text-[#3A9D7C]" },
  { key: "hubs", label: "Hubs", fmt: fmtInt, color: "text-[#3B82B8]" },
];

// Grados 1-20 uno por uno y el resto agrupado: los TF tienen cientos de
// blancos y una barra por grado haría ilegible el gráfico.
const DEGREE_BINS = [
  ...Array.from({ length: 20 }, (_, i) => ({ label: String(i + 1), min: i + 1, max: i + 1 })),
  { label: "21–50", min: 21, max: 50 },
  { label: "51–100", min: 51, max: 100 },
  { label: ">100", min: 101, max: Infinity },
];

function binDegrees(distribution = []) {
  return DEGREE_BINS.map((b) => ({
    bin: b.label,
    count: distribution
      .filter((d) => d.degree >= b.min && d.degree <= b.max)
      .reduce((sum, d) => sum + d.count, 0),
  }));
}

function Spinner() {
  return (
    <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-10 rounded-xl">
      <Loader2 className="w-6 h-6 text-[#3A9D7C] animate-spin" />
    </div>
  );
}

export default function Metrics({ initialOrganism }) {
  const [summary, setSummary] = useState([]); // topología de los 8 genomas
  const [organism, setOrganism] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [topology, setTopology] = useState(null); // detalle del genoma elegido
  const [topologyLoading, setTopologyLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .getTopologySummary(COMPARISON_ACCESSIONS)
      .then((res) => {
        if (cancelled) return;
        const rows = [...res.data].sort((a, b) => a.organism.localeCompare(b.organism));
        setSummary(rows);
        const start = rows.find((r) => r.genome_acc === initialOrganism) ?? rows[0];
        if (start) setOrganism(start.genome_acc);
      })
      .catch(() => !cancelled && setError("Network metrics could not be loaded. Run `make mvp` and check the backend."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [initialOrganism]);

  useEffect(() => {
    if (!organism) return;
    let cancelled = false;
    setTopologyLoading(true);
    api
      .getTopologyMetrics(organism)
      .then((res) => !cancelled && setTopology(res.data))
      .catch(() => !cancelled && setTopology(null))
      .finally(() => !cancelled && setTopologyLoading(false));
    return () => {
      cancelled = true;
    };
  }, [organism]);

  const degreeData = useMemo(() => binDegrees(topology?.degree_distribution), [topology]);
  const tfData = topology?.top_tfs ?? [];
  const thr = topology?.neg_log10_p_threshold ?? summary[0]?.neg_log10_p_threshold;
  const hubThr = topology?.hub_degree_threshold ?? 20;

  // Para resaltar en la tabla comparativa el máximo de cada métrica.
  const maxByMetric = useMemo(
    () => Object.fromEntries(METRICS.map((m) => [m.key, Math.max(...summary.map((r) => r[m.key] ?? 0))])),
    [summary]
  );

  return (
    <div className="space-y-5 max-w-[1100px]">
      <div>
        <h1 className="text-2xl font-semibold text-[#334155]">Topological Metrics</h1>
        <p className="text-sm text-[#64748B] mt-1">
          Architecture of each predicted regulatory network (TF → gene, FIMO p ≤ 1e-{thr ?? "…"}),
          computed with NetworkX on the full network.
        </p>
      </div>

      {error && (
        <div className="bg-[#FEF0F0] border border-[#F8BFBF] text-[#D96C6C] text-sm rounded-lg px-4 py-2.5">{error}</div>
      )}

      <div className="bg-white border border-[#D9E2E7] rounded-xl p-3 flex flex-wrap items-center gap-4 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#64748B]">Organism</span>
          <select
            value={organism}
            onChange={(e) => setOrganism(e.target.value)}
            disabled={loading}
            className="text-sm border border-[#D9E2E7] rounded-lg px-2.5 py-1.5 bg-white text-[#334155] focus:outline-none focus:ring-1 focus:ring-[#3A9D7C] min-w-[220px] disabled:bg-gray-50 disabled:text-gray-400"
          >
            {loading ? (
              <option>Loading…</option>
            ) : (
              summary.map((r) => (
                <option key={r.genome_acc} value={r.genome_acc}>
                  {r.organism}
                </option>
              ))
            )}
          </select>
        </div>
        {topology && (
          <div className="ml-auto text-xs text-[#64748B]">
            {fmtInt(topology.n_tfs)} TFs · {fmtInt(topology.n_targets)} target genes ·{" "}
            {fmtInt(topology.aristas_directas)} direct + {fmtInt(topology.aristas_por_operon)} operon edges
          </div>
        )}
      </div>

      {/* 5 métricas básicas */}
      <div className="relative grid grid-cols-5 gap-3">
        {topologyLoading && <Spinner />}
        {METRICS.map((m) => (
          <div key={m.key} className="bg-white rounded-xl border border-[#D9E2E7] p-4 shadow-sm">
            <div className={`text-xl font-bold font-mono ${m.color}`}>{m.fmt(topology?.[m.key])}</div>
            <div className="text-[11px] text-[#64748B] mt-1">
              {m.key === "hubs" ? `Hubs (TFs with > ${hubThr} targets)` : m.label}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-5 relative">
          {topologyLoading && <Spinner />}
          <h3 className="text-sm font-semibold text-[#334155] mb-1">Degree distribution</h3>
          <p className="text-xs text-[#64748B] mb-4">
            Nodes per total degree (in + out), full network. Low degrees are target genes; the right tail is TFs.
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={degreeData} margin={{ top: 0, right: 4, bottom: 10, left: -6 }}>
              <CartesianGrid strokeDasharray="2 2" stroke="#F0F4F8" vertical={false} />
              <XAxis
                dataKey="bin"
                interval={0}
                tick={{ fontSize: 9, fill: "#64748B" }}
                angle={-40}
                textAnchor="end"
                height={40}
              />
              <YAxis tick={{ fontSize: 10, fill: "#64748B" }} />
              <Tooltip
                contentStyle={{ fontSize: 11, borderColor: "#D9E2E7", borderRadius: 8 }}
                labelFormatter={(v) => `Degree ${v}`}
                formatter={(v) => [fmtInt(v), "Nodes"]}
              />
              <Bar dataKey="count" fill="#3A9D7C" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-5 relative">
          {topologyLoading && <Spinner />}
          <h3 className="text-sm font-semibold text-[#334155] mb-1">TF connectivity ranking</h3>
          <p className="text-xs text-[#64748B] mb-4">
            Top {tfData.length} TFs by number of target genes, full network.
          </p>
          <ResponsiveContainer width="100%" height={Math.max(220, tfData.length * 18)}>
            <BarChart data={tfData} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 4 }}>
              <CartesianGrid strokeDasharray="2 2" stroke="#F0F4F8" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: "#64748B" }} />
              <YAxis dataKey="tf" type="category" interval={0} tick={{ fontSize: 10, fill: "#334155" }} width={80} />
              <Tooltip
                contentStyle={{ fontSize: 11, borderColor: "#D9E2E7", borderRadius: 8 }}
                formatter={(v) => [fmtInt(v), "Targets"]}
              />
              <Bar dataKey="targets" fill="#3B82B8" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Comparación entre genomas (reemplaza la vista Fingerprints en el MVP) */}
      <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-5">
        <h3 className="text-sm font-semibold text-[#334155] mb-1">Comparison across genomes</h3>
        <p className="text-xs text-[#64748B] mb-4">
          The same five metrics for every genome analyzed. Bold marks the highest value; click a row to select it.
        </p>
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#D9E2E7]">
              <th className="text-left text-[11px] font-medium text-[#64748B] pb-2">Organism</th>
              {METRICS.map((m) => (
                <th key={m.key} className="text-right text-[11px] font-medium text-[#64748B] pb-2 pl-3">
                  {m.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {summary.map((r) => (
              <tr
                key={r.genome_acc}
                onClick={() => setOrganism(r.genome_acc)}
                className={`border-b border-[#F7FAFC] last:border-0 cursor-pointer transition-colors ${
                  r.genome_acc === organism ? "bg-[#E8F5F0]" : "hover:bg-[#F7FAFC]"
                }`}
              >
                <td className="py-2 text-[12px] text-[#334155] italic">{r.organism}</td>
                {METRICS.map((m) => (
                  <td
                    key={m.key}
                    className={`py-2 pl-3 text-right font-mono text-[12px] text-[#334155] ${
                      r[m.key] === maxByMetric[m.key] ? "font-bold" : ""
                    }`}
                  >
                    {m.fmt(r[m.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[11px] text-[#94A3B8] mt-3">
          Density = edges / (nodes × (nodes − 1)). Average degree = edges / nodes. Nodes = TFs + target genes.
        </p>
      </div>
    </div>
  );
}
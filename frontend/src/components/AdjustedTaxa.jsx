import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Cell } from "recharts";
import { Loader2 } from "lucide-react";
import { api } from "../services/api";
import { fmtInt } from "../utils/atlas";
import { pct, detail } from "../utils/validation";

// Comparación entre taxones descontando el tamaño del genoma y la oferta de motivos (excepción E3).
const ADJUSTED_METRICS = new Set(["n_tf", "n_targets", "n_edges"]);
const MAX_TAXA = 20;
const fold = (v) => `×${Math.exp(v).toFixed(2)}`;

export default function AdjustedTaxa({ networkId, level, metric, metricLabel }) {
  const supported = ADJUSTED_METRICS.has(metric);
  const [rows, setRows] = useState([]);
  const [test, setTest] = useState(null);
  const [loading, setLoading] = useState(supported);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supported) return undefined;
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([api.getAdjustedTaxa(networkId, level, metric), api.getAdjustedTests(networkId, level, metric)])
      .then(([taxa, tests]) => {
        if (cancelled) return;
        setRows(taxa.data.rows ?? []);
        setTest(tests.data.rows?.[0] ?? null);
      })
      .catch((err) => !cancelled && setError(detail(err, "The adjusted comparison could not be loaded.")))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [networkId, level, metric, supported]);

  const shown = [...rows].sort((a, b) => b.genomes - a.genomes).slice(0, MAX_TAXA)
    .sort((a, b) => b.residual_median - a.residual_median);

  return (
    <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-5">
      <h3 className="text-sm font-semibold text-[#334155] mb-1">Adjusted for genome size and motif supply</h3>
      {!supported ? (
        <p className="text-xs text-[#64748B]">Available for number of TFs, target operons and edges.</p>
      ) : error ? (
        <div className="bg-[#FEF0F0] border border-[#F8BFBF] text-[#D96C6C] text-sm rounded-lg px-4 py-2.5">{error}</div>
      ) : loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 text-[#3A9D7C] animate-spin" /></div>
      ) : (
        <>
          <p className="text-xs text-[#64748B] mb-3">
            {metricLabel} of each taxon relative to what its genome size and nearby motif supply predict (×1 = as
            expected).{" "}
            {test?.taxon_effect_explained != null ? (
              <>These two factors explain <b>{pct(test.taxon_effect_explained)}</b> of the taxon effect at this level. </>
            ) : (
              <>The share explained cannot be interpreted here because the model overfits. </>
            )}
            What remains may be biology or sampling bias; this analysis cannot separate them.
            {rows.length > MAX_TAXA && ` Showing the ${MAX_TAXA} taxa with most genomes of ${rows.length}.`}
          </p>
          <ResponsiveContainer width="100%" height={Math.max(200, shown.length * 24 + 50)}>
            <BarChart data={shown} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
              <CartesianGrid strokeDasharray="2 2" stroke="#F0F4F8" horizontal={false} />
              <XAxis type="number" tickFormatter={fold} tick={{ fontSize: 11, fill: "#64748B" }} stroke="#D9E2E7" />
              <YAxis type="category" dataKey="taxon" width={170} tick={{ fontSize: 11, fill: "#334155" }} stroke="#D9E2E7" />
              <Tooltip
                formatter={(v) => [fold(v), "Median vs expected"]}
                labelFormatter={(t) => {
                  const r = shown.find((x) => x.taxon === t);
                  return r ? `${t} (${fmtInt(r.genomes)} genomes)` : t;
                }}
                contentStyle={{ fontSize: 11 }}
              />
              <ReferenceLine x={0} stroke="#64748B" />
              <Bar dataKey="residual_median" barSize={12} isAnimationActive={false}>
                {shown.map((r) => (
                  <Cell key={r.taxon} fill={r.residual_median >= 0 ? "#3A9D7C" : "#D97706"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  );
}

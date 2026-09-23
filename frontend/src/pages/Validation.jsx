import { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Loader2 } from "lucide-react";
import { api } from "../services/api";
import { VALIDATED_ACCESSIONS, REFERENCE_ACCESSION } from "../constants/comparisonGenomes";

const formatThreshold = (t) => (t == null ? "—" : `1e-${Number(t).toFixed(1).replace(".0", "")}`);
const pct = (v) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);
const fmtInt = (n) => (n == null ? "—" : Number(n).toLocaleString("en-US"));
const f1Score = (p, r) => (p + r > 0 ? (2 * p * r) / (p + r) : 0);

export default function Validation({ initialOrganism }) {
  const [genomes, setGenomes] = useState([]);
  const [genomeAcc, setGenomeAcc] = useState("");
  const [loadingGenomes, setLoadingGenomes] = useState(true);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [thresholdIndex, setThresholdIndex] = useState(0);

  // Solo genomas donde el cruce de locus tags con RegPrecise funciona.
  useEffect(() => {
    let cancelled = false;
    api
      .getGenomesByAccessions(VALIDATED_ACCESSIONS)
      .then((res) => {
        if (cancelled) return;
        const list = (res.data.items ?? []).map((g) => ({
          id: g.accession,
          name: g.ncbi_organism || g.accession,
          threshold: g.network_threshold,
        }));
        setGenomes(list);
        const start =
          list.find((g) => g.id === initialOrganism) ??
          list.find((g) => g.id === REFERENCE_ACCESSION) ??
          list[0];
        if (start) setGenomeAcc(start.id);
      })
      .catch(() => !cancelled && setError("The genome list could not be loaded."))
      .finally(() => !cancelled && setLoadingGenomes(false));
    return () => {
      cancelled = true;
    };
  }, [initialOrganism]);

  useEffect(() => {
    if (!genomeAcc) return;
    let cancelled = false;
    setLoading(true);
    setError("");

    api
      .getValidationMetrics(genomeAcc)
      .then((res) => {
        if (cancelled) return;
        const sorted = [...res.data]
          .sort((a, b) => a.neg_log10_pvalue_threshold - b.neg_log10_pvalue_threshold)
          .map((r) => ({ ...r, threshold: r.neg_log10_pvalue_threshold }));
        setRows(sorted);
        // Por defecto, el umbral con que se construye la red.
        const networkThreshold = genomes.find((g) => g.id === genomeAcc)?.threshold;
        const idx = sorted.findIndex((r) => r.threshold === networkThreshold);
        setThresholdIndex(idx >= 0 ? idx : 0);
      })
      .catch((err) => {
        if (cancelled) return;
        setRows([]);
        setError(
          err.response?.status === 404
            ? "No curated regulons are available for this genome."
            : "Validation results could not be loaded."
        );
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [genomeAcc, genomes]);

  const current = rows[thresholdIndex];
  const networkThreshold = genomes.find((g) => g.id === genomeAcc)?.threshold;

  return (
    <div className="space-y-6 max-w-[1100px]">
      <div>
        <h1 className="text-2xl font-semibold text-[#334155]">Validation</h1>
        <p className="text-sm text-[#64748B] mt-1">
          Predicted TF → gene interactions compared with curated regulons
          {current?.gold_standard ? ` (${current.gold_standard})` : ""}.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-[#64748B]">Organism</span>
        <select
          value={genomeAcc}
          onChange={(e) => setGenomeAcc(e.target.value)}
          disabled={loadingGenomes}
          className="text-sm border border-[#D9E2E7] rounded-lg px-2.5 py-1.5 bg-white text-[#334155] focus:outline-none focus:ring-1 focus:ring-[#3A9D7C] disabled:bg-gray-50 disabled:text-gray-400"
        >
          {loadingGenomes ? (
            <option>Loading…</option>
          ) : (
            genomes.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} ({g.id})
              </option>
            ))
          )}
        </select>
      </div>

      {loading && (
        <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-8 flex items-center justify-center gap-2 text-sm text-[#64748B]">
          <Loader2 className="w-5 h-5 text-[#3A9D7C] animate-spin" />
          Computing validation…
        </div>
      )}

      {!loading && error && (
        <div className="bg-[#FEF0F0] rounded-xl border border-[#F8BFBF] p-6 text-center text-sm text-[#D96C6C]">
          {error}
        </div>
      )}

      {!loading && !error && current && (
        <>
          <div className="grid grid-cols-6 gap-3">
            {[
              { label: "Precision", value: pct(current.precision), color: "text-[#3A9D7C]" },
              { label: "Recall", value: pct(current.recall), color: "text-[#3B82B8]" },
              { label: "F1 score", value: pct(f1Score(current.precision, current.recall)), color: "text-[#55B8A5]" },
              { label: "True positives", value: fmtInt(current.true_positives), color: "text-[#176B57]" },
              { label: "False positives", value: fmtInt(current.false_positives), color: "text-[#D96C6C]" },
              { label: "False negatives", value: fmtInt(current.false_negatives), color: "text-[#B7791F]" },
            ].map((m) => (
              <div key={m.label} className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-4">
                <div className={`text-xl font-bold font-mono ${m.color}`}>{m.value}</div>
                <div className="text-[11px] text-[#64748B] mt-1">{m.label}</div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-5">
            <div className="flex items-start justify-between mb-4 gap-4">
              <div>
                <h3 className="text-sm font-semibold text-[#334155]">
                  Precision and recall across FIMO p-value thresholds
                </h3>
                <p className="text-xs text-[#64748B] mt-0.5">
                  Selected: p ≤{" "}
                  <span className="font-mono font-medium text-[#334155]">{formatThreshold(current.threshold)}</span>
                  {current.threshold === networkThreshold && " (threshold used to build the network)"}
                </p>
              </div>
              {rows.length > 1 && (
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-mono text-[#94A3B8]">{formatThreshold(rows[0].threshold)}</span>
                  <input
                    type="range"
                    min={0}
                    max={rows.length - 1}
                    step={1}
                    value={thresholdIndex}
                    onChange={(e) => setThresholdIndex(parseInt(e.target.value, 10))}
                    aria-label="FIMO p-value threshold"
                    className="w-36 accent-[#3A9D7C]"
                  />
                  <span className="text-xs font-mono text-[#94A3B8]">
                    {formatThreshold(rows[rows.length - 1].threshold)}
                  </span>
                </div>
              )}
            </div>

            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={rows} margin={{ top: 5, right: 16, bottom: 24, left: -10 }}>
                <CartesianGrid strokeDasharray="2 2" stroke="#F0F4F8" />
                <XAxis
                  dataKey="threshold"
                  tickFormatter={formatThreshold}
                  tick={{ fontSize: 11, fill: "#64748B" }}
                  label={{ value: "FIMO p-value threshold (stricter →)", position: "insideBottom", offset: -14, fontSize: 11, fill: "#64748B" }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#64748B" }}
                  tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                  domain={[0, "auto"]}
                />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderColor: "#D9E2E7", borderRadius: 8 }}
                  labelFormatter={(v) => `p ≤ ${formatThreshold(v)}`}
                  formatter={(v) => `${(v * 100).toFixed(1)}%`}
                />
                {/* Leyenda arriba para que no se monte sobre el título del eje X */}
                <Legend verticalAlign="top" align="right" height={24} wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine x={current.threshold} stroke="#E9B949" strokeDasharray="4 3" strokeWidth={1.5} />
                <Line type="monotone" dataKey="precision" stroke="#3A9D7C" strokeWidth={2.5} dot={{ r: 3 }} name="Precision" />
                <Line type="monotone" dataKey="recall" stroke="#3B82B8" strokeWidth={2.5} dot={{ r: 3 }} name="Recall" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="text-[11px] text-[#94A3B8] space-y-1 max-w-3xl">
            <p>
              An edge is a distinct TF → gene pair. True positives are predicted pairs present in the curated
              regulons; false positives are predicted pairs absent from them; false negatives are curated pairs
              the prediction missed.
            </p>
            <p>
              Thresholds more permissive than 1e-5 are not shown: only FIMO hits with p ≤ 1e-5 are stored in
              the database.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
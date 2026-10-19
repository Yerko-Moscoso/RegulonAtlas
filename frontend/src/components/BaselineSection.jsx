// Línea base del pipeline propio frente a las redes externas (semana 12), mostrada al final de Validation.
import { useState, useEffect } from "react";
import { api } from "../services/api";
import { fmtInt } from "../utils/atlas";
import { pct, dec, detail } from "../utils/validation";
import { Section, Spinner, ErrorMsg } from "./ValidationParts";

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

export default function BaselineSection({ mode, universe }) {
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

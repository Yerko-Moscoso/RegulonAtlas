import { useState, useEffect } from "react";
import { api } from "../services/api";
import { fmtInt } from "../utils/atlas";
import { pct, detail } from "../utils/validation";

// Precisión esperada de la red de un genoma según sus tiers de transferencia (excepción E4).
// Se muestra con su error de validación cruzada: distingue poco entre genomas de una misma red.
const STATUS = {
  useful: "useful to compare genomes",
  weak: "weak for comparing genomes",
  not_informative: "not informative for comparing genomes",
  insufficient: "too few genomes to check it",
};

export default function ReliabilityCard({ accession, networkId, networks = [] }) {
  const [rows, setRows] = useState([]);
  const [calibration, setCalibration] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setError("");
    setRows([]);
    Promise.all([api.getReliability(accession, networkId), api.getReliabilityCalibration()])
      .then(([rel, cal]) => {
        if (cancelled) return;
        setRows(rel.data.rows ?? []);
        setCalibration(cal.data.rows ?? []);
      })
      .catch((err) => {
        if (cancelled) return;
        // 404 = el genoma no tiene aristas en modo independent; no es un error del sistema
        setError(err?.response?.status === 404 ? "" : detail(err, "The reliability estimate could not be loaded."));
      });
    return () => {
      cancelled = true;
    };
  }, [accession, networkId]);

  if (error) return <div className="bg-[#FEF0F0] border border-[#F8BFBF] text-[#D96C6C] text-sm rounded-lg px-4 py-2.5">{error}</div>;
  if (rows.length === 0) return null;
  const calOf = (id) => calibration.find((c) => c.network_id === id);
  const nameOf = (r) => networks.find((n) => n.network_id === r.network_id)?.name ?? r.network;

  return (
    <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-5">
      <h3 className="text-sm font-semibold text-[#334155] mb-1">Expected precision (estimate)</h3>
      <p className="text-xs text-[#64748B] mb-3">
        Estimated from how closely related the motif sources of this genome's edges are, using the precision of each
        transfer tier in independent validation. It assumes TFs without curated regulons behave like curated ones.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-[#94A3B8] border-b border-[#E2E8F0]">
              <th className="py-1.5 font-medium">Network</th>
              <th className="py-1.5 font-medium text-right">Expected precision</th>
              <th className="py-1.5 font-medium text-right">Typical error</th>
              <th className="py-1.5 font-medium text-right">Pairs</th>
              <th className="py-1.5 font-medium text-right">From same family or closer</th>
              <th className="py-1.5 font-medium text-right">Directly checked</th>
              <th className="py-1.5 pl-4 font-medium">Estimate quality</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const c = calOf(r.network_id);
              return (
                <tr key={r.network_id} className="border-b border-[#F1F5F9]">
                  <td className="py-1.5 text-[#334155]">{nameOf(r)}</td>
                  <td className="py-1.5 text-right font-mono">{pct(r.expected_precision)}</td>
                  <td className="py-1.5 text-right font-mono text-[#64748B]">{c ? `±${(c.mae * 100).toFixed(0)} pts` : "—"}</td>
                  <td className="py-1.5 text-right font-mono">{fmtInt(r.n_pairs)}</td>
                  <td className="py-1.5 text-right font-mono text-[#64748B]">{pct(r.frac_close_tiers)}</td>
                  <td className="py-1.5 text-right font-mono text-[#64748B]">{pct(r.n_evaluable / r.n_pairs)}</td>
                  <td className="py-1.5 pl-4 text-xs text-[#64748B]">{c ? STATUS[c.status] : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-[#94A3B8] mt-2">
        Checked by cross-validation across GTDB families. The estimate mainly reflects the network; use it as a rough
        guide, not as a measured precision for this genome.
      </p>
    </div>
  );
}

import { useState, useEffect } from "react";
import { Info } from "lucide-react";
import { api } from "../services/api";
import { fmtInt } from "../utils/atlas";
import { pct } from "../utils/validation";

// Aviso de cobertura (excepción E7): qué parte de la red elegida se pudo comparar con regulones curados, en todos los
// genomas y solo en los del atlas. Si no está disponible no se muestra nada: la vista que lo contiene sigue funcionando.
export default function CoverageNote({ networkId }) {
  const [coverage, setCoverage] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getAtlasValidationCoverage()
      .then((res) => !cancelled && setCoverage(res.data))
      .catch(() => !cancelled && setCoverage(null));
    return () => {
      cancelled = true;
    };
  }, []);

  const row = coverage?.rows?.find((r) => r.network_id === networkId);
  if (!row) return null;
  return (
    <div className="bg-[#F0F7FB] border border-[#CFE3EF] rounded-lg px-3 py-2 text-xs text-[#334155] flex gap-2">
      <Info className="w-3.5 h-3.5 text-[#3B82B8] shrink-0 mt-0.5" />
      <span>
        Predicted network: <b>{pct(row.pairs_evaluable / row.pairs_total)}</b> of its TF–operon pairs across all{" "}
        {fmtInt(coverage.genomes_total)} genomes can be checked against curated regulons, and{" "}
        <b>{pct(row.atlas_pairs_evaluable / row.atlas_pairs_total)}</b> within the {fmtInt(coverage.genomes_atlas)} atlas
        genomes. The remaining pairs are unverified, not confirmed.
      </span>
    </div>
  );
}

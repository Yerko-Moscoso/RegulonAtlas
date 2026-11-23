import { useState, useEffect } from "react";
import { Info } from "lucide-react";
import { api } from "../services/api";
import { pct } from "../utils/validation";

// Aviso de cobertura (excepción E7): qué parte de la red elegida se pudo comparar con regulones curados.
// Si la validación no está disponible no se muestra nada: la vista que lo contiene sigue funcionando.
export default function CoverageNote({ networkId }) {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    let cancelled = false;
    api
      .getAtlasValidationSummary("regprecise", { mode: "all", universe: "genome_tf" })
      .then((res) => !cancelled && setRows(res.data.rows ?? []))
      .catch(() => !cancelled && setRows([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const row = rows.find((r) => r.network_id === networkId);
  if (!row) return null;
  return (
    <div className="bg-[#F0F7FB] border border-[#CFE3EF] rounded-lg px-3 py-2 text-xs text-[#334155] flex gap-2">
      <Info className="w-3.5 h-3.5 text-[#3B82B8] shrink-0 mt-0.5" />
      <span>
        Predicted network: only <b>{pct(row.pairs_evaluable / row.pairs_total)}</b> of the TF–operon pairs in{" "}
        {row.network} can be checked against curated regulons. The remaining pairs are unverified, not confirmed.
      </span>
    </div>
  );
}

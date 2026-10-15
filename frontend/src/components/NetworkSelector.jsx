import { fmtP, selectClass } from "../utils/atlas";

// Selector de las 5 redes materializadas (respuesta de api.getAtlasNetworks()).
export default function NetworkSelector({ networks, value, onChange }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-[#64748B]">Network</span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={networks.length === 0}
        className={selectClass}
      >
        {networks.map((n) => (
          <option key={n.network_id} value={n.network_id}>
            {n.name} (p ≤ {fmtP(n.p_threshold)}, {n.tier_ceiling})
          </option>
        ))}
      </select>
    </label>
  );
}

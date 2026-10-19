import { useState, useEffect, useMemo } from "react";
import { Search, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, Loader2 } from "lucide-react";
import { api } from "../services/api";
import NetworkSelector from "../components/NetworkSelector";
import { DEFAULT_NETWORK, fmtInt, selectClass } from "../utils/atlas";

// Catálogo de los 2.644 genomas de la base (2.224 del atlas + 420 auxiliares) con las métricas propias
// de la red elegida (make metrics-atlas). Antes mostraba los 8 genomas del MVP.

const PAGE = 100;

// key: campo de /atlas/metrics; numeric: se ordena como número
const COLUMNS = [
  { key: "ncbi_organism", label: "Organism" },
  { key: "gtdb_phylum", label: "Phylum (GTDB)" },
  { key: "gtdb_family", label: "Family (GTDB)" },
  { key: "n_genes", label: "Genes", numeric: true },
  { key: "n_tf", label: "TFs", numeric: true },
  { key: "n_targets", label: "Target operons", numeric: true },
  { key: "n_edges", label: "TF–operon pairs", numeric: true },
];

const SCOPES = [
  { key: "atlas", label: "Atlas (2,224)" },
  { key: "auxiliary", label: "Auxiliary" },
  { key: "all", label: "All" },
];

export default function Organisms({ navigate }) {
  const [networks, setNetworks] = useState([]);
  const [networkId, setNetworkId] = useState(DEFAULT_NETWORK);
  const [all, setAll] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState("atlas");
  const [phylum, setPhylum] = useState("");
  const [sort, setSort] = useState({ key: "n_edges", dir: "desc" });
  const [shown, setShown] = useState(PAGE);

  useEffect(() => {
    api
      .getAtlasNetworks()
      .then((res) => setNetworks(res.data))
      .catch(() => setError("The network list could not be loaded. Check that the backend is running."));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    api
      .getAtlasOwnMetrics(networkId)
      .then((res) => !cancelled && setAll(res.data.rows ?? []))
      .catch((err) => {
        if (cancelled) return;
        setAll([]);
        setError(
          err?.response?.data?.detail ??
            "Genomes could not be loaded. Check that the backend is running and the metrics exist (make metrics-atlas)."
        );
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [networkId]);

  const phyla = useMemo(
    () => [...new Set(all.map((r) => r.gtdb_phylum).filter(Boolean))].sort(),
    [all]
  );

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return all
      .filter((r) => (scope === "all" ? true : scope === "atlas" ? r.in_atlas : !r.in_atlas))
      .filter((r) => !phylum || r.gtdb_phylum === phylum)
      .filter(
        (r) =>
          !term ||
          (r.ncbi_organism ?? "").toLowerCase().includes(term) ||
          (r.gtdb_family ?? "").toLowerCase().includes(term) ||
          r.accession.toLowerCase().includes(term)
      )
      .sort((a, b) => {
        const va = a[sort.key];
        const vb = b[sort.key];
        const cmp =
          typeof va === "number" && typeof vb === "number" ? va - vb : String(va ?? "").localeCompare(String(vb ?? ""));
        return sort.dir === "asc" ? cmp : -cmp;
      });
  }, [all, scope, phylum, search, sort]);

  function toggleSort(key) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));
  }

  const network = networks.find((n) => n.network_id === networkId);

  return (
    <div className="space-y-5 max-w-[1200px]">
      <div>
        <h1 className="text-2xl font-semibold text-[#334155]">Organisms</h1>
        <p className="text-sm text-[#64748B] mt-1">
          All genomes of the database with their own topological metrics in the{" "}
          <span className="font-medium">{network?.name ?? "selected"}</span> network. The atlas has 2,224 genomes (one
          per GTDB genus plus 3 references); auxiliary genomes come from RegPrecise and other sources.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-4 flex flex-wrap items-end gap-4">
        <NetworkSelector networks={networks} value={networkId} onChange={setNetworkId} />
        <div className="flex flex-col gap-1">
          <span className="text-xs text-[#64748B]">Genomes</span>
          <div className="flex rounded-lg border border-[#D9E2E7] overflow-hidden">
            {SCOPES.map((s) => (
              <button
                key={s.key}
                onClick={() => {
                  setScope(s.key);
                  setShown(PAGE);
                }}
                className={`px-3 py-1.5 text-xs transition-colors ${
                  scope === s.key ? "bg-[#3A9D7C] text-white" : "bg-white text-[#64748B] hover:bg-[#F7FAFC]"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[#64748B]">Phylum</span>
          <select
            value={phylum}
            onChange={(e) => {
              setPhylum(e.target.value);
              setShown(PAGE);
            }}
            className={selectClass}
          >
            <option value="">All phyla</option>
            {phyla.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setShown(PAGE);
            }}
            placeholder="Search by name, family or accession"
            className="pl-8 pr-3 py-1.5 text-sm bg-white border border-[#D9E2E7] rounded-lg text-[#334155] placeholder-[#94A3B8] focus:outline-none focus:ring-1 focus:ring-[#3A9D7C] focus:border-[#3A9D7C] w-72"
          />
        </div>
        <span className="ml-auto text-xs text-[#64748B] pb-2">
          {loading ? "Loading…" : `${fmtInt(rows.length)} genomes`}
        </span>
      </div>

      <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm overflow-hidden">
        {error && (
          <div className="bg-[#FEF0F0] border-b border-[#F8BFBF] text-[#D96C6C] text-sm px-5 py-2.5">{error}</div>
        )}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-sm text-[#64748B] gap-2">
            <Loader2 className="w-5 h-5 text-[#3A9D7C] animate-spin" />
            Loading genomes…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#D9E2E7] bg-[#F7FAFC]">
                  {COLUMNS.map((c) => {
                    const active = sort.key === c.key;
                    const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
                    return (
                      <th key={c.key} className={`px-4 py-3 first:pl-5 ${c.numeric ? "text-right" : "text-left"}`}>
                        <button
                          onClick={() => toggleSort(c.key)}
                          className={`inline-flex items-center gap-1 text-[11px] font-medium ${
                            active ? "text-[#176B57]" : "text-[#64748B] hover:text-[#334155]"
                          }`}
                        >
                          {c.label}
                          <Icon size={10} className={active ? "text-[#3A9D7C]" : "text-[#CBD5E1]"} />
                        </button>
                      </th>
                    );
                  })}
                  <th className="pr-5" />
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, shown).map((r) => (
                  <tr
                    key={r.accession}
                    onClick={() => navigate("organism-detail", r.accession)}
                    className="border-b border-[#F0F4F8] hover:bg-[#F7FAFC] cursor-pointer"
                  >
                    <td className="px-4 py-2.5 pl-5">
                      <div className="text-sm text-[#334155]">{r.ncbi_organism ?? r.accession}</div>
                      <div className="text-[11px] font-mono text-[#94A3B8]">
                        {r.accession}
                        {!r.in_atlas && <span className="ml-1.5 font-sans">· auxiliary ({r.selection})</span>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-[#64748B]">{r.gtdb_phylum ?? "—"}</td>
                    <td className="px-4 py-2.5 text-xs text-[#64748B]">{r.gtdb_family ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs text-[#334155]">{fmtInt(r.n_genes)}</td>
                    {["n_tf", "n_targets", "n_edges"].map((k) => (
                      <td key={k} className={`px-4 py-2.5 text-right font-mono text-xs ${r.has_edges ? "text-[#334155]" : "text-[#CBD5E1]"}`}>
                        {fmtInt(r[k])}
                      </td>
                    ))}
                    <td className="pr-5 text-[#CBD5E1]">
                      <ChevronRight size={14} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > shown && (
              <div className="text-center py-3 border-t border-[#F0F4F8]">
                <button
                  onClick={() => setShown((n) => n + PAGE)}
                  className="text-xs text-[#3A9D7C] hover:text-[#176B57] font-medium"
                >
                  Show {Math.min(PAGE, rows.length - shown)} more ({fmtInt(rows.length - shown)} left)
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

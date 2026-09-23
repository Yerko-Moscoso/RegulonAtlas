import { useState, useEffect } from "react";
import { Search, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, Loader2 } from "lucide-react";
import { api } from "../services/api";
import { COMPARISON_ACCESSIONS } from "../constants/comparisonGenomes";

const REFERENCE_ACCESSION = "GCF_000005845.2";

const fmtInt = (n) => (n == null ? "—" : Number(n).toLocaleString("en-US"));

// key: campo del JSON de /genomes; numeric: se puede ordenar.
const COLUMNS = [
  { key: "ncbi_organism", label: "Organism" },
  { key: "gtdb_genus", label: "GTDB genus" },
  { key: "genome_size_mb", label: "Genome (Mb)", numeric: true },
  { key: "n_genes", label: "Genes", numeric: true },
  { key: "n_operons", label: "Operons", numeric: true },
  { key: "n_tfs", label: "TFs", numeric: true },
  { key: "predicted_edges", label: "Predicted", numeric: true },
  { key: "curated_interactions", label: "Curated", numeric: true },
];

export default function Organisms({ navigate }) {
  const [organisms, setOrganisms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({ key: "ncbi_organism", dir: "asc" });

  useEffect(() => {
    let cancelled = false;
    api
      .getGenomesByAccessions(COMPARISON_ACCESSIONS)
      .then((res) => !cancelled && setOrganisms(res.data.items ?? []))
      .catch(() => !cancelled && setError("Genomes could not be loaded. Check that the backend is running."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  function toggleSort(key) {
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }
    );
  }

  const term = search.toLowerCase();
  const rows = organisms
    .filter(
      (o) =>
        (o.ncbi_organism ?? "").toLowerCase().includes(term) ||
        (o.gtdb_genus ?? "").toLowerCase().includes(term) ||
        o.accession.toLowerCase().includes(term)
    )
    .sort((a, b) => {
      const va = a[sort.key];
      const vb = b[sort.key];
      const cmp =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va ?? "").localeCompare(String(vb ?? ""));
      return sort.dir === "asc" ? cmp : -cmp;
    });

  return (
    <div className="space-y-5 max-w-[1200px]">
      <div>
        <h1 className="text-2xl font-semibold text-[#334155]">Organisms</h1>
        <p className="text-sm text-[#64748B] mt-1">
          Enterobacteriaceae genomes with curated regulons in RegPrecise. Predicted edges are
          TF → gene pairs at FIMO p ≤ 1e-{organisms[0]?.network_threshold ?? 5}.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, genus or accession"
            className="pl-8 pr-3 py-1.5 text-sm bg-white border border-[#D9E2E7] rounded-lg text-[#334155] placeholder-[#94A3B8] focus:outline-none focus:ring-1 focus:ring-[#3A9D7C] focus:border-[#3A9D7C] w-72"
          />
        </div>
        <span className="ml-auto text-xs text-[#64748B]">
          {loading ? "Loading…" : `${rows.length} of ${organisms.length} genomes`}
        </span>
      </div>

      <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm overflow-hidden">
        {error && (
          <div className="bg-[#FEF0F0] border-b border-[#F8BFBF] text-[#D96C6C] text-sm px-5 py-2.5">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20 text-sm text-[#64748B] gap-2">
            <Loader2 className="w-5 h-5 text-[#3A9D7C] animate-spin" />
            Loading genomes…
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#D9E2E7] bg-[#F7FAFC]">
                {COLUMNS.map((c) => {
                  const active = sort.key === c.key;
                  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
                  return (
                    <th key={c.key} className="text-left px-4 py-3 first:pl-5">
                      <button
                        onClick={() => toggleSort(c.key)}
                        className={`flex items-center gap-1 text-[11px] font-medium ${
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
              {rows.map((o) => (
                <tr
                  key={o.accession}
                  className="border-b border-[#F7FAFC] last:border-0 hover:bg-[#F7FAFC] cursor-pointer transition-colors group"
                  onClick={() => navigate("organism-detail", o.accession)}
                >
                  <td className="px-4 pl-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-[#334155] italic">{o.ncbi_organism}</span>
                      {o.accession === REFERENCE_ACCESSION && (
                        <span className="text-[10px] bg-[#E8F5F0] text-[#176B57] px-1.5 py-0.5 rounded font-medium">
                          Reference
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-[#94A3B8] font-mono mt-0.5">{o.accession}</div>
                  </td>
                  <td className="px-4 py-3 text-[12px] text-[#64748B] italic">{o.gtdb_genus ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-[12px] text-[#334155]">
                    {o.genome_size_mb != null ? o.genome_size_mb.toFixed(2) : "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-[12px] text-[#334155]">{fmtInt(o.n_genes)}</td>
                  <td className="px-4 py-3 font-mono text-[12px] text-[#334155]">{fmtInt(o.n_operons)}</td>
                  <td className="px-4 py-3 font-mono text-[12px] text-[#334155]">{fmtInt(o.n_tfs)}</td>
                  <td className="px-4 py-3 font-mono text-[12px] text-[#334155]">{fmtInt(o.predicted_edges)}</td>
                  <td className="px-4 py-3 font-mono text-[12px] text-[#334155]">{fmtInt(o.curated_interactions)}</td>
                  <td className="px-4 pr-5 py-3">
                    <ChevronRight size={14} className="text-[#CBD5E1] group-hover:text-[#3A9D7C] transition-colors" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {!loading && !error && rows.length === 0 && (
          <div className="py-16 text-center">
            <p className="text-[#64748B] text-sm">No genomes match “{search}”.</p>
            <button className="mt-2 text-xs text-[#3A9D7C] hover:underline" onClick={() => setSearch("")}>
              Clear search
            </button>
          </div>
        )}
      </div>

      <p className="text-[11px] text-[#94A3B8]">
        Genome size is estimated from the end of the last annotated gene on each contig. TFs are
        transcription factors with at least one predicted target. Curated counts distinct TF → gene
        pairs from RegPrecise 3.2 regulons.
      </p>
    </div>
  );
}
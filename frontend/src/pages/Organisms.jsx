import { useState, useEffect } from "react";
import { Search, ChevronRight, ArrowUpDown, Loader2 } from "lucide-react";
import { api } from "../services/api";
import { COMPARISON_ACCESSIONS } from "../constants/comparisonGenomes";

function StatusBadge({ status }) {
  const map = {
    Validated: "bg-[#E8F5F0] text-[#176B57]",
    Analyzed: "bg-[#DCEFFA] text-[#2563A0]",
    Running: "bg-[#FEF3C7] text-[#92400E]",
    Pending: "bg-[#F7FAFC] text-[#64748B]",
  };
  
  const dotMap = {
    Validated: "bg-[#3A9D7C]",
    Analyzed: "bg-[#3B82B8]",
    Running: "bg-[#E9B949]",
    Pending: "bg-[#94A3B8]",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${map[status] || map.Pending}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotMap[status] || dotMap.Pending}`} />
      {status}
    </span>
  );
}

const groups = ["All", "Proteobacteria", "Firmicutes"];
const statuses = ["All", "Validated", "Analyzed", "Running", "Pending"];

export default function Organisms({ navigate }) {
  const [organisms, setOrganisms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");

  useEffect(() => {
    const fetchGenomes = async () => {
      try {
        setLoading(true);
        const response = await api.getGenomes(0, 3000);

        const mappedData = response.data.items
          .filter((item) => COMPARISON_ACCESSIONS.includes(item.accession))
          .map((item) => ({
            id: item.accession,
            name: item.ncbi_organism || "Organismo Desconocido",
            taxonomy: item.assembly_level || "Unknown",
            group: "Proteobacteria", // Dato temporal para filtros
            genome: item.completeness || 0, // Usamos completitud temporalmente
            genes: 0, // Por conectar a BD
            tfs: 0,   // Por conectar a BD
            predictedInteractions: 0, // Por conectar a BD
            curatedInteractions: 0,   // Por conectar a BD
            status: "Analyzed" // Estado por defecto
          }));

        mappedData.sort((a, b) => a.name.localeCompare(b.name));

        setOrganisms(mappedData);
      } catch (err) {
        console.error("Error al conectar con la API:", err);
        setError("No se pudieron cargar los organismos desde la base de datos.");
      } finally {
        setLoading(false);
      }
    };

    fetchGenomes();
  }, []);

  const filtered = organisms.filter((o) => {
    const matchSearch =
      o.name.toLowerCase().includes(search.toLowerCase()) ||
      o.taxonomy.toLowerCase().includes(search.toLowerCase());
    const matchGroup = groupFilter === "All" || o.group === groupFilter;
    const matchStatus = statusFilter === "All" || o.status === statusFilter;
    return matchSearch && matchGroup && matchStatus;
  });

  return (
    <div className="space-y-5 max-w-[1200px]">
      <div>
        <h1 className="text-2xl font-semibold text-[#334155]">Organisms</h1>
        <p className="text-sm text-[#64748B] mt-1">
          Browse and analyze the bacterial genomes included in the compared set.
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search organisms..."
            className="pl-8 pr-3 py-1.5 text-sm bg-white border border-[#D9E2E7] rounded-lg text-[#334155] placeholder-[#94A3B8] focus:outline-none focus:ring-1 focus:ring-[#3A9D7C] focus:border-[#3A9D7C] w-56"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#64748B]">Taxonomic group</span>
          <select
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
            className="text-sm border border-[#D9E2E7] rounded-lg px-2.5 py-1.5 bg-white text-[#334155] focus:outline-none focus:ring-1 focus:ring-[#3A9D7C]"
          >
            {groups.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#64748B]">Status</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-sm border border-[#D9E2E7] rounded-lg px-2.5 py-1.5 bg-white text-[#334155] focus:outline-none focus:ring-1 focus:ring-[#3A9D7C]"
          >
            {statuses.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <span className="ml-auto text-xs text-[#64748B] flex items-center">
          {loading ? "Cargando..." : `${filtered.length} organism${filtered.length !== 1 ? "s" : ""}`}
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm overflow-hidden min-h-[400px] relative">
        {loading && (
          <div className="absolute inset-0 bg-white/80 flex flex-col items-center justify-center z-10">
            <Loader2 className="w-8 h-8 text-[#3A9D7C] animate-spin mb-2" />
            <p className="text-sm text-[#64748B]">Conectando a MariaDB...</p>
          </div>
        )}
        
        {error && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <p className="text-sm text-red-500">{error}</p>
          </div>
        )}

        <table className="w-full">
          <thead>
            <tr className="border-b border-[#D9E2E7] bg-[#F7FAFC]">
              {[
                "Organism",
                "Taxonomy",
                "Genome (Mb)",
                "Genes",
                "TFs",
                "Predicted",
                "Curated",
                "Status",
                "",
              ].map((h) => (
                <th
                  key={h}
                  className="text-left text-[11px] font-medium text-[#64748B] px-4 py-3 first:pl-5 last:pr-5"
                >
                  <span className="flex items-center gap-1">
                    {h}
                    {["Genome (Mb)", "Genes", "TFs", "Predicted", "Curated"].includes(h) && (
                      <ArrowUpDown size={10} className="text-[#CBD5E1]" />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!loading && filtered.map((org) => (
              <tr
                key={org.id}
                className="border-b border-[#F7FAFC] last:border-0 hover:bg-[#F7FAFC] cursor-pointer transition-colors group"
                onClick={() => navigate("organism-detail", org.id)}
              >
                <td className="px-4 pl-5 py-3">
                  <div className="text-[13px] font-medium text-[#334155]">
                    {org.name}
                  </div>
                  <div className="text-[10px] text-[#94A3B8] font-mono mt-0.5">
                    {org.id}
                  </div>
                </td>
                <td className="px-4 py-3 text-[12px] text-[#64748B]">
                  {org.taxonomy}
                </td>
                <td className="px-4 py-3 font-mono text-[12px] text-[#334155]">
                  {org.genome.toFixed(2)}
                </td>
                <td className="px-4 py-3 font-mono text-[12px] text-[#334155]">
                  {org.genes.toLocaleString()}
                </td>
                <td className="px-4 py-3 font-mono text-[12px] text-[#334155]">
                  {org.tfs}
                </td>
                <td className="px-4 py-3 font-mono text-[12px] text-[#334155]">
                  {org.predictedInteractions.toLocaleString()}
                </td>
                <td className="px-4 py-3 font-mono text-[12px] text-[#334155]">
                  {org.curatedInteractions.toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={org.status} />
                </td>
                <td className="px-4 pr-5 py-3">
                  <ChevronRight
                    size={14}
                    className="text-[#CBD5E1] group-hover:text-[#3A9D7C] transition-colors"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {!loading && !error && filtered.length === 0 && (
          <div className="py-16 text-center">
            <p className="text-[#64748B] text-sm">
              No organisms match the selected filters.
            </p>
            <button
              className="mt-2 text-xs text-[#3A9D7C] hover:underline"
              onClick={() => {
                setSearch("");
                setGroupFilter("All");
                setStatusFilter("All");
              }}
            >
              Clear filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

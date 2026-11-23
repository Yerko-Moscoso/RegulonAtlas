import { useState, useEffect } from "react";
import { ArrowLeft, Loader2, Network, BarChart3, FingerprintPattern, ShieldCheck } from "lucide-react";
import { api } from "../services/api";
import { DEFAULT_GENOME, fmtInt } from "../utils/atlas";
import ReliabilityCard from "../components/ReliabilityCard";
import DownloadButton from "../components/DownloadButton";
import { DEFAULT_MAX_EDGES, graphKey, renderGraphPng } from "../utils/networkLayout";

// Ficha de un genoma del atlas: catálogo (data/cache/atlas/genomes), métricas propias en las 5 redes
// (make metrics-atlas) y validación contra RegPrecise si tiene regulones curados (make validate-atlas).
// Antes leía la ficha del MVP (data/results/mvp, 8 genomas).

const NETWORK_IDS = [1, 2, 3, 4, 5];
const pct = (v) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);
const dec = (v, d = 3) => (v == null ? "—" : Number(v).toFixed(d));

function Stat({ label, value, sub }) {
  return (
    <div className="bg-[#F7FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2.5">
      <div className="text-[11px] text-[#64748B]">{label}</div>
      <div className="text-lg font-semibold text-[#334155] font-mono">{value}</div>
      {sub && <div className="text-[10px] text-[#94A3B8]">{sub}</div>}
    </div>
  );
}

export default function OrganismDetail({ navigate, organismId }) {
  const accession = organismId || DEFAULT_GENOME;
  const [genome, setGenome] = useState(null);
  const [networks, setNetworks] = useState([]);
  const [metrics, setMetrics] = useState({}); // network_id -> fila de /atlas/metrics
  const [validation, setValidation] = useState({}); // network_id -> fila de /atlas/validation/genomes
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([
      api.getGenomeByAccession(accession),
      api.getAtlasNetworks(),
      ...NETWORK_IDS.map((n) => api.getAtlasOwnMetrics(n, { accession })),
    ])
      .then(([g, nets, ...m]) => {
        if (cancelled) return;
        setGenome(g.data);
        setNetworks(nets.data);
        setMetrics(Object.fromEntries(m.map((r, i) => [NETWORK_IDS[i], r.data.rows?.[0]])));
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.response?.data?.detail ?? "The genome could not be loaded. Check that the backend is running.");
      })
      .finally(() => !cancelled && setLoading(false));
    // La validación solo existe para los 312 genomas con regulones curados: un 404 no es un error
    Promise.allSettled(NETWORK_IDS.map((n) => api.getAtlasValidationGenomes(n, "all", { accession }))).then((res) => {
      if (cancelled) return;
      setValidation(
        Object.fromEntries(
          res.map((r, i) => [NETWORK_IDS[i], r.status === "fulfilled" ? r.value.data.rows?.[0] : null])
        )
      );
    });
    return () => {
      cancelled = true;
    };
  }, [accession]);

  const validable = Object.values(validation).some(Boolean);
  const balanced = metrics[3];

  // Las imágenes son las de Regulatory Networks con sus filtros iniciales, una por red
  const downloadReport = async () => {
    const graphs = await Promise.all(
      NETWORK_IDS.map((n) => api.getAtlasGraph(n, genome.accession, { minConfidence: 0, maxEdges: DEFAULT_MAX_EDGES }))
    );
    const images = graphs
      .map((r, i) => ({
        network_id: NETWORK_IDS[i],
        png: renderGraphPng(r.data, graphKey(NETWORK_IDS[i], genome.accession, 0, DEFAULT_MAX_EDGES)),
        shown_edges: r.data.shown_edges,
      }))
      .filter((image) => image.png);
    return api.downloadOrganismReport(genome.accession, images);
  };

  const links = [
    { page: "networks", label: "Regulatory network", icon: Network },
    { page: "metrics", label: "Metrics", icon: BarChart3 },
    { page: "fingerprints", label: "Fingerprint", icon: FingerprintPattern },
    { page: "robustness", label: "Robustness", icon: ShieldCheck },
  ];

  return (
    <div className="space-y-5 max-w-[1100px]">
      <button
        onClick={() => navigate("organisms")}
        className="flex items-center gap-1.5 text-xs text-[#64748B] hover:text-[#334155]"
      >
        <ArrowLeft size={13} /> All organisms
      </button>

      {error && (
        <div className="bg-[#FEF0F0] border border-[#F8BFBF] text-[#D96C6C] text-sm rounded-lg px-4 py-2.5">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-sm text-[#64748B] gap-2">
          <Loader2 className="w-5 h-5 text-[#3A9D7C] animate-spin" />
          Loading genome…
        </div>
      ) : (
        genome && (
          <>
            <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-semibold text-[#334155]">{genome.ncbi_organism ?? genome.accession}</h1>
                  <div className="text-xs font-mono text-[#94A3B8] mt-1">
                    {genome.accession} · {genome.in_atlas ? "atlas genome" : `auxiliary genome (${genome.selection})`}
                  </div>
                  <div className="text-xs text-[#64748B] mt-2">
                    {[genome.gtdb_phylum, genome.gtdb_class, genome.gtdb_order, genome.gtdb_family, genome.gtdb_genus]
                      .filter(Boolean)
                      .join(" › ")}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {links.map((l) => (
                    <button
                      key={l.page}
                      onClick={() => navigate(l.page, genome.accession)}
                      className="flex items-center gap-1.5 text-xs border border-[#D9E2E7] px-2.5 py-1.5 rounded-lg text-[#334155] hover:bg-[#F7FAFC]"
                    >
                      <l.icon size={13} className="text-[#3A9D7C]" />
                      {l.label}
                    </button>
                  ))}
                  <DownloadButton
                    label="Download report"
                    filename={`RegulonAtlas_${genome.accession}_all_networks.xlsx`}
                    request={downloadReport}
                    title="Excel file with this organism and its five complete networks"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mt-5">
                <Stat label="Genes" value={fmtInt(balanced?.n_genes)} />
                <Stat label="Completeness" value={genome.completeness == null ? "—" : `${dec(genome.completeness, 1)}%`} />
                <Stat label="Contamination" value={genome.contamination == null ? "—" : `${dec(genome.contamination, 2)}%`} />
                <Stat label="Assembly level" value={genome.assembly_level ?? "—"} />
                <Stat label="TFs (balanced)" value={fmtInt(balanced?.n_tf)} />
                <Stat label="TF–operon pairs (balanced)" value={fmtInt(balanced?.n_edges)} />
              </div>
            </div>

            <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-5">
              <h3 className="text-sm font-semibold text-[#334155] mb-1">Network in the five atlas networks</h3>
              <p className="text-xs text-[#64748B] mb-3">
                Own topological metrics (make metrics-atlas).{" "}
                {validable
                  ? "Precision and recall against RegPrecise (mode all, universe genome–TF)."
                  : "This genome has no curated regulons in RegPrecise, so it cannot be validated."}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-[#94A3B8] border-b border-[#E2E8F0]">
                      <th className="py-1.5 font-medium">Network</th>
                      <th className="py-1.5 font-medium text-right">TFs</th>
                      <th className="py-1.5 font-medium text-right">Target operons</th>
                      <th className="py-1.5 font-medium text-right">TF–operon pairs</th>
                      <th className="py-1.5 font-medium text-right">Genome targeted</th>
                      {validable && <th className="py-1.5 font-medium text-right">Precision</th>}
                      {validable && <th className="py-1.5 font-medium text-right">Recall</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {networks.map((n) => {
                      const m = metrics[n.network_id];
                      const v = validation[n.network_id];
                      const empty = !m?.has_edges;
                      return (
                        <tr key={n.network_id} className="border-b border-[#F1F5F9]">
                          <td className="py-1.5 text-[#334155]">{n.name}</td>
                          <td className={`py-1.5 text-right font-mono ${empty ? "text-[#CBD5E1]" : ""}`}>{fmtInt(m?.n_tf)}</td>
                          <td className={`py-1.5 text-right font-mono ${empty ? "text-[#CBD5E1]" : ""}`}>{fmtInt(m?.n_targets)}</td>
                          <td className={`py-1.5 text-right font-mono ${empty ? "text-[#CBD5E1]" : ""}`}>{fmtInt(m?.n_edges)}</td>
                          <td className="py-1.5 text-right font-mono text-[#64748B]">{empty ? "—" : pct(m?.frac_genome_targeted)}</td>
                          {validable && <td className="py-1.5 text-right font-mono">{pct(v?.precision)}</td>}
                          {validable && <td className="py-1.5 text-right font-mono">{pct(v?.recall)}</td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {validable && validation[3] && (
                <p className="text-[11px] text-[#94A3B8] mt-2">
                  balanced: {fmtInt(validation[3].TP)} curated pairs recovered of {fmtInt(validation[3].n_gold)}; {fmtInt(validation[3].FP)}{" "}
                  predicted pairs of curated TFs are not in RegPrecise.
                </p>
              )}
            </div>

            <ReliabilityCard accession={genome.accession} networks={networks} />
          </>
        )
      )}
    </div>
  );
}

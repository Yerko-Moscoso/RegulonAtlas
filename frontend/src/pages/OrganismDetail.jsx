import { useState, useEffect } from "react";
import { ArrowLeft, Network, BarChart3, CircleCheck, Loader2 } from "lucide-react";
import { api } from "../services/api";
import { COMPARISON_ACCESSIONS } from "../constants/comparisonGenomes";

// Solo este genoma tiene la validación verificada de punta a punta.
const REFERENCE_ACCESSION = "GCF_000005845.2";

const fmtInt = (n) => (n == null ? "—" : Number(n).toLocaleString("en-US"));
const fmtPct = (x) => (x == null ? "—" : `${(x * 100).toFixed(1)}%`);
const f1Score = (p, r) => (p + r > 0 ? (2 * p * r) / (p + r) : 0);

function Stat({ label, value }) {
  return (
    <div className="bg-white rounded-xl border border-[#D9E2E7] p-4 shadow-sm text-center">
      <div className="text-lg font-bold font-mono text-[#334155]">{value}</div>
      <div className="text-[11px] text-[#64748B] mt-0.5">{label}</div>
    </div>
  );
}

export default function OrganismDetail({ navigate, organismId }) {
  const [org, setOrg] = useState(null);
  const [topology, setTopology] = useState(null);
  const [validation, setValidation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const inSubset = COMPARISON_ACCESSIONS.includes(organismId);
  const isReference = organismId === REFERENCE_ACCESSION;

  useEffect(() => {
    if (!organismId || !inSubset) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");

    Promise.allSettled([
      api.getGenomeByAccession(organismId),
      api.getTopologyMetrics(organismId),
      isReference ? api.getValidationMetrics(organismId) : Promise.resolve(null),
    ]).then(([genomeRes, topoRes, valRes]) => {
      if (cancelled) return;
      if (genomeRes.status === "fulfilled") {
        setOrg(genomeRes.value.data);
      } else {
        setError(`Genome ${organismId} could not be loaded.`);
      }
      setTopology(topoRes.status === "fulfilled" ? topoRes.value.data : null);
      if (valRes.status === "fulfilled" && valRes.value) {
        const threshold = genomeRes.value?.data?.network_threshold ?? 5.0;
        setValidation(
          valRes.value.data.find((v) => v.neg_log10_pvalue_threshold === threshold) ?? null
        );
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [organismId, inSubset, isReference]);

  const back = (
    <button
      onClick={() => navigate("organisms")}
      className="flex items-center gap-1.5 text-sm text-[#64748B] hover:text-[#3A9D7C] mb-3 transition-colors"
    >
      <ArrowLeft size={14} /> Organisms
    </button>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-sm text-[#64748B] gap-2">
        <Loader2 className="w-5 h-5 text-[#3A9D7C] animate-spin" />
        Loading genome…
      </div>
    );
  }

  if (!inSubset || error || !org) {
    return (
      <div>
        {back}
        <p className="text-sm text-[#64748B]">
          {!inSubset
            ? `${organismId} is not one of the genomes analyzed in this dashboard.`
            : error || `No data for ${organismId}.`}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-[1100px]">
      <div>
        {back}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-[#334155] italic">{org.ncbi_organism}</h1>
            <div className="flex items-center gap-3 mt-1 text-sm text-[#64748B]">
              <span className="font-mono">{org.accession}</span>
              <span>{org.assembly_level}</span>
              {isReference && (
                <span className="text-[11px] bg-[#E8F5F0] text-[#176B57] px-2 py-0.5 rounded-full font-medium">
                  Reference genome
                </span>
              )}
            </div>
            <div className="text-[12px] text-[#94A3B8] mt-1">
              GTDB: {[org.gtdb_family, org.gtdb_genus, org.gtdb_species].filter(Boolean).join(" › ")}
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => navigate("metrics", org.accession)}
              className="flex items-center gap-2 px-3.5 py-2 border border-[#D9E2E7] text-[#334155] text-sm rounded-lg hover:bg-[#F7FAFC] transition-colors"
            >
              <BarChart3 size={14} /> Metrics
            </button>
            <button
              onClick={() => navigate("networks", org.accession)}
              className="flex items-center gap-2 px-3.5 py-2 bg-[#3A9D7C] text-white text-sm rounded-lg hover:bg-[#176B57] transition-colors"
            >
              <Network size={14} /> View network
            </button>
          </div>
        </div>
      </div>

      {/* Genome */}
      <div className="grid grid-cols-6 gap-3">
        <Stat label="Genome (Mb)" value={org.genome_size_mb?.toFixed(2) ?? "—"} />
        <Stat label="Completeness" value={org.completeness != null ? `${org.completeness}%` : "—"} />
        <Stat label="Genes" value={fmtInt(org.n_genes)} />
        <Stat label="Operons" value={fmtInt(org.n_operons)} />
        <Stat label="TFs with targets" value={fmtInt(org.n_tfs)} />
        <Stat label="Curated interactions" value={fmtInt(org.curated_interactions)} />
      </div>

      <div className="grid grid-cols-3 gap-5">
        {/* Network metrics */}
        <div className="col-span-2 bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-5">
          <h2 className="text-sm font-semibold text-[#334155]">Predicted network</h2>
          <p className="text-[11px] text-[#64748B] mt-0.5 mb-4">
            TF → gene pairs at FIMO p ≤ 1e-{org.network_threshold}
          </p>
          {topology ? (
            <div className="grid grid-cols-5 gap-3">
              {[
                ["Nodes", fmtInt(topology.nodos)],
                ["Edges", fmtInt(topology.aristas)],
                ["Density", topology.densidad.toFixed(4)],
                ["Avg degree", topology.grado_medio.toFixed(2)],
                [`Hubs (> ${topology.hub_degree_threshold})`, fmtInt(topology.hubs)],
              ].map(([label, value]) => (
                <div key={label} className="bg-[#F7FAFC] rounded-lg border border-[#D9E2E7] p-3 text-center">
                  <div className="text-base font-bold font-mono text-[#334155]">{value}</div>
                  <div className="text-[10px] text-[#64748B] mt-0.5">{label}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-[#64748B]">No predicted network at this threshold.</p>
          )}
        </div>

        {/* Validation */}
        <div className="bg-white rounded-xl border border-[#D9E2E7] shadow-sm p-5">
          <h2 className="text-sm font-semibold text-[#334155]">Validation</h2>
          {validation ? (
            <>
              <p className="text-[11px] text-[#64748B] mt-0.5 mb-4">vs RegPrecise curated regulons</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  ["Precision", validation.precision, "#3A9D7C"],
                  ["Recall", validation.recall, "#3B82B8"],
                  ["F1", f1Score(validation.precision, validation.recall), "#55B8A5"],
                ].map(([label, value, color]) => (
                  <div key={label} className="rounded-lg border border-[#D9E2E7] p-2.5 text-center">
                    <div className="text-base font-bold font-mono" style={{ color }}>
                      {fmtPct(value)}
                    </div>
                    <div className="text-[10px] text-[#64748B]">{label}</div>
                  </div>
                ))}
              </div>
              <button
                onClick={() => navigate("validation")}
                className="mt-4 flex items-center gap-1 text-xs text-[#3A9D7C] hover:text-[#176B57]"
              >
                <CircleCheck size={12} /> Curve across thresholds
              </button>
            </>
          ) : (
            <p className="text-[12px] text-[#64748B] mt-2">
              Validation is reported for the reference genome, E. coli K-12 MG1655.
            </p>
          )}
        </div>
      </div>

      <div className="bg-[#E8F5F0] rounded-lg p-4 border border-[#B8DDD0] text-xs text-[#176B57] space-y-0.5">
        <div className="font-semibold mb-1">Data sources</div>
        <div>Genome and annotation: NCBI RefSeq {org.accession}</div>
        <div>Taxonomy: GTDB R232</div>
        <div>Binding motifs (PWMs): RegPrecise 3.2 and PRODORIC</div>
        <div>Curated regulons: RegPrecise 3.2</div>
      </div>
    </div>
  );
}
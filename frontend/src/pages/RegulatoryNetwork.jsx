import { useState, useEffect, useMemo, useRef } from "react";
import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose";
import CytoscapeComponent from "react-cytoscapejs";
import { Search, X, Info, Loader2 } from "lucide-react";
import { api } from "../services/api";
import { COMPARISON_ACCESSIONS } from "../constants/comparisonGenomes";

cytoscape.use(fcose);

// La red es TF -> gen. (Las aristas a operones vendrán cuando la red use
// operon_id; por ahora no hay nodos de operón y no se muestran en la leyenda.)
const NODE_COLOR = { TF: "#3A9D7C", Gene: "#3B82B8" };
const NODE_BORDER = { TF: "#176B57", Gene: "#2563A0" };

const CYTOSCAPE_STYLESHEET = [
  {
    selector: "node",
    style: {
      "background-color": (ele) => NODE_COLOR[ele.data("node_type")] || "#94A3B8",
      "border-color": (ele) => NODE_BORDER[ele.data("node_type")] || "#64748B",
      "border-width": 1.5,
      label: (ele) => (ele.data("node_type") === "TF" ? ele.data("label") : ""),
      "font-size": 9,
      color: "#334155",
      "text-valign": "bottom",
      "text-margin-y": 4,
      width: (ele) => (ele.data("node_type") === "TF" ? 22 : 12),
      height: (ele) => (ele.data("node_type") === "TF" ? 22 : 12),
    },
  },
  {
    selector: "node:selected",
    style: {
      "border-width": 4,
      "border-color": "#176B57",
      label: "data(label)",
      "font-size": 11,
      "font-weight": "bold",
      "z-index": 999,
    },
  },
  {
    selector: "node.highlighted",
    style: {
      "border-width": 4,
      "border-color": "#E9B949",
      label: "data(label)",
      "font-size": 10,
      "z-index": 998,
    },
  },
  { selector: "node.dimmed, edge.dimmed", style: { opacity: 0.15 } },
  {
    selector: "edge",
    style: {
      width: 1.5,
      "line-color": "#E2E8F0",
      "target-arrow-color": "#E2E8F0",
      "target-arrow-shape": "triangle",
      "curve-style": "bezier",
      "arrow-scale": 0.7,
      opacity: 0.6,
    },
  },
  {
    selector: "edge:selected",
    style: {
      "line-color": "#3A9D7C",
      "target-arrow-color": "#3A9D7C",
      width: 2.5,
      opacity: 1,
      "z-index": 999,
    },
  },
];

const FCOSE_LAYOUT = {
  name: "fcose",
  quality: "default",
  animate: false,
  randomize: true,
  nodeRepulsion: 6500,
  idealEdgeLength: 50,
  padding: 30,
};

const fmtInt = (n) => (n == null ? "—" : Number(n).toLocaleString("en-US"));
// Origen del motivo según el prefijo de su clave.
const motifSource = (key) =>
  key.startsWith("RG") ? "RegPrecise" : key.startsWith("MX") ? "PRODORIC" : "—";

export default function RegulatoryNetwork({ initialOrganism }) {
  const [organismList, setOrganismList] = useState([]);
  const [organism, setOrganism] = useState("");
  const [loadingGenomes, setLoadingGenomes] = useState(true);

  const [graph, setGraph] = useState(null); // respuesta completa de /graphs
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedNode, setSelectedNode] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const cyRef = useRef(null);

  // Selector: solo los genomas del análisis, pedidos directamente al backend.
  useEffect(() => {
    let cancelled = false;
    api
      .getGenomesByAccessions(COMPARISON_ACCESSIONS)
      .then((res) => {
        if (cancelled) return;
        const list = (res.data.items ?? [])
          .map((g) => ({ id: g.accession, label: g.ncbi_organism || g.accession }))
          .sort((a, b) => a.label.localeCompare(b.label));
        setOrganismList(list);
        const start = list.find((o) => o.id === initialOrganism) ?? list[0];
        if (start) setOrganism(start.id);
        else {
          setLoading(false);
          setError("No genomes found.");
        }
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
        setError("The genome list could not be loaded. Check that the backend is running.");
      })
      .finally(() => !cancelled && setLoadingGenomes(false));
    return () => {
      cancelled = true;
    };
  }, [initialOrganism]);

  useEffect(() => {
    if (!organism) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    setSelectedNode(null);
    setSearchTerm("");

    api
      .getNetworkGraph(organism)
      .then((res) => !cancelled && setGraph(res.data))
      .catch((err) => {
        if (cancelled) return;
        setGraph(null);
        setError(
          err.response?.status === 404
            ? `No predicted interactions for ${organism} at this threshold.`
            : "The regulatory network could not be loaded."
        );
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [organism]);

  const rawNodes = graph?.elements?.nodes ?? [];
  const rawEdges = graph?.elements?.edges ?? [];
  const cyElements = useMemo(() => [...rawNodes, ...rawEdges], [graph]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resaltado por búsqueda
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().removeClass("dimmed highlighted");
    const term = searchTerm.trim().toLowerCase();
    if (!term) return;
    const matched = cy.nodes().filter((n) => (n.data("label") ?? "").toLowerCase().includes(term));
    if (matched.length > 0) {
      cy.elements().addClass("dimmed");
      matched.removeClass("dimmed").addClass("highlighted");
      matched.connectedEdges().removeClass("dimmed");
      matched.connectedEdges().connectedNodes().removeClass("dimmed");
    }
  }, [searchTerm, cyElements]);

  const nodeById = useMemo(() => new Map(rawNodes.map((n) => [n.data.id, n.data])), [graph]); // eslint-disable-line react-hooks/exhaustive-deps
  const selected = selectedNode ? nodeById.get(selectedNode) : null;

  // Conexiones del nodo seleccionado, ordenadas por p-value (más fuerte primero).
  const connections = useMemo(() => {
    if (!selected) return [];
    const isTF = selected.node_type === "TF";
    return rawEdges
      .filter((e) => (isTF ? e.data.source : e.data.target) === selected.id)
      .map((e) => {
        const otherId = isTF ? e.data.target : e.data.source;
        return { id: otherId, label: nodeById.get(otherId)?.label ?? otherId, weight: e.data.weight };
      })
      .sort((a, b) => b.weight - a.weight);
  }, [selected, graph]); // eslint-disable-line react-hooks/exhaustive-deps

  const threshold = graph?.neg_log10_p_threshold;

  return (
    <div className="space-y-4 h-full flex flex-col w-full">
      <div>
        <h1 className="text-2xl font-semibold text-[#334155]">Regulatory Network</h1>
        <p className="text-sm text-[#64748B] mt-1">
          Predicted transcription factor → target gene interactions from FIMO motif scanning.
        </p>
      </div>

      <div className="bg-white border border-[#D9E2E7] rounded-xl p-3 flex flex-wrap items-center gap-4 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#64748B]">Organism</span>
          <select
            value={organism}
            onChange={(e) => setOrganism(e.target.value)}
            disabled={loadingGenomes}
            className="text-sm border border-[#D9E2E7] rounded-lg px-2.5 py-1.5 bg-white text-[#334155] focus:outline-none focus:ring-1 focus:ring-[#3A9D7C] min-w-[220px] disabled:bg-gray-50 disabled:text-gray-400"
          >
            {loadingGenomes ? (
              <option>Loading…</option>
            ) : (
              organismList.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))
            )}
          </select>
        </div>

        {graph && (
          <div className="ml-auto text-xs text-[#64748B] text-right">
            <div className="font-mono text-[#334155]">
              {fmtInt(rawNodes.length)} nodes · {fmtInt(graph.shown_edges)} of {fmtInt(graph.total_edges)} edges
            </div>
            <div className="text-[11px] mt-0.5">
              Showing the {fmtInt(graph.shown_edges)} strongest edges (lowest FIMO p-value), network at p ≤ 1e-{threshold}
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-4 flex-1 min-h-[500px]">
        <div className="flex-1 bg-white border border-[#D9E2E7] rounded-xl shadow-sm overflow-hidden relative">
          {loading && (
            <div className="absolute inset-0 bg-white/80 flex flex-col items-center justify-center z-20">
              <Loader2 className="w-8 h-8 text-[#3A9D7C] animate-spin mb-2" />
              <p className="text-sm text-[#64748B]">Loading regulatory network…</p>
            </div>
          )}

          {!loading && error && (
            <div className="absolute inset-0 flex items-center justify-center z-20 px-8">
              <p className="text-sm text-[#D96C6C] text-center font-medium">{error}</p>
            </div>
          )}

          <div className="absolute top-4 right-4 z-10">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Find TF or gene"
                className="pl-9 pr-3 py-2 text-sm bg-white border border-[#D9E2E7] rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-[#3A9D7C] w-48"
              />
            </div>
          </div>

          {!loading && !error && graph && (
            <CytoscapeComponent
              elements={cyElements}
              stylesheet={CYTOSCAPE_STYLESHEET}
              layout={FCOSE_LAYOUT}
              style={{ width: "100%", height: "100%" }}
              cy={(cy) => {
                cyRef.current = cy;
                cy.removeListener("tap");
                cy.on("tap", "node", (evt) => {
                  const id = evt.target.id();
                  setSelectedNode((prev) => (prev === id ? null : id));
                });
                cy.on("tap", (evt) => {
                  if (evt.target === cy) setSelectedNode(null);
                });
              }}
            />
          )}

          <div className="absolute bottom-4 left-4 bg-white border border-[#D9E2E7] rounded-lg p-3 shadow-sm">
            <div className="text-xs font-semibold text-[#64748B] mb-2">Legend</div>
            {[
              { type: "TF", label: "Transcription factor" },
              { type: "Gene", label: "Target gene" },
            ].map((l) => (
              <div key={l.type} className="flex items-center gap-2 mb-1.5 last:mb-0">
                <div className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: NODE_COLOR[l.type] }} />
                <span className="text-xs text-[#64748B]">{l.label}</span>
              </div>
            ))}
          </div>
        </div>

        {selected ? (
          <div className="w-72 bg-white border border-[#D9E2E7] rounded-xl shadow-sm p-6 shrink-0 overflow-y-auto flex flex-col">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h3 className="text-xl font-bold text-[#334155] break-all leading-none">{selected.label}</h3>
                <p className="text-[13px] text-[#64748B] mt-1.5">
                  {selected.node_type === "TF" ? "Transcription factor" : "Target gene"}
                </p>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                aria-label="Close details"
                className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-[#F0F4F8] shrink-0 transition-colors"
              >
                <X size={15} className="text-[#94A3B8]" />
              </button>
            </div>

            <dl className="space-y-2.5 my-5 text-[13px]">
              <div className="flex justify-between">
                <dt className="text-[#64748B]">
                  {selected.node_type === "TF" ? "Targets in view" : "Regulators in view"}
                </dt>
                <dd className="font-mono text-[#334155]">{connections.length}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#64748B]">FIMO threshold</dt>
                <dd className="font-mono text-[#334155]">p ≤ 1e-{threshold}</dd>
              </div>
            </dl>

            {selected.node_type === "TF" && selected.motifs?.length > 0 && (
              <div className="mb-5">
                <div className="text-[13px] font-semibold text-[#334155] mb-2">
                  Binding motifs ({selected.motifs.length})
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                  {selected.motifs.map((m) => (
                    <div key={m} className="flex justify-between text-[12px]">
                      <span className="font-mono text-[#334155]">{m}</span>
                      <span className="text-[#94A3B8]">{motifSource(m)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t border-[#D9E2E7] mb-4" />

            <div className="flex-1 min-h-0">
              <div className="flex justify-between text-[13px] font-semibold text-[#334155] mb-3">
                <span>{selected.node_type === "TF" ? "Predicted targets" : "Regulated by"}</span>
                <span className="text-[11px] font-normal text-[#94A3B8]">−log10 p</span>
              </div>
              <div className="space-y-1.5">
                {connections.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedNode(c.id)}
                    className="w-full flex items-center gap-2.5 text-left hover:bg-[#F7FAFC] rounded px-1 -mx-1"
                  >
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: selected.node_type === "TF" ? NODE_COLOR.Gene : NODE_COLOR.TF }}
                    />
                    <span className="text-[13px] font-mono text-[#334155] truncate flex-1" title={c.label}>
                      {c.label}
                    </span>
                    <span className="text-[11px] font-mono text-[#94A3B8]">{c.weight.toFixed(1)}</span>
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-[#94A3B8] mt-3">
                Only the edges drawn in this view are listed; the full network has{" "}
                {fmtInt(graph?.total_edges)} edges.
              </p>
            </div>
          </div>
        ) : (
          <div className="w-72 bg-white border border-[#D9E2E7] border-dashed rounded-xl flex items-center justify-center shrink-0">
            <div className="text-center px-6">
              <Info size={24} className="text-[#CBD5E1] mx-auto mb-3" />
              <p className="text-sm text-[#94A3B8]">Click a node to see its binding motifs and connections.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
import { useState, useEffect, useMemo, useRef } from "react";
import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose";
import CytoscapeComponent from "react-cytoscapejs";
import { Search, Filter, X, Info, Loader2 } from "lucide-react";
import { api } from "../services/api";
import { COMPARISON_ACCESSIONS } from "../constants/comparisonGenomes";

cytoscape.use(fcose);

const NODE_COLOR = {
  TF: "#3A9D7C",
  Gene: "#3B82B8",
  Operon: "#55B8A5",
};
const NODE_BORDER = {
  TF: "#176B57",
  Gene: "#2563A0",
  Operon: "#176B57",
};

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
  {
    selector: "node.dimmed, edge.dimmed",
    style: { opacity: 0.15 },
  },
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

export default function RegulatoryNetwork() {
  const [organismList, setOrganismList] = useState([]);
  const [organism, setOrganism] = useState("");
  const [loadingGenomes, setLoadingGenomes] = useState(true);

  const [rawNodes, setRawNodes] = useState([]);
  const [rawEdges, setRawEdges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedNode, setSelectedNode] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  const cyRef = useRef(null);

  useEffect(() => {
    const fetchOrganisms = async () => {
      try {
        setLoadingGenomes(true);
        const response = await api.getGenomes(0, 3000);
        const fetchedOrgs = response.data.items
          .filter((item) => COMPARISON_ACCESSIONS.includes(item.accession))
          .map((item) => ({
            id: item.accession,
            label: item.ncbi_organism || item.accession,
          }))
          .sort((a, b) => a.label.localeCompare(b.label));
        
        setOrganismList(fetchedOrgs);
        if (fetchedOrgs.length > 0) {
          setOrganism(fetchedOrgs[0].id);
        } else {
          setLoading(false);
          setError("No genomes from the compared set were found in the database.");
        }
      } catch (err) {
        console.error("Error fetching organisms list:", err);
        setLoading(false);
        setError("Could not load the organism list from the server.");
      } finally {
        setLoadingGenomes(false);
      }
    };
    fetchOrganisms();
  }, []);

  useEffect(() => {
    if (!organism) return;

    const fetchGraph = async () => {
      try {
        setLoading(true);
        setError("");
        setSelectedNode(null);
        
        const response = await api.getNetworkGraph(organism);
        
        const elements = response.data?.elements || { nodes: [], edges: [] };
        setRawNodes(elements.nodes || []);
        setRawEdges(elements.edges || []);
      } catch (err) {
        console.error("Error loading regulatory network:", err);
        if (err.response?.status === 404) {
          setError(`The graph for ${organism} hasn't been generated yet.`);
        } else {
          setError("Could not load the regulatory network from the server.");
        }
        setRawNodes([]);
        setRawEdges([]);
      } finally {
        setLoading(false);
      }
    };

    fetchGraph();
  }, [organism]);

  const cyElements = useMemo(
    () => [...rawNodes, ...rawEdges],
    [rawNodes, rawEdges]
  );

  const hasNothingToRender = !loading && !error && rawEdges.length === 0 && rawNodes.length > 0;

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    cy.elements().removeClass("dimmed highlighted");

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const matched = cy.nodes().filter((n) => 
        n.data("label")?.toLowerCase().includes(term) || 
        n.id()?.toLowerCase().includes(term)
      );
      if (matched.length > 0) {
        cy.elements().addClass("dimmed");
        matched.removeClass("dimmed").addClass("highlighted");
        matched.connectedEdges().removeClass("dimmed");
      }
    }
  }, [searchTerm, cyElements]);

  const selectedNodeString = selectedNode ? String(selectedNode) : null;
  const selectedNodeData = rawNodes.find((n) => String(n.data.id) === selectedNodeString)?.data;

  const selectedTargets = selectedNodeString
    ? rawEdges.filter((e) => String(e.data.source) === selectedNodeString).map((e) => {
        const targetNode = rawNodes.find(n => String(n.data.id) === String(e.data.target));
        return { id: e.data.target, label: targetNode?.data?.label || e.data.target };
      })
    : [];
    
  const selectedRegulators = selectedNodeString
    ? rawEdges.filter((e) => String(e.data.target) === selectedNodeString).map((e) => {
        const sourceNode = rawNodes.find(n => String(n.data.id) === String(e.data.source));
        return { id: e.data.source, label: sourceNode?.data?.label || e.data.source };
      })
    : [];

  return (
    <div className="space-y-4 h-full flex flex-col w-full">
      <div>
        <h1 className="text-2xl font-semibold text-[#334155]">Regulatory Network</h1>
        <p className="text-sm text-[#64748B] mt-1">
          Predicted transcriptional regulation network — TF → Gene / Operon.
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
              <option>Loading...</option>
            ) : (
              organismList.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))
            )}
          </select>
        </div>

      <div className="flex items-center gap-2 text-xs text-[#64748B] ml-auto">
        <span className="font-mono bg-[#F7FAFC] border border-[#D9E2E7] px-3 py-1.5 rounded-lg">
          {rawNodes.length.toLocaleString()} nodes · {rawEdges.length.toLocaleString()} edges
        </span>
      </div>
      </div>

      <div className="flex gap-4 flex-1 min-h-[500px]">
        <div className="flex-1 bg-white border border-[#D9E2E7] rounded-xl shadow-sm overflow-hidden relative">
          {loading && (
            <div className="absolute inset-0 bg-white/80 flex flex-col items-center justify-center z-20">
              <Loader2 className="w-8 h-8 text-[#3A9D7C] animate-spin mb-2" />
              <p className="text-sm text-[#64748B]">Loading regulatory network...</p>
            </div>
          )}
          
          {!loading && error && (
            <div className="absolute inset-0 flex items-center justify-center z-20 px-8">
              <p className="text-sm text-red-500 text-center font-medium">{error}</p>
            </div>
          )}
          
          {hasNothingToRender && (
            <div className="absolute inset-0 flex items-center justify-center z-10 px-8">
              <div className="text-center max-w-sm">
                <Info size={24} className="text-[#CBD5E1] mx-auto mb-3" />
                <p className="text-sm text-[#64748B]">
                  This graph has <span className="font-mono font-medium">{rawNodes.length.toLocaleString()}</span> nodes
                  but 0 loaded interactions. Try a different organism.
                </p>
              </div>
            </div>
          )}

          <div className="absolute top-4 right-4 z-10">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search node..."
                className="pl-9 pr-3 py-2 text-sm bg-white border border-[#D9E2E7] rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-[#3A9D7C] w-48"
              />
            </div>
          </div>

          {!loading && !error && !hasNothingToRender && (
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
              { type: "TF", label: "Transcription Factor" },
              { type: "Gene", label: "Gene" },
              { type: "Operon", label: "Operon" },
            ].map((l) => (
              <div key={l.type} className="flex items-center gap-2 mb-1.5 last:mb-0">
                <div className="w-3.5 h-3.5 rounded-full border-2" style={{ borderColor: NODE_COLOR[l.type], backgroundColor: l.type === 'TF' ? NODE_COLOR[l.type] : 'transparent' }} />
                <span className="text-xs text-[#64748B]">{l.label}</span>
              </div>
            ))}
          </div>
        </div>

        {selectedNodeData ? (
          <div className="w-72 bg-white border border-[#D9E2E7] rounded-xl shadow-sm p-6 shrink-0 overflow-y-auto flex flex-col">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h3 className="text-xl font-bold text-[#334155] break-all leading-none">
                  {selectedNodeData.label || selectedNodeData.id}
                </h3>
                <p className="text-[13px] text-[#64748B] mt-1.5 leading-snug">
                  {selectedNodeData.description || (selectedNodeData.node_type === "TF" ? "Transcription regulator" : "Predicted gene target")}
                </p>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-[#F0F4F8] shrink-0 transition-colors"
              >
                <X size={15} className="text-[#94A3B8]" />
              </button>
            </div>

            <div className="space-y-2.5 my-5 text-[13px]">
              <div className="flex justify-between items-center">
                <span className="text-[#64748B]">Type</span>
                <span className="font-mono text-[#334155]">
                  {selectedNodeData.node_type === "TF" ? "Transcription Factor" : selectedNodeData.node_type}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#64748B]">{selectedNodeData.node_type === "TF" ? "Targets" : "Regulators"}</span>
                <span className="font-mono text-[#334155]">
                  {selectedNodeData.node_type === "TF" ? selectedTargets.length : selectedRegulators.length}
                </span>
              </div>
              
              {selectedNodeData.node_type === "TF" && (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-[#64748B]">PWM</span>
                    <span className="font-mono text-[#334155]">{selectedNodeData.pwm || selectedNodeData.id}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#64748B]">Source</span>
                    <span className="font-mono text-[#334155]">{selectedNodeData.source || "RegPrecise"}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#64748B]">Score threshold</span>
                    <span className="font-mono text-[#334155]">{selectedNodeData.score_threshold || "0.85"}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#64748B]">Q-value</span>
                    <span className="font-mono text-[#334155]">{selectedNodeData.q_value || "0.01"}</span>
                  </div>
                </>
              )}
            </div>

            <div className="border-t border-[#D9E2E7] mb-4" />

            {selectedNodeData.node_type === "TF" ? (
              <div className="flex-1">
                <div className="text-[13px] font-semibold text-[#334155] mb-3">Predicted regulatory targets</div>
                <div className="space-y-2 overflow-y-auto pr-1">
                  {selectedTargets.map((t) => (
                    <div key={t.id} className="flex items-center gap-2.5">
                      <div className="w-2 h-2 rounded-full bg-[#3B82B8] shrink-0" />
                      <span className="text-[13px] font-mono text-[#334155] truncate" title={t.label}>{t.label}</span>
                    </div>
                  ))}
                  {selectedTargets.length === 0 && (
                    <p className="text-[13px] text-[#94A3B8] italic">No targets loaded at this threshold.</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1">
                <div className="text-[13px] font-semibold text-[#334155] mb-3">Regulated by</div>
                <div className="space-y-2 overflow-y-auto pr-1">
                  {selectedRegulators.map((r) => (
                    <div key={r.id} className="flex items-center gap-2.5">
                      <div className="w-2 h-2 rounded-full bg-[#3A9D7C] shrink-0" />
                      <span className="text-[13px] font-mono text-[#334155] truncate" title={r.label}>{r.label}</span>
                    </div>
                  ))}
                  {selectedRegulators.length === 0 && (
                    <p className="text-[13px] text-[#94A3B8] italic">No regulators loaded at this threshold.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="w-72 bg-white border border-[#D9E2E7] border-dashed rounded-xl flex items-center justify-center shrink-0">
            <div className="text-center px-6">
              <Info size={24} className="text-[#CBD5E1] mx-auto mb-3" />
              <p className="text-sm text-[#94A3B8]">
                Click a node to view its details and connections.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect, useMemo, useRef } from "react";
import CytoscapeComponent from "react-cytoscapejs";
import { Search, X, Info, Loader2 } from "lucide-react";
import { api } from "../services/api";
import NetworkSelector from "../components/NetworkSelector";
import { networkFilters } from "../utils/atlas";
import CoverageNote from "../components/CoverageNote";
import DownloadButton from "../components/DownloadButton";
import {
  CONFIDENCE_OPTIONS,
  CYTOSCAPE_STYLESHEET,
  DEFAULT_GENOME,
  DEFAULT_NETWORK,
  EDGE_LIMITS,
  LABEL_ALL_NODES,
  NODE_COLOR,
  PNG_OPTIONS,
  PRESET_LAYOUT,
  computePositions,
  fitView,
  hashString,
  readSeed,
  saveSeed,
} from "../utils/networkLayout";


const fmtInt = (n) => (n == null ? "—" : Number(n).toLocaleString("en-US"));
// Origen del motivo según el prefijo de su clave.
const motifSource = (key) =>
  key.startsWith("RG") ? "RegPrecise" : key.startsWith("MX") ? "PRODORIC" : "—";

const selectClass =
  "text-sm border border-[#D9E2E7] rounded-lg px-2.5 py-1.5 bg-white text-[#334155] focus:outline-none focus:ring-1 focus:ring-[#3A9D7C] disabled:bg-gray-50 disabled:text-gray-400";

// Buscador de organismos: se escribe parte del nombre o del accession y se
// elige una sugerencia con el ratón o con las flechas + Enter.
function OrganismSearch({ options, value, onChange, disabled }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef(null);

  const current = options.find((o) => o.id === value);

  // Todos los organismos; al escribir se filtran por nombre o accession
  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return options;
    return options.filter((o) => o.label.toLowerCase().includes(term) || o.id.toLowerCase().includes(term));
  }, [options, query]);

  // Mantiene visible la sugerencia activa al moverse con las flechas
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (option) => {
    onChange(option.id);
    setQuery("");
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && open && matches[active]) {
      e.preventDefault();
      choose(matches[active]);
    } else if (e.key === "Escape") {
      setQuery("");
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#94A3B8] pointer-events-none" />
      <input
        role="combobox"
        aria-label="Search organism or accession"
        aria-expanded={open}
        aria-controls="organism-suggestions"
        aria-activedescendant={open && matches[active] ? `organism-${matches[active].id}` : undefined}
        disabled={disabled}
        value={open ? query : current?.label ?? ""}
        placeholder={disabled ? "Loading…" : "Search organism or accession"}
        onFocus={() => {
          setOpen(true);
          setActive(0);
        }}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        className="text-sm border border-[#D9E2E7] rounded-lg pl-8 pr-2.5 py-1.5 w-80 bg-white text-[#334155] focus:outline-none focus:ring-1 focus:ring-[#3A9D7C] disabled:bg-gray-50 disabled:text-gray-400"
      />

      {open && !disabled && (
        <ul
          id="organism-suggestions"
          role="listbox"
          ref={listRef}
          className="absolute z-30 mt-1 w-[26rem] max-h-72 overflow-y-auto bg-white border border-[#D9E2E7] rounded-lg shadow-lg py-1"
        >
          {matches.length === 0 && (
            <li className="px-3 py-2 text-sm text-[#94A3B8]">No organism matches “{query}”.</li>
          )}
          {matches.map((o, i) => (
            <li
              key={o.id}
              id={`organism-${o.id}`}
              data-index={i}
              role="option"
              aria-selected={o.id === value}
              // onMouseDown en vez de onClick: se ejecuta antes del blur del input
              onMouseDown={(e) => {
                e.preventDefault();
                choose(o);
              }}
              onMouseEnter={() => setActive(i)}
              className={`px-3 py-1.5 cursor-pointer flex items-baseline justify-between gap-3 ${
                i === active ? "bg-[#F0F7F4]" : ""
              }`}
            >
              <span
                className={`text-sm truncate ${
                  o.id === value ? "font-semibold text-[#176B57]" : o.nEdges > 0 ? "text-[#334155]" : "text-[#94A3B8]"
                }`}
              >
                {o.label}
              </span>
              <span className="text-[11px] font-mono text-[#94A3B8] shrink-0">
                {o.id}, {o.nEdges > 0 ? `${fmtInt(o.nEdges)} edges` : "no edges"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function RegulatoryNetwork({ initialOrganism }) {
  // Redes disponibles
  const [networks, setNetworks] = useState([]);
  const [networkId, setNetworkId] = useState(DEFAULT_NETWORK);

  // Genomas con aristas en la red elegida
  const [organismList, setOrganismList] = useState([]);
  const [organism, setOrganism] = useState("");
  const [loadingGenomes, setLoadingGenomes] = useState(true);

  // Filtros del subgrafo
  const [minConfidence, setMinConfidence] = useState(0);
  const [maxEdges, setMaxEdges] = useState(500);

  const [graph, setGraph] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedNode, setSelectedNode] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const cyRef = useRef(null);
  const fittedCyRef = useRef(null); // última instancia de Cytoscape ya encuadrada
  const panelRef = useRef(null);
  // Posiciones ya calculadas en esta sesión, por subgrafo (red + organismo + filtros)
  const positionsRef = useRef(new Map());
  const seedsRef = useRef(new Map());
  const [layoutVersion, setLayoutVersion] = useState(0);

  // 1. Lista de redes
  useEffect(() => {
    api
      .getAtlasNetworks()
      .then((res) => setNetworks(res.data))
      .catch(() => setError("The network list could not be loaded. Check that the backend is running."));
  }, []);

  // 2. Genomas de la red elegida; se conserva el organismo actual si sigue presente
  useEffect(() => {
    let cancelled = false;
    setLoadingGenomes(true);
    api
      .getAtlasGenomes(networkId)
      .then((res) => {
        if (cancelled) return;
        const list = res.data.map((g) => ({
          id: g.accession,
          label: g.ncbi_organism || g.accession,
          nEdges: g.n_edges,
          selection: g.selection,
          muted: !(g.n_edges > 0),
          meta: g.n_edges > 0 ? `${fmtInt(g.n_edges)} edges` : "no edges"
        }));
        setOrganismList(list);
        // La lista trae todos los genomas, así que el organismo elegido siempre se conserva.
        // Solo en la primera carga se usa initialOrganism o E. coli K-12.
        setOrganism((prev) => {
          if (prev && list.some((o) => o.id === prev)) return prev;
          const start = [initialOrganism, DEFAULT_GENOME].find((id) => list.some((o) => o.id === id));
          return start ?? list[0]?.id ?? "";
        });
        if (list.length === 0) {
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
  }, [networkId, initialOrganism]);

  // 3. Subgrafo
  useEffect(() => {
    if (!organism) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    setSelectedNode(null);
    setSearchTerm("");

    api
      .getAtlasGraph(networkId, organism, { minConfidence, maxEdges })
      .then((res) => !cancelled && setGraph({ ...res.data, key: `${networkId}|${organism}|${minConfidence}|${maxEdges}` }))
      .catch((err) => {
        if (cancelled) return;
        setGraph(null);
        setError(
          err.response?.status === 404
            ? `${organism} has no edges in this network.`
            : "The regulatory network could not be loaded."
        );
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [networkId, organism, minConfidence, maxEdges]);

  const network = networks.find((n) => n.network_id === networkId);
  const filters = networkFilters(network);
  const organismsWithEdges = useMemo(() => organismList.filter((o) => o.nEdges > 0).length, [organismList]);
  const organismLabel = organismList.find((o) => o.id === organism)?.label ?? organism;
  const rawNodes = graph?.elements?.nodes ?? [];
  const rawEdges = graph?.elements?.edges ?? [];

  // Semilla del dibujo de cada subgrafo: la elegida con "Rearrange" (en memoria y
  // guardada en el navegador) o, por defecto, una derivada del propio subgrafo.
  const seedFor = (key) => seedsRef.current.get(key) ?? readSeed(key) ?? hashString(key);

  // Nodos con su posición ya calculada. Solo cambia si cambia el subgrafo o si se
  // presiona "Rearrange" (layoutVersion).
  const cyElements = useMemo(() => {
    if (!graph || rawNodes.length === 0) return [];
    const seed = seedFor(graph.key);
    const cacheKey = `${graph.key}|${seed}`;
    let positions = positionsRef.current.get(cacheKey);
    if (!positions) {
      positions = computePositions(rawNodes, rawEdges, seed);
      positionsRef.current.set(cacheKey, positions);
    }
    const labeled = rawNodes.length <= LABEL_ALL_NODES ? "labeled" : "";
    return [
      ...rawNodes.map((n) => ({ ...n, position: positions[n.data.id] ?? { x: 0, y: 0 }, classes: labeled })),
      ...rawEdges,
    ];
  }, [graph, layoutVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  // Encuadre: cuando Cytoscape ya tiene los nodos y el contenedor tiene tamaño,
  // se aplican las posiciones calculadas y se centra la red.
  useEffect(() => {
    if (loading || cyElements.length === 0) return undefined;
    const positioned = cyElements.filter((el) => el.position);
    const byId = new Map(positioned.map((el) => [el.data.id, el.position]));
    let frame = 0;
    let tries = 0;

    const apply = () => {
      const cy = cyRef.current;
      const ready =
        cy && !cy.destroyed() && cy.nodes().length === positioned.length && cy.width() > 0 && cy.height() > 0;
      if (!ready) {
        if (tries++ < 60) frame = requestAnimationFrame(apply);
        return;
      }
      cy.resize();
      cy.nodes().positions((node) => byId.get(node.id()) ?? node.position());
      fitView(cy);
    };

    apply();
    return () => cancelAnimationFrame(frame);
  }, [cyElements, loading]);

  // Al cambiar el tamaño del panel (ventana, barra de filtros) la red completa se vuelve a encuadrar
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return undefined;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const cy = cyRef.current;
        if (!cy || cy.destroyed() || cy.nodes().length === 0) return;
        cy.resize();
        fitView(cy);
      });
    });
    observer.observe(panel);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  // Única forma de cambiar el dibujo: una semilla nueva, que queda guardada.
  const rearrange = () => {
    if (!graph) return;
    const seed = (Date.now() ^ Math.floor(Math.random() * 2 ** 31)) >>> 0;
    seedsRef.current.set(graph.key, seed);
    saveSeed(graph.key, seed);
    setLayoutVersion((v) => v + 1);
  };

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

  // Conexiones del nodo seleccionado, de mayor a menor confidence.
  const connections = useMemo(() => {
    if (!selected) return [];
    const isTF = selected.node_type === "TF";
    return rawEdges
      .filter((e) => (isTF ? e.data.source : e.data.target) === selected.id)
      .map((e) => {
        const otherId = isTF ? e.data.target : e.data.source;
        return {
          id: otherId,
          label: nodeById.get(otherId)?.label ?? otherId,
          weight: e.data.weight,
          tier: e.data.tier,
        };
      })
      .sort((a, b) => b.weight - a.weight);
  }, [selected, graph]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4 h-full flex flex-col w-full">
      <div>
        <h1 className="text-2xl font-semibold text-[#334155]">Regulatory Network</h1>
        <p className="text-sm text-[#64748B] mt-1">
          Predicted transcription factor → target operon interactions from the RegulonAtlas database.
        </p>
      </div>

      <CoverageNote networkId={networkId} />

      <div className="bg-white border border-[#D9E2E7] rounded-xl p-3 flex flex-wrap items-end gap-4 shadow-sm">
        <NetworkSelector networks={networks} value={networkId} onChange={setNetworkId} />

        <div className="flex flex-col gap-1">
          <span className="text-xs text-[#64748B]">
            {loadingGenomes && organismList.length === 0
              ? "Organism (Loading genomes…)"
              : `Organism (${fmtInt(organismsWithEdges)} of ${fmtInt(organismList.length)} have edges in this network)`}
          </span>
          <OrganismSearch
            options={organismList}
            value={organism}
            onChange={setOrganism}
            disabled={loadingGenomes}
          />
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-[#64748B]">Min. confidence</span>
          <select
            value={minConfidence}
            onChange={(e) => setMinConfidence(Number(e.target.value))}
            className={selectClass}
          >
            {CONFIDENCE_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c === 0 ? "Any" : `≥ ${c}`}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-[#64748B]">Edges drawn</span>
          <select value={maxEdges} onChange={(e) => setMaxEdges(Number(e.target.value))} className={selectClass}>
            {EDGE_LIMITS.map((n) => (
              <option key={n} value={n}>
                up to {fmtInt(n)}
              </option>
            ))}
          </select>
        </label>

        <DownloadButton
          label="Download network"
          filename={`RegulonAtlas_${organism}_${network?.name ?? networkId}${minConfidence > 0 ? `_conf${minConfidence}` : ""}.xlsx`}
          request={() =>
            api.downloadNetworkReport(networkId, organism, {
              minConfidence,
              // La imagen es exactamente la red dibujada en pantalla
              image: cyRef.current && rawEdges.length > 0
                ? { network_id: networkId, png: cyRef.current.png(PNG_OPTIONS), shown_edges: graph.shown_edges }
                : null,
            })
          }
          disabled={loading || !graph || graph.filtered_edges === 0}
          title="Excel file with every edge that passes the network and confidence filters, not only the edges drawn"
        />

        {graph && (
          <div className="ml-auto text-xs text-[#64748B] text-right">
            <div className="font-mono text-[#334155]">
              {fmtInt(rawNodes.length)} nodes, {fmtInt(graph.shown_edges)} of {fmtInt(graph.total_edges)} TF–operon
              edges
            </div>
            <div className="text-[11px] mt-0.5">
              {graph.filtered_edges < graph.total_edges
                ? `${fmtInt(graph.filtered_edges)} pass the confidence filter; `
                : ""}
              highest-confidence edges first
            </div>
            {filters && <div className="text-[11px] mt-0.5 text-[#94A3B8]">Network filters: {filters}</div>}
          </div>
        )}
      </div>

      <div className="flex gap-4 flex-1 min-h-[500px]">
        <div className="flex-1 min-w-0 bg-white border border-[#D9E2E7] rounded-xl shadow-sm overflow-hidden flex flex-col">
          {/* La leyenda va debajo de este panel: así nunca tapa nodos de la red */}
          <div ref={panelRef} data-testid="network-canvas" className="relative flex-1 min-h-0">
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

          {!loading && !error && graph && rawEdges.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center z-20 px-8">
              <p className="text-sm text-[#64748B] text-center max-w-md">
                {graph.total_edges === 0
                  ? `${organismLabel} has no predicted edges in the ${graph.network} network. Choose a less strict network, such as permissive, to see its interactions.`
                  : "No edges reach this confidence. Lower the minimum confidence to see more."}
              </p>
            </div>
          )}

          <div className="absolute top-4 right-4 z-10 flex gap-2">
            <button
              onClick={rearrange}
              disabled={!graph || rawEdges.length === 0}
              className="px-3 py-2 text-sm bg-white border border-[#D9E2E7] rounded-lg shadow-sm text-[#334155] hover:bg-[#F7FAFC] focus:outline-none focus:ring-1 focus:ring-[#3A9D7C] disabled:text-[#CBD5E1]"
              title="Compute a new layout for this network"
            >
              Rearrange
            </button>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                aria-label="Find TF or gene"
                placeholder="Find TF or gene"
                className="pl-9 pr-3 py-2 text-sm bg-white border border-[#D9E2E7] rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-[#3A9D7C] w-48"
              />
            </div>
          </div>

          {!loading && !error && graph && rawEdges.length > 0 && (
            <CytoscapeComponent
              elements={cyElements}
              stylesheet={CYTOSCAPE_STYLESHEET}
              layout={PRESET_LAYOUT}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
              cy={(cy) => {
                cyRef.current = cy;
                // El componente puede crear otra instancia al montarse: cada instancia nueva se encuadra una vez
                if (fittedCyRef.current !== cy) {
                  fittedCyRef.current = cy;
                  requestAnimationFrame(() => {
                    if (cy.destroyed()) return;
                    cy.resize();
                    fitView(cy);
                  });
                }
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

          </div>

          <div data-testid="network-legend" className="shrink-0 border-t border-[#D9E2E7] px-4 py-2 flex flex-wrap items-center gap-x-5 gap-y-1">
            <div className="text-xs font-semibold text-[#64748B]">Legend</div>
            {[
              { type: "TF", label: "Transcription factor" },
              { type: "Operon", label: "Target operon (named by its best-site gene)" },
            ].map((l) => (
              <div key={l.type} className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: NODE_COLOR[l.type] }} />
                <span className="text-xs text-[#64748B]">{l.label}</span>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <div className="flex flex-col gap-0.5">
                <div className="w-5 border-t border-[#94A3B8]" />
                <div className="w-5 border-t-[3px] border-[#94A3B8]" />
              </div>
              <span className="text-xs text-[#64748B]">Thicker edge = higher confidence</span>
            </div>
          </div>
        </div>

        {selected ? (
          <div className="w-72 bg-white border border-[#D9E2E7] rounded-xl shadow-sm p-6 shrink-0 overflow-y-auto flex flex-col">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h3 className="text-xl font-bold text-[#334155] break-all leading-none">{selected.label}</h3>
                <p className="text-[13px] text-[#64748B] mt-1.5">
                  {selected.node_type === "TF"
                    ? `Transcription factor${selected.family ? `, ${selected.family} family` : ""}`
                    : "Target operon"}
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
              {selected.node_type === "Operon" && (
                <>
                  <div className="flex justify-between">
                    <dt className="text-[#64748B]">Genes in operon</dt>
                    <dd className="font-mono text-[#334155]">{selected.n_genes}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-[#64748B]">Best-site locus</dt>
                    <dd className="font-mono text-[#334155] truncate" title={selected.lead_locus}>
                      {selected.lead_locus}
                    </dd>
                  </div>
                </>
              )}
              <div className="flex justify-between">
                <dt className="text-[#64748B]">Network</dt>
                <dd className="font-mono text-[#334155]">{graph?.network}</dd>
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
                <span className="text-[11px] font-normal text-[#94A3B8]">confidence</span>
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
                      style={{ backgroundColor: selected.node_type === "TF" ? NODE_COLOR.Operon : NODE_COLOR.TF }}
                    />
                    <span className="text-[13px] font-mono text-[#334155] truncate flex-1" title={c.label}>
                      {c.label}
                    </span>
                    <span className="text-[10px] text-[#94A3B8]" title="Taxonomic distance of the motif transfer">
                      {c.tier}
                    </span>
                    <span className="text-[11px] font-mono text-[#94A3B8]">{c.weight.toFixed(2)}</span>
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-[#94A3B8] mt-3">
                Only the edges drawn in this view are listed; this organism has {fmtInt(graph?.total_edges)}{" "}
                TF–operon edges in this network.
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
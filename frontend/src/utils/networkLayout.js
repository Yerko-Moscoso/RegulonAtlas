import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose";

// Dibujo de las redes: lo comparten la vista Regulatory Networks y las imágenes del reporte en Excel,
// para que una misma red (red + organismo + filtros) tenga siempre la misma disposición.
cytoscape.use(fcose);

// Red real del atlas: TF -> operón (D10). El operón se etiqueta con el gen del
// mejor sitio de unión. Grosor de arista = confidence calibrada.
export const NODE_COLOR = { TF: "#3A9D7C", Operon: "#3B82B8" };
export const NODE_BORDER = { TF: "#176B57", Operon: "#2563A0" };
export const DEFAULT_NETWORK = 3; // balanced: red por defecto
export const DEFAULT_GENOME = "GCF_000005845.2"; // E. coli K-12 MG1655
export const CONFIDENCE_OPTIONS = [0, 0.3, 0.5, 0.7, 0.9];
export const EDGE_LIMITS = [200, 500, 1000, 2000];

export const CYTOSCAPE_STYLESHEET = [
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
    // Redes pequeñas: se muestran también los nombres de los operones
    selector: "node.labeled",
    style: { label: "data(label)", "font-size": 10 },
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
      width: "mapData(weight, 0, 1, 0.5, 3)",
      "line-color": "#CBD5E1",
      "target-arrow-color": "#CBD5E1",
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
      width: 3,
      opacity: 1,
      "z-index": 999,
    },
  },
];

// Las posiciones se calculan ANTES de entregarle los nodos a Cytoscape (en una
// instancia sin pantalla) y viajan dentro de cada nodo. Así el grafo aparece ya
// dibujado al seleccionar el organismo, sin depender de cuándo termina de montarse.
export const PRESET_LAYOUT = { name: "preset", fit: false };
export const SEED_STORAGE_PREFIX = "regulatory-network-layout-seed:";

// Hash FNV-1a de un texto -> entero de 32 bits (semilla por defecto de cada subgrafo)
export const hashString = (text) => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

// Generador pseudoaleatorio con semilla (mulberry32)
export const seededRandom = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const readSeed = (key) => {
  try {
    const saved = window.localStorage.getItem(SEED_STORAGE_PREFIX + key);
    return saved == null ? null : Number(saved);
  } catch {
    return null;
  }
};

export const saveSeed = (key, seed) => {
  try {
    window.localStorage.setItem(SEED_STORAGE_PREFIX + key, String(seed));
  } catch {
    // Sin almacenamiento disponible: la semilla nueva vale solo para esta sesión
  }
};

// Por debajo de estos tamaños, fcose no siempre separa bien los nodos (con 1 TF y
// 1 operón los deja uno encima del otro), así que se usa un layout en dos filas.
export const SMALL_GRAPH_NODES = 12;
export const LABEL_ALL_NODES = 60;
export const MAX_FIT_ZOOM = 1.6;

// Mezcla determinista: la misma semilla da siempre el mismo orden
export const seededShuffle = (items, seed) => {
  const rand = seededRandom(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

// TF en la fila de arriba, operones en la de abajo, centrados.
export const runTwoRowLayout = (cy, seed) => {
  const gapX = 120;
  const rowY = { TF: 0, Operon: 160 };
  ["TF", "Operon"].forEach((type) => {
    const row = seededShuffle(cy.nodes(`[node_type = "${type}"]`).toArray(), seed);
    row.forEach((node, i) => node.position({ x: (i - (row.length - 1) / 2) * gapX, y: rowY[type] }));
  });
};

// true si todos los nodos quedaron prácticamente en el mismo punto
export const nodesCollapsed = (cy) => {
  const bb = cy.nodes().boundingBox({ includeLabels: false });
  return cy.nodes().length > 1 && bb.w < 40 && bb.h < 40;
};

// Encuadra la red sin acercar demasiado las redes pequeñas
export const fitView = (cy) => {
  cy.fit(undefined, 40);
  if (cy.zoom() > MAX_FIT_ZOOM) {
    cy.zoom(MAX_FIT_ZOOM);
    cy.center();
  }
};

export const snapshotPositions = (cy) => {
  const positions = {};
  cy.nodes().forEach((n) => {
    positions[n.id()] = { ...n.position() };
  });
  return positions;
};

export const FCOSE_LAYOUT = {
  name: "fcose",
  quality: "default",
  animate: false,
  randomize: true,
  nodeRepulsion: 6500,
  idealEdgeLength: 50,
  padding: 30,
  fit: false,
};

// Calcula las posiciones de un subgrafo con una semilla, en una instancia de
// Cytoscape sin pantalla. fcose parte de posiciones aleatorias: mientras corre se
// reemplaza Math.random por un generador con semilla, así la misma semilla da
// siempre el mismo dibujo. Las redes muy pequeñas van en dos filas (TF arriba,
// operones abajo), porque fcose puede dejarlas encimadas.
export const computePositions = (nodes, edges, seed) => {
  const cy = cytoscape({
    headless: true,
    styleEnabled: true,
    style: CYTOSCAPE_STYLESHEET,
    elements: [...nodes, ...edges],
  });
  try {
    if (cy.nodes().length <= SMALL_GRAPH_NODES) {
      runTwoRowLayout(cy, seed);
    } else {
      const originalRandom = Math.random;
      Math.random = seededRandom(seed);
      try {
        cy.layout(FCOSE_LAYOUT).run();
      } finally {
        Math.random = originalRandom;
      }
      if (nodesCollapsed(cy)) runTwoRowLayout(cy, seed);
    }
    return snapshotPositions(cy);
  } finally {
    cy.destroy();
  }
};

export const DEFAULT_MAX_EDGES = 500; // valor inicial de "Edges drawn" en Regulatory Networks
export const PNG_OPTIONS = { output: "base64", full: true, bg: "#FFFFFF", maxWidth: 1600, maxHeight: 1200 };
export const graphKey = (networkId, accession, minConfidence, maxEdges) =>
  `${networkId}|${accession}|${minConfidence}|${maxEdges}`;

// PNG (base64) de una respuesta de getAtlasGraph, con la semilla y las posiciones de la vista.
// Cytoscape necesita un contenedor con tamaño para dibujar: se usa uno fuera de la pantalla.
export const renderGraphPng = (graph, key) => {
  const nodes = graph.elements?.nodes ?? [];
  const edges = graph.elements?.edges ?? [];
  if (edges.length === 0) return null;
  const positions = computePositions(nodes, edges, readSeed(key) ?? hashString(key));
  const classes = nodes.length <= LABEL_ALL_NODES ? "labeled" : "";
  const container = document.createElement("div");
  container.style.cssText = "position:fixed;left:-10000px;top:0;width:1200px;height:900px;";
  document.body.appendChild(container);
  const cy = cytoscape({
    container,
    style: CYTOSCAPE_STYLESHEET,
    layout: PRESET_LAYOUT,
    elements: [...nodes.map((n) => ({ ...n, position: positions[n.data.id] ?? { x: 0, y: 0 }, classes })), ...edges],
  });
  try {
    fitView(cy);
    return cy.png(PNG_OPTIONS);
  } finally {
    cy.destroy();
    container.remove();
  }
};

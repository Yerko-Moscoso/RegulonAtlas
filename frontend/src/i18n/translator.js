import { METRIC_LABELS } from "../utils/metrics.js";
import { CONNECTORS, EXACT, PATTERNS } from "./es.js";

// Cambio de idioma de toda la interfaz sin tocar los datos. El código sigue escribiendo el texto base en inglés; esta capa
// traduce los nodos de texto y algunos atributos justo antes de pintar, y guarda el original para poder volver.
// Lo que no está en el diccionario (organismos, genes, TF, redes, tiers, comandos) se deja igual.
const STORAGE_KEY = "regulonatlas-language";
const ATTRIBUTES = ["placeholder", "title", "aria-label"];
const SKIP = "script, style, textarea, [data-no-i18n]";
const MAX_CACHE = 20000;

const normalize = (text) => text.replace(/\s+/g, " ").trim();
const hasLetters = (text) => /\p{L}/u.test(text);

// Formato numérico en español: 2,224.5 -> 2.224,5. Solo se aplica a valores sin letras (no a 1e-7, GCF_... ni versiones).
const localizeNumbers = (text) =>
  text.replace(/\d[\d,]*(?:\.\d+)?/g, (n) => n.replace(/[.,]/g, (c) => (c === "," ? "." : ",")));

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const COMPILED = Object.entries(PATTERNS)
  .map(([key, value]) => ({
    literal: key.replaceAll("{}", "").length,
    regex: new RegExp(`^${key.split("{}").map(escapeRegExp).join("(.+?)")}$`, "u"),
    value,
  }))
  .sort((a, b) => b.literal - a.literal); // primero el patrón más específico

const translateValue = (value) => {
  if (!hasLetters(value)) return localizeNumbers(value);
  return translateBody(value, false) ?? value; // un valor variable puede ser otro texto de la interfaz
};

// Algunas frases usan el nombre de la métrica en minúsculas. Solo se aceptan métricas: un gen podría llamarse "all".
const LOWERCASE_METRICS = Object.fromEntries(
  Object.values(METRIC_LABELS)
    .filter((label) => EXACT[label])
    .map((label) => [label.toLowerCase(), EXACT[label].toLowerCase().replace(/\btf\b/g, "TF")])
);

const cache = new Map();

function translateBody(key, spaced) {
  if (!hasLetters(key)) return null;
  if (Object.hasOwn(EXACT, key)) return EXACT[key];
  if (Object.hasOwn(LOWERCASE_METRICS, key)) return LOWERCASE_METRICS[key];
  if (spaced && Object.hasOwn(CONNECTORS, key)) return CONNECTORS[key];
  for (const { regex, value } of COMPILED) {
    const match = key.match(regex);
    if (match) {
      let i = 1;
      return value.replaceAll("{}", () => translateValue(match[i++]));
    }
  }
  return null;
}

// Devuelve el texto en español conservando los espacios de los extremos (React separa las frases en varios nodos).
export function translate(text) {
  if (cache.has(text)) return cache.get(text);
  const [, lead, body, trail] = text.match(/^(\s*)([\s\S]*?)(\s*)$/);
  let out = text;
  if (body) {
    const translated = hasLetters(body)
      ? translateBody(normalize(body), Boolean(lead || trail))
      : localizeNumbers(body);
    // Si la traducción empieza con puntuación, no se deja un espacio antes ("red balanced.")
    if (translated != null) out = translated === "" ? "" : `${/^[.,;:)]/.test(translated) ? "" : lead}${translated}${trail}`;
  }
  if (cache.size >= MAX_CACHE) cache.clear();
  cache.set(text, out);
  return out;
}

let language = "en";
let observer = null;
const listeners = new Set();
const textState = new WeakMap(); // nodo -> { source, shown }
const attrState = new WeakMap(); // elemento -> { atributo: { source, shown } }

const skipped = (element) => !element || Boolean(element.closest(SKIP));

function applyText(node) {
  if (skipped(node.parentElement)) return;
  const state = textState.get(node);
  // Si React escribió otro valor, ese pasa a ser el original
  const source = state && node.nodeValue === state.shown ? state.source : node.nodeValue;
  const shown = language === "es" ? translate(source) : source;
  if (node.nodeValue !== shown) node.nodeValue = shown;
  if (shown !== source) textState.set(node, { source, shown });
  else textState.delete(node);
}

function applyAttribute(element, name) {
  if (skipped(element) || !element.hasAttribute(name)) return;
  const states = attrState.get(element) ?? {};
  const current = element.getAttribute(name);
  const state = states[name];
  const source = state && current === state.shown ? state.source : current;
  const shown = language === "es" ? translate(source) : source;
  if (current !== shown) element.setAttribute(name, shown);
  if (shown !== source) states[name] = { source, shown };
  else delete states[name];
  attrState.set(element, states);
}

function applyTree(root) {
  if (root.nodeType === Node.TEXT_NODE) {
    applyText(root);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  ATTRIBUTES.forEach((name) => applyAttribute(root, name));
  root.querySelectorAll(ATTRIBUTES.map((name) => `[${name}]`).join(",")).forEach((element) => {
    ATTRIBUTES.forEach((name) => applyAttribute(element, name));
  });
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) applyText(node);
}

// Los cambios propios se descartan con takeRecords para no volver a procesarlos.
function applyAll() {
  applyTree(document.body);
  observer?.takeRecords();
}

function onMutations(records) {
  records.forEach((record) => {
    if (record.type === "characterData") applyText(record.target);
    else if (record.type === "attributes") applyAttribute(record.target, record.attributeName);
    else record.addedNodes.forEach(applyTree);
  });
  observer.takeRecords();
}

const readStored = () => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "es" ? "es" : "en";
  } catch {
    return "en";
  }
};

export const getLanguage = () => language;

export function setLanguage(next) {
  language = next === "es" ? "es" : "en";
  document.documentElement.lang = language;
  try {
    window.localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Sin almacenamiento disponible: el idioma vale solo para esta sesión
  }
  applyAll();
  listeners.forEach((listener) => listener());
}

export function subscribeLanguage(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function startTranslator() {
  language = readStored();
  document.documentElement.lang = language;
  observer = new MutationObserver(onMutations);
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ATTRIBUTES,
  });
  applyAll();
}

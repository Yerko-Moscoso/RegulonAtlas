// Formatos compartidos por Validation.jsx y sus componentes (components/ValidationParts.jsx, BaselineSection.jsx).
export const pct = (v) => (v == null || Number.isNaN(v) ? "—" : `${(v * 100).toFixed(1)}%`);
export const pctTick = (v) => `${Math.round(v * 100)}%`;
export const dec = (v) => (v == null ? "—" : Number(v).toFixed(3));
export const detail = (err, fallback) => err?.response?.data?.detail ?? fallback;

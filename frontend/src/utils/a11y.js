// Accesibilidad con teclado para filas, celdas y encabezados que se eligen con clic (revisión de la semana 13, M3).
// clickable(fn): el elemento entra al orden de Tab y se activa con clic, Enter o Espacio.
export const clickable = (fn) => ({
  tabIndex: 0,
  onClick: fn,
  onKeyDown: (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fn();
    }
  },
});

// Marco de foco visible solo al navegar con teclado (igual que las secciones plegables).
export const FOCUS_RING = "focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#3A9D7C]";

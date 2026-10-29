// Contenedor con scroll horizontal para tablas anchas (revisión de la semana 13, M1 y M2).
// Cuando la tabla no cabe, muestra un degradado en el borde por el que hay más columnas y un aviso debajo;
// si cabe, no muestra nada. `className` va al contenedor que hace scroll (por ejemplo, "max-h-[480px]").
import { useRef, useState, useEffect } from "react";

export default function ScrollX({ children, className = "" }) {
  const ref = useRef(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () =>
      setEdges({ left: el.scrollLeft > 1, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1 });
    // ResizeObserver avisa al empezar a observar y cada vez que cambia el ancho del contenedor o de la tabla
    // (por ejemplo, al llegar los datos); el scroll actualiza los bordes al deslizar.
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    el.addEventListener("scroll", update, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", update);
    };
  }, []);

  return (
    <div>
      <div className="relative">
        <div ref={ref} className={`overflow-x-auto ${className}`}>
          {children}
        </div>
        {edges.left && (
          <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-white to-transparent" />
        )}
        {edges.right && (
          <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white to-transparent" />
        )}
      </div>
      {edges.right && (
        <p className="text-[11px] text-[#94A3B8] mt-1 text-right">Scroll sideways to see more columns →</p>
      )}
    </div>
  );
}

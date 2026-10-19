import { useState, lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";

// Cada vista se carga al abrirla (React.lazy): Cytoscape y Recharts ya no van en el paquete inicial.
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Organisms = lazy(() => import("./pages/Organisms"));
const OrganismDetail = lazy(() => import("./pages/OrganismDetail"));
const RegulatoryNetwork = lazy(() => import("./pages/RegulatoryNetwork"));
const Metrics = lazy(() => import("./pages/Metrics"));
const Validation = lazy(() => import("./pages/Validation"));
const Fingerprints = lazy(() => import("./pages/Fingerprints"));
const Comparison = lazy(() => import("./pages/Comparison"));
const Robustness = lazy(() => import("./pages/Robustness"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-20 text-sm text-[#64748B] gap-2">
      <Loader2 className="w-5 h-5 text-[#3A9D7C] animate-spin" />
      Loading view…
    </div>
  );
}

// Referencia con gold standard (RegulonDB); también es el organismo por defecto.
const DEFAULT_ORGANISM = "GCF_000005845.2";

// Rutas del MVP más las vistas de las semanas 11 (Fingerprints, Comparison) y 12 (Robustness). Si llega una página no registrada, se vuelve al Dashboard
// en vez de mostrar una pantalla vacía.
const MVP_PAGES = new Set([
  "dashboard",
  "organisms",
  "organism-detail",
  "networks",
  "metrics",
  "validation",
  "fingerprints",
  "comparison",
  "robustness",
]);

export default function App() {
  const [page, setPage] = useState("dashboard");
  const [selectedOrganism, setSelectedOrganism] = useState(DEFAULT_ORGANISM);

  function navigate(newPage, organism) {
    if (organism) setSelectedOrganism(organism);
    setPage(MVP_PAGES.has(newPage) ? newPage : "dashboard");
  }

  return (
    <div className="flex h-full bg-[#F7FAFC]">
      <Sidebar activePage={page} navigate={navigate} />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header page={page} />
        <main className="flex-1 overflow-auto p-6">
          <Suspense fallback={<PageLoader />}>
          {page === "dashboard" && <Dashboard navigate={navigate} />}
          {page === "organisms" && <Organisms navigate={navigate} />}
          {page === "organism-detail" && (
            <OrganismDetail navigate={navigate} organismId={selectedOrganism} />
          )}
          {page === "networks" && <RegulatoryNetwork initialOrganism={selectedOrganism} />}
          {page === "metrics" && <Metrics initialOrganism={selectedOrganism} />}
          {page === "validation" && <Validation initialOrganism={selectedOrganism} />}
          {page === "fingerprints" && <Fingerprints initialOrganism={selectedOrganism} />}
          {page === "comparison" && <Comparison />}
          {page === "robustness" && <Robustness initialOrganism={selectedOrganism} />}
          </Suspense>
        </main>
      </div>
    </div>
  );
}
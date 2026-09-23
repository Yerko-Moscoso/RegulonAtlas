import { useState } from "react";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import Dashboard from "./pages/Dashboard";
import Organisms from "./pages/Organisms";
import OrganismDetail from "./pages/OrganismDetail";
import RegulatoryNetwork from "./pages/RegulatoryNetwork";
import Metrics from "./pages/Metrics";
import Validation from "./pages/Validation";

// Referencia con gold standard (RegulonDB); también es el organismo por defecto.
const DEFAULT_ORGANISM = "GCF_000005845.2";

// Rutas del MVP. Si llega una página no registrada, se vuelve al Dashboard
// en vez de mostrar una pantalla vacía.
const MVP_PAGES = new Set([
  "dashboard",
  "organisms",
  "organism-detail",
  "networks",
  "metrics",
  "validation",
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
          {page === "dashboard" && <Dashboard navigate={navigate} />}
          {page === "organisms" && <Organisms navigate={navigate} />}
          {page === "organism-detail" && (
            <OrganismDetail navigate={navigate} organismId={selectedOrganism} />
          )}
          {page === "networks" && <RegulatoryNetwork initialOrganism={selectedOrganism} />}
          {page === "metrics" && <Metrics initialOrganism={selectedOrganism} />}
          {page === "validation" && <Validation initialOrganism={selectedOrganism} />}
        </main>
      </div>
    </div>
  );
}
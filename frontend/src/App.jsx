import { useState } from "react";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import Dashboard from "./pages/Dashboard";
import Organisms from "./pages/Organisms";
import OrganismDetail from "./pages/OrganismDetail";
import RegulatoryNetwork from "./pages/RegulatoryNetwork";
import Metrics from "./pages/Metrics";
import Fingerprints from "./pages/Fingerprints";
import Validation from "./pages/Validation";
import Robustness from "./pages/Robustness";
import Comparison from "./pages/Comparison";
import Pipeline from "./pages/Pipeline";
import DataProvenance from "./pages/DataProvenance";
import MVP from "./pages/MVP";

export default function App() {
  const [page, setPage] = useState("dashboard");
  const [selectedOrganism, setSelectedOrganism] = useState("ecoli");

  function navigate(newPage, organism) {
    if (organism) setSelectedOrganism(organism);
    setPage(newPage);
  }

  return (
    <div className="flex h-full bg-[#F7FAFC]">
      <Sidebar activePage={page} navigate={navigate} />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header page={page} />
        <main className="flex-1 overflow-auto p-6">
          {page === "dashboard" && <Dashboard navigate={navigate} />}
          {page === "organisms" && <Organisms navigate={navigate} />}
          {page === "motifs" && <Motifs navigate={navigate} />}
          {page === "organism-detail" && (
            <OrganismDetail navigate={navigate} organismId={selectedOrganism} />
          )}
          {page === "networks" && <RegulatoryNetwork />}
          {page === "metrics" && <Metrics />}
          {page === "fingerprints" && <Fingerprints />}
          {page === "validation" && <Validation />}
          {page === "robustness" && <Robustness />}
          {page === "comparison" && <Comparison navigate={navigate} />}
          {page === "pipeline" && <Pipeline />}
          {page === "provenance" && <DataProvenance />}
          {page === "mvp" && <MVP />}
          {page === "settings" && (
            <div className="flex items-center justify-center h-64 text-[#64748B] text-sm">
              Settings panel — coming soon.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
import { useState, useEffect } from "react";
import { api } from "../services/api";
import { fmtInt } from "../utils/atlas";
import { dec, detail } from "../utils/validation";
import { Section, Segmented, Spinner, ErrorMsg } from "./ValidationParts";
import ScrollX from "./ScrollX";

// Secciones ampliadas de Validation (excepciones E1, E2 y E5 del congelamiento; E6 se quitó el 26-11-2026, E13).
const SCHEMES = [
  { id: "family", label: "By family", hint: "Resamples whole GTDB families. Conservative: related genomes are not independent." },
  { id: "genome", label: "By genome", hint: "Resamples individual validable genomes." },
];
const NET_ORDER = [1, 2, 3, 4, 5];
const HEAD = "text-left text-[11px] uppercase tracking-wide text-[#94A3B8] border-b border-[#E2E8F0]";
const TABLE = "w-full text-sm [&_th]:whitespace-nowrap [&_td]:whitespace-nowrap [&_th+th]:pl-4 [&_td+td]:pl-4";

function Interval({ row }) {
  if (!row) return "—";
  return (
    <>
      {dec(row.estimate)} <span className="text-[#94A3B8]">({dec(row.ci_low)}–{dec(row.ci_high)})</span>
    </>
  );
}

// E1 + E2: los dos modos lado a lado, con intervalos de confianza
export function ModeComparison() {
  const [scheme, setScheme] = useState("family");
  const [ci, setCi] = useState([]);
  const [diffs, setDiffs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([api.getValidationCI(scheme), api.getF1Differences(scheme)])
      .then(([c, d]) => {
        if (cancelled) return;
        setCi(c.data.rows ?? []);
        setDiffs(d.data.rows ?? []);
      })
      .catch((err) => !cancelled && setError(detail(err, "The confidence intervals could not be loaded.")))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [scheme]);

  const get = (id, mode, metric) => ci.find((r) => r.network_id === id && r.mode === mode && r.metric === metric);

  // Redes cuyo F1 no se distingue de la mejor en cada modo
  const ties = (mode) => {
    const f1 = ci.filter((r) => r.mode === mode && r.metric === "f1");
    if (f1.length === 0) return null;
    const best = f1.reduce((m, r) => (r.estimate > m.estimate ? r : m));
    const tied = diffs
      .filter((d) => d.mode === mode && !d.ci_excludes_zero && (d.network_id_a === best.network_id || d.network_id_b === best.network_id))
      .map((d) => (d.network_id_a === best.network_id ? d.network_b : d.network_a));
    return { best: best.network, tied };
  };
  const summaries = [["All edges", ties("all")], ["Independent", ties("independent")]];

  return (
    <Section
      title="All edges vs independent, with 95% confidence intervals"
      subtitle="Curated TFs only. Independent excludes motifs built from a regulog that contains the evaluated genome, so it is the stricter estimate."
      right={<Segmented label="Bootstrap" options={SCHEMES} value={scheme} onChange={setScheme} />}
    >
      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorMsg>{error}</ErrorMsg>
      ) : (
        <>
          <ScrollX>
            <table className={TABLE}>
              <thead>
                <tr className={HEAD}>
                  <th className="py-2 font-medium">Network</th>
                  <th className="py-2 font-medium text-right">P · all</th>
                  <th className="py-2 font-medium text-right">R · all</th>
                  <th className="py-2 font-medium text-right">F1 · all</th>
                  <th className="py-2 font-medium text-right">P · independent</th>
                  <th className="py-2 font-medium text-right">R · independent</th>
                  <th className="py-2 font-medium text-right">F1 · independent</th>
                </tr>
              </thead>
              <tbody>
                {NET_ORDER.map((id) => (
                  <tr key={id} className="border-b border-[#F1F5F9]">
                    <td className="py-2 font-medium text-[#334155]">{get(id, "all", "f1")?.network}</td>
                    {["all", "independent"].flatMap((m) =>
                      ["precision", "recall", "f1"].map((k) => (
                        <td key={`${m}-${k}`} className="py-2 text-right font-mono text-xs">
                          <Interval row={get(id, m, k)} />
                        </td>
                      ))
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollX>
          <ul className="text-xs text-[#334155] mt-3 space-y-1">
            {summaries.map(([label, s]) =>
              s ? (
                <li key={label}>
                  <b>{label}:</b> highest F1 is {s.best}
                  {s.tied.length > 0
                    ? `, but it cannot be distinguished from ${s.tied.join(" and ")} (the interval of the difference includes 0).`
                    : "; the difference with every other network is outside the 95% interval."}
                </li>
              ) : null
            )}
          </ul>
        </>
      )}
    </Section>
  );
}

// E5: segundo gold standard en E. coli K-12 (solo cifras agregadas)
export function RegulonDBSection() {
  const [all, setAll] = useState([]);
  const [strong, setStrong] = useState([]);
  const [manifest, setManifest] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.getAtlasValidationSummary("regulondb", { universe: "genome_tf" }),
      api.getAtlasValidationSummary("regulondb_strong", { universe: "genome_tf" }),
      api.getAtlasValidationManifest("regulondb"),
    ])
      .then(([a, s, m]) => {
        if (cancelled) return;
        setAll(a.data.rows ?? []);
        setStrong(s.data.rows ?? []);
        setManifest(m.data);
      })
      .catch((err) => !cancelled && setError(detail(err, "RegulonDB results are not available (make regulondb, make validate-regulondb).")))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const cell = (rows, id, mode) => rows.find((r) => r.network_id === id && r.mode === mode);
  const gs = manifest?.gold_stats;

  return (
    <Section
      title="Second gold standard: RegulonDB (E. coli K-12 only)"
      subtitle={gs ? `${gs.source}. ${fmtInt(gs.gold_tf_operon_pairs)} TF–operon pairs. One genome, so these values have no confidence interval and do not generalize to the atlas.` : undefined}
    >
      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorMsg>{error}</ErrorMsg>
      ) : (
        <>
          <ScrollX>
            <table className={TABLE}>
              <thead>
                <tr className={HEAD}>
                  <th className="py-2 font-medium">Network</th>
                  <th className="py-2 font-medium text-right">All evidence: P / R / F1</th>
                  <th className="py-2 font-medium text-right">Independent</th>
                  <th className="py-2 font-medium text-right">Strong + confirmed: P / R / F1</th>
                  <th className="py-2 font-medium text-right">Independent</th>
                </tr>
              </thead>
              <tbody>
                {NET_ORDER.map((id) => (
                  <tr key={id} className="border-b border-[#F1F5F9]">
                    <td className="py-2 font-medium text-[#334155]">{cell(all, id, "all")?.network}</td>
                    {[[all, "all"], [all, "independent"], [strong, "all"], [strong, "independent"]].map(([rows, mode], i) => {
                      const r = cell(rows, id, mode);
                      return (
                        <td key={i} className="py-2 text-right font-mono text-xs">
                          {r ? `${dec(r.precision)} / ${dec(r.recall)} / ${dec(r.f1)}` : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollX>
          <p className="text-[11px] text-[#94A3B8] mt-3">
            Recall is low because RegulonDB contains many TFs and interactions the atlas networks do not predict for this
            genome. Independent mode only removes RegPrecise self-evaluation; PRODORIC motifs from E. coli may still share
            evidence with RegulonDB. RegulonDB is free for academic use; only aggregate scores are shown here. Cite:
            Salgado et al., Nucleic Acids Research, 2023 (doi:10.1093/nar/gkad1072).
          </p>
        </>
      )}
    </Section>
  );
}

// Subconjunto real del MVP: genomas con gtdb_family = 'Enterobacteriaceae'
// y selection IN ('forced', 'regprecise_source') — es decir, la referencia
// forzada (E. coli) más los genomas que tienen un regulón curado real detrás
// en RegPrecise, no solo un representative taxonómico sin gold standard.
//
// Confirmado por consulta directa a MariaDB (regulon_atlas.genomes) el
// 2026-09-22. Si este conjunto cambia, edita SOLO este archivo — todos los
// componentes del dashboard lo importan desde acá.
export const COMPARISON_ACCESSIONS = [
  "GCF_000005845.2", // Escherichia coli str. K-12 substr. MG1655 (forced)
  "GCF_000016305.1", // Klebsiella pneumoniae subsp. pneumoniae MGH 78578
  "GCF_000011605.1", // Pectobacterium atrosepticum SCRI1043
  "GCF_000006945.2", // Salmonella enterica subsp. enterica serovar Typhimurium str. LT2
  "GCF_000016325.1", // Enterobacter sp. 638
  "GCF_000196155.1", // Photorhabdus laumondii subsp. laumondii TTO1
  "GCF_000027205.1", // Erwinia amylovora ATCC 49946
  "GCF_000069965.1", // Proteus mirabilis HI4320
];

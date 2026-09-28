SELECT g.genome_id, g.accession, g.selection, g.gtdb_family,
       COALESCE(h.n_hits, 0)   AS n_hits,
       COALESCE(h.n_motifs, 0) AS n_motifs,
       h.min_nlp, h.max_nlp,
       COALESCE(h.n_1e6, 0) AS n_1e6,
       COALESCE(h.n_1e7, 0) AS n_1e7,
       COALESCE(h.n_1e8, 0) AS n_1e8,
       h.max_stop
FROM genomes g
LEFT JOIN (
    SELECT genome_id,
           COUNT(*)                 AS n_hits,
           COUNT(DISTINCT motif_id) AS n_motifs,
           MIN(neg_log10_p)         AS min_nlp,
           MAX(neg_log10_p)         AS max_nlp,
           SUM(neg_log10_p >= 6)    AS n_1e6,
           SUM(neg_log10_p >= 7)    AS n_1e7,
           SUM(neg_log10_p >= 8)    AS n_1e8,
           MAX(hit_stop)            AS max_stop
    FROM fimo_hits
    GROUP BY genome_id
) h USING (genome_id)
ORDER BY n_hits;
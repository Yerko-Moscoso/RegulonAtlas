# Auditoría de datos — Semana 9

- fimo_hits: 54.575.443 hits, carga completa (p ≤ 1e-5; min -log10 p = 5,0).
- Atlas: 2.224 genomas (representative 2.220 + forced 3 + replacement 1); 2.222 con hits.
- Sin hits: 2 micoplasmas (sin TF elegibles, documentado en bitácora 2026-08-20).
- Ventanas promotoras de hasta 350 pb río arriba (max hit_stop = 350).
- Hits por umbral: 1e-6 = 10,1M; 1e-7 = 2,7M; 1e-8 = 1,0M.
- Redes materializadas por el pipeline externo: 5 (validated, high-precision, balanced, permissive, no-footprint), asociadas en la base a la fuente RegPrecise 3.0 (prov_id 5).
- Decisión: el dashboard muestra las redes de la base; el pipeline local se usa como validador independiente.

## network_metrics vs edges

- network_metrics solo cubre genomas del atlas (excluye regprecise_source, chromosome_level y expression_validation); además faltan entre 0 y 14 genomas representative por red.
- Los conteos no se reproducen desde edges (E. coli K-12, balanced: 68 TF / 310 dianas / 919 aristas en network_metrics vs 119 TF / 342 operones / 832 filas en edges).
- Decisión: recalcular métricas desde edges con NetworkX (semana 11) y comparar contra network_metrics como referencia externa.
# Informe MVP: redes regulatorias predichas (mvp)

Generado: 2026-09-24 11:48 UTC · commit `483070c73f` (con cambios sin commit)

## 1. Datos y parámetros

- Subconjunto: 8 genomas. Enterobacteriaceae con regulones curados en RegPrecise (gtdb_family = 'Enterobacteriaceae' AND selection IN ('forced','regprecise_source')).
- Caché exportado el 2026-09-23 desde MariaDB (10.6.23-MariaDB-0ubuntu0.22.04.1, acceso de solo lectura); 223,278 hits FIMO con p ≤ 1e-5.
- Umbral de la red: p ≤ 1e-5. Reglas de elegibilidad: source_genome, ortholog. Propagación por operones: sí.
- Gold standard: RegPrecise 3.2 (curated_regulons).

## 2. Detección de ortólogos del TF

Pares motivo–genoma evaluados como elegibles: 9,753; usados por la red: 5,220.

| source_genome | ortholog | ortholog_og | name_match |
|---|---|---|---|
| 628 | 4592 | 4434 | 99 |

TF curados de la referencia sin motivo elegible: YihL.

## 3. Redes y métricas topológicas

| Organismo | Accession | Genoma (Mb) | Genes | TF | Blancos | Aristas | Por operón | Densidad | Grado medio | Hubs (>20) |
|---|---|---|---|---|---|---|---|---|---|---|
| Escherichia coli str. K-12 substr. MG1655 | GCF_000005845.2 | 4.64 | 4506 | 149 | 3864 | 14,453 | 7,001 | 0.0009 | 3.60 | 127 |
| Klebsiella pneumoniae subsp. pneumoniae MGH 78578 | GCF_000016305.1 | 5.69 | 5444 | 141 | 4609 | 18,809 | 9,551 | 0.0008 | 3.96 | 127 |
| Pectobacterium atrosepticum SCRI1043 | GCF_000011605.1 | 5.06 | 4502 | 97 | 3633 | 10,443 | 4,840 | 0.0008 | 2.80 | 86 |
| Salmonella enterica subsp. enterica serovar Typhimurium str. LT2 | GCF_000006945.2 | 4.95 | 4678 | 114 | 3767 | 11,928 | 5,829 | 0.0008 | 3.07 | 95 |
| Enterobacter sp. 638 | GCF_000016325.1 | 4.68 | 4471 | 122 | 3791 | 12,925 | 6,728 | 0.0008 | 3.30 | 107 |
| Photorhabdus laumondii subsp. laumondii TTO1 | GCF_000196155.1 | 5.69 | 4835 | 80 | 3940 | 10,471 | 4,837 | 0.0006 | 2.60 | 72 |
| Erwinia amylovora ATCC 49946 | GCF_000027205.1 | 3.9 | 3497 | 87 | 2814 | 8,258 | 3,934 | 0.0010 | 2.85 | 72 |
| Proteus mirabilis HI4320 | GCF_000069965.1 | 4.1 | 3745 | 86 | 3102 | 8,275 | 4,044 | 0.0008 | 2.60 | 70 |

Grado medio = aristas / nodos. Nodos = TF + genes blanco.

## 4. Validación (p ≤ 1e-5)

| Organismo | Variante | Estado | TP | FP | FN | Precisión | Recall | F1 |
|---|---|---|---|---|---|---|---|---|
| Escherichia coli str. K-12 substr. MG1655 | with_operons | ok | 937 | 13,209 | 639 | 6.6% | 59.5% | 11.9% |
| Escherichia coli str. K-12 substr. MG1655 | direct_only | ok | 456 | 6,847 | 1120 | 6.2% | 28.9% | 10.3% |
| Klebsiella pneumoniae subsp. pneumoniae MGH 78578 | with_operons | no_overlap | 0 | 18,542 | 1266 | 0.0% | 0.0% | 0.0% |
| Klebsiella pneumoniae subsp. pneumoniae MGH 78578 | direct_only | no_overlap | 0 | 9,133 | 1266 | 0.0% | 0.0% | 0.0% |
| Pectobacterium atrosepticum SCRI1043 | with_operons | no_overlap | 0 | 10,274 | 922 | 0.0% | 0.0% | 0.0% |
| Pectobacterium atrosepticum SCRI1043 | direct_only | no_overlap | 0 | 5,513 | 922 | 0.0% | 0.0% | 0.0% |
| Salmonella enterica subsp. enterica serovar Typhimurium str. LT2 | with_operons | ok | 673 | 10,951 | 669 | 5.8% | 50.1% | 10.4% |
| Salmonella enterica subsp. enterica serovar Typhimurium str. LT2 | direct_only | ok | 347 | 5,616 | 995 | 5.8% | 25.9% | 9.5% |
| Enterobacter sp. 638 | with_operons | no_overlap | 0 | 12,663 | 1187 | 0.0% | 0.0% | 0.0% |
| Enterobacter sp. 638 | direct_only | no_overlap | 0 | 6,073 | 1187 | 0.0% | 0.0% | 0.0% |
| Photorhabdus laumondii subsp. laumondii TTO1 | with_operons | no_overlap | 0 | 10,265 | 615 | 0.0% | 0.0% | 0.0% |
| Photorhabdus laumondii subsp. laumondii TTO1 | direct_only | no_overlap | 0 | 5,540 | 615 | 0.0% | 0.0% | 0.0% |
| Erwinia amylovora ATCC 49946 | with_operons | no_overlap | 0 | 8,158 | 536 | 0.0% | 0.0% | 0.0% |
| Erwinia amylovora ATCC 49946 | direct_only | no_overlap | 0 | 4,272 | 536 | 0.0% | 0.0% | 0.0% |
| Proteus mirabilis HI4320 | with_operons | no_overlap | 0 | 8,127 | 760 | 0.0% | 0.0% | 0.0% |
| Proteus mirabilis HI4320 | direct_only | no_overlap | 0 | 4,164 | 760 | 0.0% | 0.0% | 0.0% |

`no_overlap`: el genoma tiene regulones curados, pero sus locus tags (anteriores a la reanotación PGAP de RefSeq) no coinciden con los del genoma; TP = 0 no es un resultado biológico.

### Curva de la referencia (Escherichia coli str. K-12 substr. MG1655)

| p | true_positives | false_positives | false_negatives | Precisión | Recall | F1 |
|---|---|---|---|---|---|---|
| 1e-5 | 937 | 13209 | 639 | 6.6% | 59.5% | 11.9% |
| 1e-5.5 | 805 | 5233 | 771 | 13.3% | 51.1% | 21.1% |
| 1e-6 | 612 | 2440 | 964 | 20.1% | 38.8% | 26.4% |
| 1e-6.5 | 505 | 1208 | 1071 | 29.5% | 32.0% | 30.7% |
| 1e-7 | 418 | 683 | 1158 | 38.0% | 26.5% | 31.2% |

## 5. Reproducibilidad

```
make cache   # una vez, requiere acceso de lectura a MariaDB
make mvp     # regenera todo desde el caché: ortólogos, redes, métricas, validación e informe
```

Cada etapa deja un `*.provenance.json` con parámetros, commit y sha256 de entradas y salidas.

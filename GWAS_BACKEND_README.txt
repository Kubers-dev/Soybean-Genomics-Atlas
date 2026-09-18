SOYBEAN GENOMICS ATLAS — GWAS BACKEND
==========================================

This backend is deliberately separate from the locked one-year and multi-year
phenotype analysis.

Files:
  gwas-analysis.html       existing GWAS UI
  js/gwas-analysis.js      existing GWAS UI logic
  gwas_backend.R           actual rMVP/MVP execution
  gwas_server.py           local HTTP bridge
  GWAS_BACKEND_README.txt  this file

IMPORTANT
---------
The website itself is static. rMVP is R software and cannot execute inside
GitHub Pages. For actual GWAS, run this local bridge or deploy the same backend
on a server that has R + the supplied MVP/rMVP package installed.

The R wrapper uses:
  MVP()
  method = GLM / MLM / FarmCPU
  nPC.GLM / nPC.MLM / nPC.FarmCPU for PCA structure
  threshold for the user-entered P-value cutoff
  maxLine=10000
  vc.method="BRENT"
  method.bin="static"
  file.output=c("pmap","pmap.signal","plot","log")

The wrapper does NOT fabricate P-values. The Excel workbook is populated from
the p-value maps written by rMVP.

INPUT FORMAT
------------
Phenotype:
  tab-delimited text
  first column = taxa/accession ID
  remaining columns = traits

Genotype:
  rMVP HapMap input is supported. For numeric MVP input, provide a map.

Map:
  first three columns = SNP, chromosome, physical position

The phenotype accession IDs MUST match the genotype individual IDs and order.
Do not guess row-to-accession mapping.

P-VALUE THRESHOLD
-----------------
The threshold is used for the Significant SNPs sheet. Example: 1e-6.

MAXIMUM TRAITS
--------------
8 traits per run.

NEXT INTEGRATION
----------------
Connect the existing GWAS tab's Run button to POST /run-gwas and decode
xlsx_base64 into GWAS_results.xlsx. Keep the existing one-year and multi-year
files untouched.

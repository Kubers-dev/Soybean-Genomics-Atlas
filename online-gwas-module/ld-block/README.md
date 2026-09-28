# Online GWAS — LD Block module

This module uses **LDBlockShow + ShowLDSVG** for the LD/haplotype-block result. It is intentionally isolated from the existing GWAS implementation.

Official tool: https://github.com/BGI-shenzhen/LDBlockShow

## Local setup

From the Online GWAS module/backend directory, install LDBlockShow on Linux/WSL. The official documentation lists `g++`, zlib and Perl/SVG support as prerequisites and documents the `LDBlockShow` and `ShowLDSVG` commands.

Then install the Python backend dependency:

```bash
python3 -m pip install flask flask-cors
```

Start:

```bash
python3 ldblock_backend.py
```

Backend:

```text
http://127.0.0.1:8766
```

## LDBlockShow workflow

The backend runs:

```text
LDBlockShow
  -InVCF
  -OutPut
  -Region
  -SeleVar
  -BlockType
  -MAF
  -Miss
  -OutPng
  -OutPdf
  [ -InGWAS ]
  [ -InGFF ]

ShowLDSVG
  -InPreFix
  -OutPut
  -ShowNum
  -OutPng
  -OutPdf
  [ -InGWAS -Cutline ]
  [ -InGFF ]
```

The default web settings use R², PLINK/Gabriel blocks, MAF 0.05, missingness 0.25, and display LD values. These correspond to documented LDBlockShow parameters; they are UI defaults, not replacements for the tool's methodology.

## Inputs

- Required: VCF/VCF.GZ and genomic region.
- Optional: GWAS P-value file (`chr site Pvalue`) and GFF3 annotation.

The output is the actual LDBlockShow/ShowLDSVG SVG/PNG/PDF plus `.blocks.gz`, `.site.gz`, `.TriangleV.gz`, and the execution log when generated.

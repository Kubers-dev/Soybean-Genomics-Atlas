ONLINE GWAS MODULE
==================

This module is intentionally separate from the existing GWAS Analysis tab.
Do not modify: gwas-analysis.html, js/gwas-analysis.js, gwas_server.py, or GWAS_R_EDITOR.R.

Files:
- online-gwas.html
- js/online-gwas.js
- online-gwas-backend/app.py
- online-gwas-backend/GWAS_R_ONLINE.R
- online-gwas-backend/Dockerfile
- online-gwas-backend/requirements.txt
- online-gwas-backend/render.yaml

The R pipeline is based on the supplied working GWAS_R_EDITOR.R logic, but uses uploaded-file paths instead of machine-specific Windows paths.

Local backend test:
  cd online-gwas-backend
  docker build -t soybean-online-gwas .
  docker run --rm -p 8000:8000 soybean-online-gwas
  curl http://127.0.0.1:8000/health

# GWAS tab — ready structure

This package adds a standalone GWAS Analysis tab for the Soybean Genomics Atlas.

Included UI:
- Phenotype, genotype and SNP-map upload
- Optional kinship, PC and covariate upload
- Select GLM, MLM and/or FarmCPU
- Select no correction, PCA, Kinship, or PCA + Kinship
- Select number of PCs per model
- PCA plot
- Kinship heatmap
- LD-decay plot
- Trait selector
- GWAS results area
- Excel export hook

Important:
The supplied rMVP code specifies GLM, MLM and FarmCPU and supports PCA/kinship/covariate inputs. This front-end does NOT fabricate GWAS P-values. The Run GWAS button currently prepares the selected configuration and reserves the results area for the real rMVP/MVP computation backend.

Files:
- gwas-analysis.html
- js/gwas-analysis.js

Integration:
1. Add the GWAS tab/navigation link to the existing website.
2. Add gwas-analysis.html as the new tab/page.
3. Keep the existing one-year and multi-year phenotype files unchanged.
4. Connect the Run GWAS action to the R/rMVP backend using the exact input formats supplied for the project.

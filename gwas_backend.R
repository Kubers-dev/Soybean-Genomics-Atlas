#!/usr/bin/env Rscript
# Soybean Genomics Atlas — rMVP GWAS backend
# Uses the installed rMVP/MVP package; no GWAS statistics are fabricated.
suppressPackageStartupMessages({
  library(rMVP)
  library(openxlsx)
})

args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 7) stop("Usage: gwas_backend.R phe geno map outdir traits models structure threshold")
phe_file <- args[1]; geno_file <- args[2]; map_file <- args[3]
outdir <- args[4]; traits_arg <- args[5]; models_arg <- args[6]
structure <- args[7]; threshold <- as.numeric(args[8])
dir.create(outdir, recursive=TRUE, showWarnings=FALSE)

traits <- strsplit(traits_arg, ",", fixed=TRUE)[[1]]
models <- strsplit(models_arg, ",", fixed=TRUE)[[1]]
models <- intersect(models, c("GLM","MLM","FarmCPU"))
if (!length(models)) stop("At least one of GLM, MLM, FarmCPU is required.")
if (length(traits) > 8) stop("A maximum of 8 traits can be analyzed in one run.")
if (!is.finite(threshold) || threshold <= 0 || threshold >= 1) stop("P-value threshold must be between 0 and 1.")

phe <- read.table(phe_file, header=TRUE, sep="\t", check.names=FALSE, stringsAsFactors=FALSE, na.strings=c("NA","","NaN"))
if (ncol(phe) < 2) stop("Phenotype file must contain taxa/accession in column 1 and at least one trait.")

# rMVP expects the first phenotype column to be taxa names.
if (!all(traits %in% colnames(phe))) stop("One or more selected traits are absent from the phenotype file.")

# Detect input genotype format. HapMap is identified from its required rs#/alleles/chrom/pos fields.
geno_head <- readLines(geno_file, n=1, warn=FALSE)
is_hmp <- grepl("rs#|alleles.*chrom.*pos", geno_head, ignore.case=TRUE)

prefix <- file.path(outdir, "mvp")
if (is_hmp) {
  MVP.Data(fileHMP=geno_file, filePhe=phe_file, sep.hmp="\t", sep.phe="\t",
           fileKin=FALSE, filePC=FALSE, out=prefix)
  geno <- attach.big.matrix(paste0(prefix, ".geno.desc"))
  map <- read.table(paste0(prefix, ".geno.map"), header=TRUE, sep="\t", check.names=FALSE)
} else {
  if (!file.exists(map_file)) stop("Numeric genotype input requires a SNP map file.")
  MVP.Data(fileNum=geno_file, filePhe=phe_file, fileMap=map_file,
           sep.num="\t", sep.phe="\t", sep.map="\t",
           fileKin=FALSE, filePC=FALSE, out=prefix)
  geno <- attach.big.matrix(paste0(prefix, ".geno.desc"))
  map <- read.table(paste0(prefix, ".geno.map"), header=TRUE, sep="\t", check.names=FALSE)
}

# Optional structure is deliberately explicit: PCA uses rMVP nPC arguments;
# Kinship is computed by rMVP when MLM is selected. PCA+Kinship means both.
nPC <- 0L
if (structure %in% c("PCA","PCA + Kinship")) nPC <- 3L

method <- models
all_results <- list()

for (trait in traits) {
  phe_one <- phe[, c(1, match(trait, colnames(phe))), drop=FALSE]
  names(phe_one) <- c("Taxa", trait)

  args_mvp <- list(
    phe=phe_one, geno=geno, map=map,
    maxLine=10000,
    vc.method="BRENT",
    method.bin="static",
    threshold=threshold,
    method=method,
    file.output=c("pmap","pmap.signal","plot","log")
  )

  # Do not pass K when the user requested no kinship. rMVP computes K for MLM
  # when needed by its own workflow. PCA is passed through nPC.* exactly as
  # documented by rMVP.
  if (structure %in% c("PCA","PCA + Kinship")) {
    args_mvp$nPC.GLM <- nPC
    args_mvp$nPC.MLM <- nPC
    args_mvp$nPC.FarmCPU <- nPC
  }

  res <- do.call(MVP, args_mvp)

  # rMVP writes p-value maps. Collect any generated pmap files for this trait.
  candidates <- list.files(outdir, recursive=TRUE, full.names=TRUE)
  pfiles <- candidates[grepl("pmap", basename(candidates), ignore.case=TRUE) &
                       grepl("\\.(txt|csv|tsv)$", candidates, ignore.case=TRUE)]
  if (length(pfiles)) {
    for (f in pfiles) {
      z <- tryCatch(read.table(f, header=TRUE, sep="\t", check.names=FALSE,
                               stringsAsFactors=FALSE), error=function(e) NULL)
      if (!is.null(z) && ncol(z) >= 4) {
        z$Trait <- trait
        z$SourceFile <- basename(f)
        all_results[[length(all_results)+1]] <- z
      }
    }
  }
  gc()
}

if (!length(all_results)) {
  stop("rMVP completed but no p-value map files were found in the output directory. Inspect the rMVP log files.")
}

res <- do.call(rbind, all_results)
# Normalize common rMVP output naming without inventing values.
pcol <- grep("^p$|p.value|pvalue|p-val|p_value", names(res), ignore.case=TRUE, value=TRUE)[1]
if (is.na(pcol)) {
  # In rMVP pmap output, trait columns can be named by trait. Preserve all columns
  # and create a long table only where a numeric trait-p column is unambiguous.
  numeric_cols <- names(res)[vapply(res, is.numeric, logical(1))]
  numeric_cols <- setdiff(numeric_cols, c("Position","pos","Chr","Chromosome"))
  if (length(numeric_cols) == 1) pcol <- numeric_cols[1]
}
if (is.na(pcol)) stop("Could not identify a P-value column in the rMVP output; no values were altered.")

res$P_value <- suppressWarnings(as.numeric(res[[pcol]]))
res$Significant <- is.finite(res$P_value) & res$P_value <= threshold

sig <- res[res$Significant, , drop=FALSE]

xlsx <- file.path(outdir, "GWAS_results.xlsx")
wb <- createWorkbook()
addWorksheet(wb, "All GWAS Results"); writeData(wb, "All GWAS Results", res)
addWorksheet(wb, "Significant SNPs"); writeData(wb, "Significant SNPs", sig)
addWorksheet(wb, "Settings")
settings <- data.frame(Parameter=c("Traits","Models","Structure","P-value threshold","Maximum traits"),
                        Value=c(paste(traits,collapse=", "),paste(models,collapse=", "),
                                structure,threshold,8))
writeData(wb, "Settings", settings)
saveWorkbook(wb, xlsx, overwrite=TRUE)

write.table(res, file.path(outdir,"GWAS_results.tsv"), sep="\t", quote=FALSE, row.names=FALSE)
write.table(sig, file.path(outdir,"Significant_SNPs.tsv"), sep="\t", quote=FALSE, row.names=FALSE)

cat(jsonlite::toJSON(list(
  status="ok", xlsx=basename(xlsx), n_results=nrow(res), n_significant=nrow(sig),
  traits=traits, models=models, structure=structure, threshold=threshold
), auto_unbox=TRUE))

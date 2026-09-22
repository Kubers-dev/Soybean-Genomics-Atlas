#!/usr/bin/env Rscript

args <- commandArgs(trailingOnly = TRUE)

if (length(args) < 3) {
  stop("Usage: GWAS_R_ONLINE.R phenotype genotype output_dir [models_csv]")
}

PHENOTYPE_FILE <- normalizePath(args[1], mustWork = TRUE)
GENOTYPE_FILE  <- normalizePath(args[2], mustWork = TRUE)
OUTPUT_DIR     <- normalizePath(args[3], mustWork = FALSE)

if (!dir.exists(OUTPUT_DIR)) {
  dir.create(OUTPUT_DIR, recursive = TRUE)
}

MODELS <- strsplit(
  if (length(args) >= 4) args[4] else "GLM,MLM,FarmCPU",
  ",",
  fixed = TRUE
)[[1]]

MODELS <- trimws(MODELS)
ALLOWED <- c("GLM", "MLM", "FarmCPU")
MODELS <- MODELS[MODELS %in% ALLOWED]

if (length(MODELS) == 0) {
  stop("No supported GWAS models were selected.")
}

suppressPackageStartupMessages({
  library(rMVP)
  library(readxl)
  library(data.table)
  library(bigmemory)
  library(parallel)
})

setwd(OUTPUT_DIR)

pipeline_start <- Sys.time()

cat("============================================\n")
cat("ONLINE rMVP GWAS PIPELINE\n")
cat("============================================\n")
cat("Phenotype:", PHENOTYPE_FILE, "\n")
cat("Genotype :", GENOTYPE_FILE, "\n")
cat("Models   :", paste(MODELS, collapse = ", "), "\n")

# ------------------------------------------------------------
# Read phenotype
# ------------------------------------------------------------

if (grepl("\\.csv$", PHENOTYPE_FILE, ignore.case = TRUE)) {
  phenotype_raw <- read.csv(
    PHENOTYPE_FILE,
    check.names = FALSE,
    stringsAsFactors = FALSE
  )
} else {
  phenotype_raw <- as.data.frame(
    read_excel(PHENOTYPE_FILE)
  )
}

if (ncol(phenotype_raw) < 2) {
  stop("Phenotype file must contain an accession column and at least one trait.")
}

taxa <- trimws(as.character(phenotype_raw[[1]]))

if (any(is.na(taxa)) || any(taxa == "")) {
  stop("The first phenotype column contains missing/empty accession names.")
}

phenotype <- phenotype_raw[, -1, drop = FALSE]

for (i in seq_len(ncol(phenotype))) {
  phenotype[[i]] <- suppressWarnings(
    as.numeric(phenotype[[i]])
  )
}

phenotype <- data.frame(
  Taxa = taxa,
  phenotype,
  check.names = FALSE
)

traits <- colnames(phenotype)[-1]

traits <- traits[
  sapply(
    phenotype[-1],
    function(x) any(!is.na(x))
  )
]

if (length(traits) == 0) {
  stop("No numeric phenotype traits containing data were found.")
}

phenotype <- phenotype[
  ,
  c("Taxa", traits),
  drop = FALSE
]

write.table(
  phenotype,
  "phenotype_clean.txt",
  sep = "\t",
  quote = FALSE,
  row.names = FALSE,
  na = "NA"
)

# ------------------------------------------------------------
# rMVP data preparation
# ------------------------------------------------------------

cat("Preparing rMVP genotype data...\n")

MVP.Data(
  fileHMP = GENOTYPE_FILE,
  filePhe = "phenotype_clean.txt",
  sep.hmp = "\t",
  sep.phe = "\t",
  SNP.effect = "Add",
  fileKin = TRUE,
  filePC = TRUE,
  out = "soybean_rMVP"
)

genotype <- attach.big.matrix(
  "soybean_rMVP.geno.desc"
)

phe <- read.table(
  "soybean_rMVP.phe",
  header = TRUE,
  sep = "\t",
  check.names = FALSE,
  stringsAsFactors = FALSE
)

map <- read.table(
  "soybean_rMVP.geno.map",
  header = TRUE,
  sep = "\t",
  check.names = FALSE,
  stringsAsFactors = FALSE
)

Kinship <- attach.big.matrix(
  "soybean_rMVP.kin.desc"
)

PC <- bigmemory::as.matrix(
  attach.big.matrix("soybean_rMVP.pc.desc")
)

N_INDIVIDUALS <- nrow(phe)
N_MARKERS <- nrow(map)

nPC_GLM <- min(5, ncol(PC))
nPC_MLM <- min(3, ncol(PC))
nPC_FarmCPU <- min(3, ncol(PC))

TOTAL_CORES <- parallel::detectCores()

if (is.na(TOTAL_CORES)) {
  TOTAL_CORES <- 2
}

NCPUS <- max(
  1,
  TOTAL_CORES - 1
)

cat("Individuals:", N_INDIVIDUALS, "\n")
cat("Markers   :", N_MARKERS, "\n")
cat("GLM PCs   :", nPC_GLM, "\n")
cat("MLM PCs   :", nPC_MLM, "\n")
cat("FarmCPU PCs:", nPC_FarmCPU, "\n")
cat("CPU cores :", NCPUS, "\n")

# ------------------------------------------------------------
# Summary file
# ------------------------------------------------------------

summary_file <- file.path(
  OUTPUT_DIR,
  "online_summary.tsv"
)

summary_header <- data.frame(
  Trait = character(),
  N = integer(),
  Markers = integer(),
  Models = character(),
  Status = character(),
  Runtime_seconds = numeric(),
  Error = character(),
  stringsAsFactors = FALSE
)

write.table(
  summary_header,
  summary_file,
  sep = "\t",
  quote = FALSE,
  row.names = FALSE
)

# ------------------------------------------------------------
# Run GWAS for every trait
# ------------------------------------------------------------

for (i in 2:ncol(phe)) {

  TRAIT <- colnames(phe)[i]

  phet <- phe[
    ,
    c(1, i),
    drop = FALSE
  ]

  colnames(phet) <- c(
    "Taxa",
    TRAIT
  )

  valid <- !is.na(phet[[2]])

  n <- sum(valid)

  trait_dir <- file.path(
    OUTPUT_DIR,
    paste0(
      "GWAS_",
      make.names(TRAIT)
    )
  )

  dir.create(
    trait_dir,
    recursive = TRUE,
    showWarnings = FALSE
  )

  trait_start <- Sys.time()

  status <- "completed"
  error_message <- ""

  if (n < 10) {

    status <- "skipped"
    error_message <- "Fewer than 10 non-missing observations."

  } else {

    old_dir <- getwd()

    setwd(trait_dir)

    tryCatch({

      cat(
        "Running trait:",
        TRAIT,
        "\n"
      )

      MVP(
        phe = phet,
        geno = genotype,
        map = map,
        K = Kinship,
        nPC.GLM = nPC_GLM,
        nPC.MLM = nPC_MLM,
        nPC.FarmCPU = nPC_FarmCPU,
        maxLine = 10000,
        ncpus = NCPUS,
        vc.method = "BRENT",
        method.bin = "static",
        threshold = 0.05,
        method = MODELS,
        file.output = c(
          "pmap",
          "pmap.signal",
          "plot",
          "log"
        )
      )

    }, error = function(e) {

      status <<- "failed"

      error_message <<- conditionMessage(e)

      writeLines(
        error_message,
        "ERROR.txt"
      )
    })

    setwd(old_dir)
  }

  trait_runtime <- as.numeric(
    difftime(
      Sys.time(),
      trait_start,
      units = "secs"
    )
  )

  write.table(
    data.frame(
      Trait = TRAIT,
      N = n,
      Markers = N_MARKERS,
      Models = paste(MODELS, collapse = ", "),
      Status = status,
      Runtime_seconds = round(trait_runtime, 2),
      Error = error_message,
      stringsAsFactors = FALSE
    ),
    summary_file,
    sep = "\t",
    quote = FALSE,
    row.names = FALSE,
    col.names = FALSE,
    append = TRUE
  )

  gc()
}

# ------------------------------------------------------------
# Pipeline summary
# ------------------------------------------------------------

total_runtime <- as.numeric(
  difftime(
    Sys.time(),
    pipeline_start,
    units = "secs"
  )
)

writeLines(
  c(
    paste("Individuals:", N_INDIVIDUALS),
    paste("Markers:", N_MARKERS),
    paste("Traits:", length(traits)),
    paste("Models:", paste(MODELS, collapse = ", ")),
    paste("Runtime_seconds:", round(total_runtime, 2))
  ),
  file.path(
    OUTPUT_DIR,
    "runtime_summary.txt"
  )
)

cat("\n============================================\n")
cat("ONLINE rMVP GWAS ANALYSIS COMPLETE\n")
cat("Individuals:", N_INDIVIDUALS, "\n")
cat("Markers:", N_MARKERS, "\n")
cat("Traits:", length(traits), "\n")
cat("Runtime:", round(total_runtime, 2), "seconds\n")
cat("============================================\n")

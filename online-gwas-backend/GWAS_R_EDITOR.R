############################################################
# rMVP GWAS PIPELINE
# Soybean Phenotype + HapMap Genotype
############################################################

# ==========================================================
# 1. PACKAGES
# ==========================================================

library(rMVP)
library(readxl)
library(data.table)
library(bigmemory)

# Optional parallel package
library(parallel)


# ==========================================================
# 2. INPUT FILES
# ==========================================================

PHENOTYPE_FILE <- "G:/soybean_atlas/WEBSITE/Soybean-Genomics-Atlas/phenotype_Count_GWAS_FIXED.xlsx"

GENOTYPE_FILE <- "C:/Users/taherilab/Desktop/SALK_GD_CLEANED.hmp.txt"


# ==========================================================
# 3. OUTPUT DIRECTORY
# ==========================================================

OUTPUT_DIR <- "G:/soybean_atlas/WEBSITE/Soybean-Genomics-Atlas/rMVP_GWAS_RESULTS"

if (!dir.exists(OUTPUT_DIR)) {
  dir.create(OUTPUT_DIR, recursive = TRUE)
}

setwd(OUTPUT_DIR)


# ==========================================================
# 4. CHECK INPUT FILES
# ==========================================================

if (!file.exists(PHENOTYPE_FILE)) {
  stop("Phenotype file not found:\n", PHENOTYPE_FILE)
}

if (!file.exists(GENOTYPE_FILE)) {
  stop("Genotype file not found:\n", GENOTYPE_FILE)
}

cat("\n============================================\n")
cat("rMVP GWAS PIPELINE\n")
cat("============================================\n")

cat("\nPhenotype:\n", PHENOTYPE_FILE, "\n")
cat("\nGenotype:\n", GENOTYPE_FILE, "\n")


# ==========================================================
# 5. READ PHENOTYPE EXCEL FILE
# ==========================================================

cat("\nReading phenotype Excel file...\n")

phenotype_raw <- read_excel(
  PHENOTYPE_FILE
)

phenotype_raw <- as.data.frame(phenotype_raw)

cat("\nPhenotype dimensions:\n")
cat("Rows:", nrow(phenotype_raw), "\n")
cat("Columns:", ncol(phenotype_raw), "\n")

cat("\nPhenotype columns:\n")
print(colnames(phenotype_raw))


# ==========================================================
# 6. FIRST COLUMN = TAXA / ACCESSION
# ==========================================================

taxa <- as.character(phenotype_raw[[1]])

taxa <- trimws(taxa)

if (any(is.na(taxa)) || any(taxa == "")) {
  stop("The first phenotype column contains missing/empty accession names.")
}

if (anyDuplicated(taxa)) {
  warning(
    "Duplicate accession names detected in phenotype file. ",
    "Please verify that each accession occurs only once."
  )
}


# ==========================================================
# 7. PHENOTYPE DATA
# ==========================================================

phenotype <- phenotype_raw[, -1, drop = FALSE]

# Convert all phenotype columns to numeric
for (i in seq_len(ncol(phenotype))) {

  phenotype[[i]] <- suppressWarnings(
    as.numeric(phenotype[[i]])
  )

}

# Restore taxa column
phenotype <- cbind(
  Taxa = taxa,
  phenotype
)

phenotype <- as.data.frame(phenotype)


# ==========================================================
# 8. REMOVE COMPLETELY EMPTY TRAITS
# ==========================================================

trait_names <- colnames(phenotype)[-1]

valid_traits <- trait_names[
  sapply(
    phenotype[-1],
    function(x) any(!is.na(x))
  )
]

phenotype <- phenotype[
  ,
  c("Taxa", valid_traits),
  drop = FALSE
]

trait_names <- valid_traits

cat("\nTraits detected:\n")
print(trait_names)

cat("\nNumber of traits:", length(trait_names), "\n")


# ==========================================================
# 9. SAVE CLEAN PHENOTYPE
# ==========================================================

write.table(
  phenotype,
  file = "phenotype_clean.txt",
  sep = "\t",
  quote = FALSE,
  row.names = FALSE,
  na = "NA"
)

cat("\nClean phenotype file created.\n")


# ==========================================================
# 10. rMVP DATA CONVERSION
# ==========================================================

cat("\n============================================\n")
cat("CONVERTING HAPMAP DATA FOR rMVP\n")
cat("============================================\n")

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

cat("\nGenotype conversion completed.\n")


# ==========================================================
# 11. LOAD rMVP DATA
# ==========================================================

cat("\nLoading rMVP genotype...\n")

genotype <- attach.big.matrix(
  "soybean_rMVP.geno.desc"
)

cat("Loading phenotype...\n")

phenotype_mvp <- read.table(
  "soybean_rMVP.phe",
  header = TRUE,
  sep = "\t",
  check.names = FALSE,
  stringsAsFactors = FALSE
)

cat("Loading SNP map...\n")

map <- read.table(
  "soybean_rMVP.geno.map",
  header = TRUE,
  sep = "\t",
  check.names = FALSE,
  stringsAsFactors = FALSE
)


# ==========================================================
# 12. LOAD KINSHIP
# ==========================================================

cat("\nLoading kinship matrix...\n")

Kinship <- attach.big.matrix(
  "soybean_rMVP.kin.desc"
)


# ==========================================================
# 13. LOAD PCA
# ==========================================================

cat("\nLoading principal components...\n")

PC <- bigmemory::as.matrix(
  attach.big.matrix(
    "soybean_rMVP.pc.desc"
  )
)

# Make sure enough PCs exist
if (ncol(PC) < 5) {

  warning(
    "Only ",
    ncol(PC),
    " PCs were generated. ",
    "Using available PCs."
  )

  nPC_GLM <- min(5, ncol(PC))
  nPC_MLM <- min(3, ncol(PC))
  nPC_FarmCPU <- min(3, ncol(PC))

} else {

  nPC_GLM <- 5
  nPC_MLM <- 3
  nPC_FarmCPU <- 3

}


# ==========================================================
# 14. CHECK DATA
# ==========================================================

cat("\n============================================\n")
cat("DATA SUMMARY\n")
cat("============================================\n")

cat("Individuals:", nrow(phenotype_mvp), "\n")
cat("Traits:", ncol(phenotype_mvp) - 1, "\n")
cat("Markers:", nrow(map), "\n")
cat("PCs:", ncol(PC), "\n")


# ==========================================================
# 15. CPU SETTINGS
# ==========================================================

TOTAL_CORES <- parallel::detectCores()

# Leave one CPU free for Windows/system
NCPUS <- max(1, TOTAL_CORES - 1)

cat("\nDetected CPU cores:", TOTAL_CORES, "\n")
cat("Using CPU cores:", NCPUS, "\n")


# ==========================================================
# 16. RUN rMVP GWAS FOR EVERY TRAIT
# ==========================================================

cat("\n============================================\n")
cat("STARTING GWAS\n")
cat("============================================\n")


GWAS_RESULTS <- list()


for (i in 2:ncol(phenotype_mvp)) {

  TRAIT <- colnames(phenotype_mvp)[i]

  cat("\n\n")
  cat("############################################\n")
  cat("TRAIT:", TRAIT, "\n")
  cat("TRAIT NUMBER:", i - 1, "OF", ncol(phenotype_mvp) - 1, "\n")
  cat("############################################\n")


  # --------------------------------------------------------
  # Create trait-specific phenotype
  # --------------------------------------------------------

  phe_trait <- phenotype_mvp[
    ,
    c(1, i),
    drop = FALSE
  ]

  colnames(phe_trait) <- c(
    "Taxa",
    TRAIT
  )


  # --------------------------------------------------------
  # Remove individuals with missing phenotype
  # --------------------------------------------------------

  valid <- !is.na(phe_trait[[2]])

  n_valid <- sum(valid)

  cat("Individuals with phenotype:", n_valid, "\n")

  if (n_valid < 10) {

    cat(
      "SKIPPED:",
      TRAIT,
      "- fewer than 10 observations.\n"
    )

    next
  }


  # --------------------------------------------------------
  # Output folder for trait
  # --------------------------------------------------------

  trait_dir <- file.path(
    OUTPUT_DIR,
    paste0(
      "GWAS_",
      make.names(TRAIT)
    )
  )

  if (!dir.exists(trait_dir)) {
    dir.create(
      trait_dir,
      recursive = TRUE
    )
  }


  # --------------------------------------------------------
  # Run rMVP
  # --------------------------------------------------------

  old_dir <- getwd()

  setwd(trait_dir)


  start_time <- Sys.time()

  cat(
    "GWAS started:",
    format(start_time),
    "\n"
  )


  result <- tryCatch({

    MVP(
      phe = phe_trait,
      geno = genotype,
      map = map,

      # Kinship calculated by rMVP
      K = Kinship,

      # Principal components
      nPC.GLM = nPC_GLM,
      nPC.MLM = nPC_MLM,
      nPC.FarmCPU = nPC_FarmCPU,

      # Performance
      maxLine = 10000,
      ncpus = NCPUS,

      # MLM
      vc.method = "BRENT",

      # FarmCPU
      method.bin = "static",

      # Significance threshold
      threshold = 0.05,

      # GWAS models
      method = c(
        "GLM",
        "MLM",
        "FarmCPU"
      ),

      # Save results
      file.output = c(
        "pmap",
        "pmap.signal",
        "plot",
        "log"
      )
    )

  }, error = function(e) {

    cat(
      "\nERROR in trait:",
      TRAIT,
      "\n"
    )

    cat(
      conditionMessage(e),
      "\n"
    )

    return(NULL)

  })


  end_time <- Sys.time()

  elapsed <- difftime(
    end_time,
    start_time,
    units = "mins"
  )


  cat(
    "\nTrait completed:",
    TRAIT,
    "\n"
  )

  cat(
    "Time:",
    round(
      as.numeric(elapsed),
      2
    ),
    "minutes\n"
  )


  GWAS_RESULTS[[TRAIT]] <- result


  # --------------------------------------------------------
  # Save timing
  # --------------------------------------------------------

  writeLines(
    c(
      paste("Trait:", TRAIT),
      paste("Start:", start_time),
      paste("End:", end_time),
      paste(
        "Minutes:",
        round(
          as.numeric(elapsed),
          2
        )
      ),
      paste(
        "N:",
        n_valid
      )
    ),
    file.path(
      trait_dir,
      "runtime.txt"
    )
  )


  # --------------------------------------------------------
  # Return to main output directory
  # --------------------------------------------------------

  setwd(old_dir)

  gc()

}


# ==========================================================
# 17. FINAL SUMMARY
# ==========================================================

cat("\n\n")
cat("============================================\n")
cat("rMVP GWAS ANALYSIS COMPLETE\n")
cat("============================================\n")

cat(
  "\nResults saved in:\n",
  OUTPUT_DIR,
  "\n"
)

cat(
  "\nTraits successfully processed:\n"
)

successful_traits <- names(
  GWAS_RESULTS[
    !sapply(
      GWAS_RESULTS,
      is.null
    )
  ]
)

print(successful_traits)


# ==========================================================
# 18. SAVE R SESSION OBJECT
# ==========================================================

save(
  GWAS_RESULTS,
  phenotype_mvp,
  map,
  file = file.path(
    OUTPUT_DIR,
    "rMVP_GWAS_workspace.RData"
  )
)

cat("\nWorkspace saved.\n")

cat("\nDONE.\n")
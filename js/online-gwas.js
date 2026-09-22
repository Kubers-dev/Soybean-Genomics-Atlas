(() => {

  const API_BASE =
    window.ONLINE_GWAS_API ||
    "";

  const $ = id =>
    document.getElementById(id);

  const selectedModels = () => [
    $("glm").checked ? "GLM" : null,
    $("mlm").checked ? "MLM" : null,
    $("farmcpu").checked ? "FarmCPU" : null
  ].filter(Boolean);

  const escapeHtml = value =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  function resultUrl(file) {
    return API_BASE + file.url;
  }

  function findFiles(files, pattern) {
    return files.filter(
      f => pattern.test(f.name)
    );
  }

  function makeLink(file, text) {

    const a = document.createElement("a");

    a.className = "result-link";
    a.href = resultUrl(file);
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = text || file.name;

    return a;
  }

  function renderSummary(data) {

    const traits = data.traits || [];

    const completed =
      traits.filter(
        t => t.status === "completed"
      );

    const summary = $("summary");

    summary.innerHTML = `
      <div class="summary-grid">

        <div class="summary-box">
          <div class="summary-label">Run ID</div>
          <div class="summary-value">
            ${escapeHtml(data.run_id)}
          </div>
        </div>

        <div class="summary-box">
          <div class="summary-label">Accessions</div>
          <div class="summary-value">
            ${escapeHtml(data.individuals ?? "—")}
          </div>
        </div>

        <div class="summary-box">
          <div class="summary-label">Markers</div>
          <div class="summary-value">
            ${escapeHtml(data.markers ?? "—")}
          </div>
        </div>

        <div class="summary-box">
          <div class="summary-label">Models</div>
          <div class="summary-value">
            ${escapeHtml((data.models || []).join(", "))}
          </div>
        </div>

        <div class="summary-box">
          <div class="summary-label">Runtime</div>
          <div class="summary-value">
            ${escapeHtml(
              data.runtime_seconds != null
                ? data.runtime_seconds + " s"
                : "—"
            )}
          </div>
        </div>

        <div class="summary-box">
          <div class="summary-label">Completed traits</div>
          <div class="summary-value">
            ${completed.length} / ${traits.length}
          </div>
        </div>

      </div>

      <h3>Trait analysis</h3>

      <table class="trait-table">

        <thead>
          <tr>
            <th>Trait</th>
            <th>N</th>
            <th>Markers</th>
            <th>Models</th>
            <th>Status</th>
            <th>Runtime</th>
          </tr>
        </thead>

        <tbody>

          ${
            traits.map(t => `
              <tr>

                <td>${escapeHtml(t.trait)}</td>

                <td>${escapeHtml(t.n ?? "—")}</td>

                <td>${escapeHtml(t.markers ?? "—")}</td>

                <td>${escapeHtml(
                  (t.models || []).join(", ")
                )}</td>

                <td class="${
                  t.status === "completed"
                    ? "completed"
                    : "failed"
                }">
                  ${escapeHtml(t.status)}
                </td>

                <td>${
                  t.runtime_seconds != null
                    ? escapeHtml(
                        t.runtime_seconds
                      ) + " s"
                    : "—"
                }</td>

              </tr>
            `).join("")
          }

        </tbody>

      </table>
    `;
  }

  function renderPlots(data) {

    const plotsCard =
      $("plotsCard");

    const plots =
      $("plots");

    plots.innerHTML = "";

    const files =
      data.files || [];

    const plotFiles =
      files.filter(
        f => /\.(jpg|jpeg|png)$/i.test(f.name)
      );

    plotFiles.forEach(file => {

      const card =
        document.createElement("div");

      card.className =
        "plot-card";

      const title =
        document.createElement("div");

      title.className =
        "plot-title";

      title.textContent =
        file.name;

      const img =
        document.createElement("img");

      img.src =
        resultUrl(file);

      img.alt =
        file.name;

      img.loading =
        "lazy";

      card.appendChild(title);
      card.appendChild(img);

      plots.appendChild(card);
    });

    plotsCard.classList.toggle(
      "hidden",
      plotFiles.length === 0
    );
  }

  function renderDownloads(data) {

    const downloadsCard =
      $("downloadsCard");

    const downloads =
      $("downloads");

    downloads.innerHTML = "";

    const files =
      data.files || [];

    const csvFiles =
      files.filter(
        f => /\.csv$/i.test(f.name)
      );

    const otherFiles =
      files.filter(
        f =>
          !/\.(jpg|jpeg|png|csv)$/i.test(
            f.name
          )
      );

    const groups = [];

    if (csvFiles.length) {

      const group =
        document.createElement("div");

      group.className =
        "result-group";

      group.innerHTML =
        "<h3>GWAS tables</h3>";

      csvFiles.forEach(file => {

        const model =
          file.name
            .replace(/\.csv$/i, "")
            .split(".")
            .pop();

        group.appendChild(
          makeLink(
            file,
            `Download ${model} results`
          )
        );
      });

      groups.push(group);
    }

    if (otherFiles.length) {

      const group =
        document.createElement("div");

      group.className =
        "result-group";

      group.innerHTML =
        "<h3>Other files</h3>";

      otherFiles.forEach(file => {

        group.appendChild(
          makeLink(
            file,
            `Download ${file.name}`
          )
        );
      });

      groups.push(group);
    }

    groups.forEach(
      group => downloads.appendChild(group)
    );

    downloadsCard.classList.toggle(
      "hidden",
      groups.length === 0
    );
  }

  $("runBtn").onclick = async () => {

    const phenotype =
      $("phenotype").files[0];

    const genotype =
      $("genotype").files[0];

    const selected =
      selectedModels();

    if (!phenotype || !genotype) {

      $("status").textContent =
        "Select both phenotype and genotype files.";

      $("status").className =
        "status error";

      return;
    }

    if (!selected.length) {

      $("status").textContent =
        "Select at least one GWAS model.";

      $("status").className =
        "status error";

      return;
    }

    const formData =
      new FormData();

    formData.append(
      "phenotype",
      phenotype
    );

    formData.append(
      "genotype",
      genotype
    );

    formData.append(
      "models",
      JSON.stringify(selected)
    );

    $("runBtn").disabled =
      true;

    $("resultsCard")
      .classList.add("hidden");

    $("plotsCard")
      .classList.add("hidden");

    $("downloadsCard")
      .classList.add("hidden");

    $("status").className =
      "status";

    $("status").textContent =
      "Uploading files and running rMVP GWAS...\n\n" +
      "This may take several minutes for large genotype files.";

    try {

      const response =
        await fetch(
          `${API_BASE}/api/gwas/run`,
          {
            method: "POST",
            body: formData
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
          `HTTP ${response.status}`
        );
      }

      $("status").className =
        "status success";

      $("status").textContent =
        `GWAS completed successfully.\n\n` +
        `Run ID: ${data.run_id}\n` +
        `Traits analyzed: ${(data.traits || []).length}\n` +
        `Runtime: ${
          data.runtime_seconds != null
            ? data.runtime_seconds + " seconds"
            : "—"
        }`;

      renderSummary(data);
      renderPlots(data);
      renderDownloads(data);

      $("resultsCard")
        .classList.remove("hidden");

    } catch (error) {

      $("status").className =
        "status error";

      $("status").textContent =
        "Online GWAS failed:\n\n" +
        error.message;

    } finally {

      $("runBtn").disabled =
        false;
    }
  };

})();


/* ============================================================
   LOCAL R GWAS PACKAGE
   This is separate from the existing Online GWAS API workflow.
   ============================================================ */

(() => {
  "use strict";

  const localButton =
    document.getElementById("localRBtn");

  if (!localButton) return;

  const MASTER_R_URL =
    "https://raw.githubusercontent.com/Kubers-dev/Soybean-Genomics-Atlas/main/GWAS_R_EDITOR.R";

  function extensionOf(name) {
    const match =
      name.toLowerCase().match(/(\.[a-z0-9]+)$/);

    return match ? match[1] : "";
  }

  localButton.onclick = async () => {

    const phenotype =
      document.getElementById("phenotype").files[0];

    const genotype =
      document.getElementById("genotype").files[0];

    if (!phenotype || !genotype) {

      document.getElementById("status").textContent =
        "Select both phenotype and genotype files first.";

      document.getElementById("status").className =
        "status error";

      return;
    }

    if (typeof JSZip === "undefined") {

      document.getElementById("status").textContent =
        "ZIP package support is unavailable. Please refresh the page.";

      document.getElementById("status").className =
        "status error";

      return;
    }

    localButton.disabled = true;

    document.getElementById("status").className =
      "status";

    document.getElementById("status").textContent =
      "Preparing your local R GWAS package...";

    try {

      const response =
        await fetch(
          MASTER_R_URL,
          {
            cache: "no-store"
          }
        );

      if (!response.ok) {
        throw new Error(
          "Could not retrieve the master GWAS R script."
        );
      }

      const masterR =
        await response.text();

      const zip =
        new JSZip();

      /*
       * The launcher checks and installs all required packages.
       * It then creates a temporary execution copy of the master
       * GWAS script with only the input/output paths replaced.
       */

      const launcher = `
# ============================================================
# Soybean Genomics Atlas - Local GWAS Launcher
# ============================================================

options(
  repos = c(
    CRAN = "https://cloud.r-project.org"
  )
)

required <- c(
  "rMVP",
  "readxl",
  "data.table",
  "bigmemory"
)

missing <- required[
  !vapply(
    required,
    requireNamespace,
    logical(1),
    quietly = TRUE
  )
]

if (length(missing) > 0) {

  message(
    "Installing missing R packages: ",
    paste(missing, collapse = ", ")
  )

  install.packages(
    missing,
    dependencies = TRUE
  )
}

if (!requireNamespace(
      "rMVP",
      quietly = TRUE
    )) {

  stop(
    "rMVP installation failed."
  )
}

root <-
  normalizePath(
    getwd(),
    winslash = "/",
    mustWork = TRUE
  )

phenotype_candidates <-
  list.files(
    root,
    pattern =
      "^PHENOTYPE_INPUT",
    ignore.case = TRUE,
    full.names = TRUE
  )

genotype_candidates <-
  list.files(
    root,
    pattern =
      "^GENOTYPE_INPUT",
    ignore.case = TRUE,
    full.names = TRUE
  )

if (length(phenotype_candidates) != 1) {

  stop(
    "Could not uniquely identify PHENOTYPE_INPUT."
  )
}

if (length(genotype_candidates) != 1) {

  stop(
    "Could not uniquely identify GENOTYPE_INPUT."
  )
}

phenotype_file <-
  phenotype_candidates[1]

genotype_file <-
  genotype_candidates[1]

output_dir <-
  file.path(
    root,
    "GWAS_RESULTS"
  )

dir.create(
  output_dir,
  recursive = TRUE,
  showWarnings = FALSE
)

master_file <-
  file.path(
    root,
    "GWAS_R_EDITOR.R"
  )

if (!file.exists(master_file)) {

  stop(
    "GWAS_R_EDITOR.R was not found."
  )
}

code <-
  readLines(
    master_file,
    warn = FALSE,
    encoding = "UTF-8"
  )

quote_path <- function(path) {

  path <-
    normalizePath(
      path,
      winslash = "/",
      mustWork = FALSE
    )

  paste0(
    '"',
    gsub(
      '"',
      '\\\\\\\\\\"',
      path,
      fixed = TRUE
    ),
    '"'
  )
}

replace_assignment <- function(
  code,
  name,
  value
) {

  pattern <-
    paste0(
      "^\\\\s*",
      name,
      "\\\\s*<-\\\\s*.*$"
    )

  hit <-
    grepl(
      pattern,
      code
    )

  if (!any(hit)) {

    stop(
      "Could not find assignment: ",
      name
    )
  }

  code[
    which(hit)[1]
  ] <-
    paste0(
      name,
      " <- ",
      quote_path(value)
    )

  code
}

code <-
  replace_assignment(
    code,
    "PHENOTYPE_FILE",
    phenotype_file
  )

code <-
  replace_assignment(
    code,
    "GENOTYPE_FILE",
    genotype_file
  )

code <-
  replace_assignment(
    code,
    "OUTPUT_DIR",
    output_dir
  )

execution_file <-
  file.path(
    root,
    "GWAS_EXECUTION.R"
  )

writeLines(
  code,
  execution_file,
  useBytes = TRUE
)

message("")
message(
  "============================================================"
)

message(
  "Soybean Genomics Atlas GWAS"
)

message(
  "============================================================"
)

message(
  "Phenotype: ",
  basename(phenotype_file)
)

message(
  "Genotype: ",
  basename(genotype_file)
)

message("")
message(
  "Starting GLM / MLM / FarmCPU..."
)

message("")

source(
  execution_file,
  echo = TRUE
)

message("")
message(
  "============================================================"
)

message(
  "GWAS COMPLETED"
)

message(
  "Results: ",
  output_dir
)

message(
  "============================================================"
)
`;

      const bat = `
@echo off
title Soybean Genomics Atlas - Online GWAS

cd /d "%~dp0"

echo.
echo ============================================================
echo   Soybean Genomics Atlas - Local GWAS
echo ============================================================
echo.

where Rscript >nul 2>&1

if errorlevel 1 (
    echo ERROR: Rscript was not found.
    echo.
    echo Please install R first:
    echo https://cran.r-project.org/
    echo.
    pause
    exit /b 1
)

echo Rscript found.
echo.
echo Checking and installing required R packages if needed...
echo.

Rscript --vanilla Run_Online_GWAS.R

if errorlevel 1 (
    echo.
    echo ============================================================
    echo   GWAS FAILED
    echo ============================================================
    echo.
    echo Review the messages above.
    echo.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo   GWAS COMPLETED SUCCESSFULLY
echo ============================================================
echo.
echo Results are located in:
echo GWAS_RESULTS
echo.

pause
`;

      const readme = `
SOYBEAN GENOMICS ATLAS
LOCAL R GWAS PACKAGE
=====================

REQUIREMENT
-----------
R must be installed.

You do NOT need to manually install:

- rMVP
- RStudio
- Python
- Ubuntu
- Docker
- PLINK

RUNNING ON WINDOWS
------------------
1. Extract this ZIP file.
2. Double-click:

   RUN_GWAS.bat

3. The launcher checks for the required R packages.
4. Missing packages are installed automatically.
5. Your phenotype and genotype files are used.
6. The exact Soybean Genomics Atlas GWAS workflow is executed.
7. Results are written to:

   GWAS_RESULTS/

GWAS MODELS
-----------
The master workflow uses:

- GLM
- MLM
- FarmCPU

IMPORTANT
---------
The included GWAS_R_EDITOR.R is the master GWAS script.

The launcher does NOT modify that master file.

Instead, it creates a temporary:

   GWAS_EXECUTION.R

with the phenotype, genotype, and output paths configured for
the files contained in this package.

DATA PRIVACY
------------
The phenotype and genotype files remain on the researcher's
computer in this local workflow.

They are not uploaded to a cloud GWAS server by this package.
`;

      zip.file(
        "PHENOTYPE_INPUT" +
          extensionOf(phenotype.name),
        await phenotype.arrayBuffer()
      );

      zip.file(
        "GENOTYPE_INPUT" +
          extensionOf(genotype.name),
        await genotype.arrayBuffer()
      );

      zip.file(
        "GWAS_R_EDITOR.R",
        masterR
      );

      zip.file(
        "Run_Online_GWAS.R",
        launcher.trimStart()
      );

      zip.file(
        "RUN_GWAS.bat",
        bat.trimStart()
      );

      zip.file(
        "README.txt",
        readme.trimStart()
      );

      document.getElementById("status").textContent =
        "Creating downloadable GWAS package...";

      const blob =
        await zip.generateAsync({
          type: "blob",
          compression: "DEFLATE"
        });

      const url =
        URL.createObjectURL(blob);

      const link =
        document.createElement("a");

      link.href = url;

      link.download =
        "Soybean_Atlas_Local_R_GWAS.zip";

      document.body.appendChild(link);

      link.click();

      link.remove();

      setTimeout(
        () => URL.revokeObjectURL(url),
        5000
      );

      document.getElementById("status").className =
        "status success";

      document.getElementById("status").textContent =
        "GWAS package downloaded successfully. " +
        "Extract it and double-click RUN_GWAS.bat.";

    } catch (error) {

      console.error(error);

      document.getElementById("status").className =
        "status error";

      document.getElementById("status").textContent =
        "Could not create the local GWAS package: " +
        error.message;

    } finally {

      localButton.disabled = false;
    }
  };

})();

(() => {
  "use strict";

  const API = "http://127.0.0.1:8765";

  const phenotypeInput = document.getElementById("gwasPhenotype");
  const genotypeInput = document.getElementById("gwasGenotype");
  const codeEditor = document.getElementById("rCodeEditor");
  const loadCodeButton = document.getElementById("loadRCode");
  const runButton = document.getElementById("runGWAS");

  const inputStatus = document.getElementById("gwasInputStatus");
  const runStatus = document.getElementById("gwasRunStatus");

  const runState = document.getElementById("runState");
  const runId = document.getElementById("runId");
  const runTime = document.getElementById("runTime");
  const exitCode = document.getElementById("exitCode");

  const progressBar = document.getElementById("progressBar");
  const progressText = document.getElementById("progressText");

  const resultsSection = document.getElementById("resultsSection");
  const resultsList = document.getElementById("resultsList");

  const outputSection = document.getElementById("outputSection");
  const rOutput = document.getElementById("rOutput");

  const errorSection = document.getElementById("errorSection");
  const rError = document.getElementById("rError");

  function setStatus(element, message, type = "") {
    element.textContent = message;
    element.className = "status";
    if (type) element.classList.add(type);
  }

  function updateInputStatus() {
    const phenotype = phenotypeInput.files[0];
    const genotype = genotypeInput.files[0];

    if (phenotype && genotype) {
      setStatus(
        inputStatus,
        `Ready: ${phenotype.name} + ${genotype.name}`,
        "success"
      );
    } else if (phenotype) {
      setStatus(
        inputStatus,
        "Phenotype selected. Please select the genotype file."
      );
    } else if (genotype) {
      setStatus(
        inputStatus,
        "Genotype selected. Please select the phenotype file."
      );
    } else {
      setStatus(inputStatus, "Select both input files.");
    }
  }

  async function loadRCode() {
    try {
      setStatus(runStatus, "Loading R code...");

      const response = await fetch(`${API}/editor-code`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const code = await response.text();
      codeEditor.value = code;

      setStatus(
        runStatus,
        "Exact R code loaded successfully.",
        "success"
      );

    } catch (error) {
      setStatus(
        runStatus,
        `Could not load R code: ${error.message}`,
        "error"
      );
    }
  }

  function resetRunDisplay() {
    runId.textContent = "—";
    runTime.textContent = "—";
    exitCode.textContent = "—";

    runState.textContent = "Starting";
    progressBar.style.width = "5%";
    progressText.textContent = "Sending the job to Ubuntu R...";

    resultsList.innerHTML = "";
    resultsSection.style.display = "none";

    rOutput.textContent = "";
    outputSection.style.display = "none";

    rError.textContent = "";
    errorSection.style.display = "none";
  }

  function showResults(data) {
    if (!data.files || !data.files.length) {
      resultsList.innerHTML = "<p>No result files were returned by R.</p>";
      resultsSection.style.display = "block";
      return;
    }

    resultsList.innerHTML = "";

    data.files.forEach(file => {
      const link = document.createElement("a");

      link.className = "result-file";
      link.href = `${API}${file.url}`;
      link.target = "_blank";
      link.rel = "noopener";

      link.textContent =
        `${file.name} (${Math.round(file.size / 1024)} KB)`;

      resultsList.appendChild(link);
    });

    resultsSection.style.display = "block";
  }

  async function runRCode() {
    const phenotype = phenotypeInput.files[0];
    const genotype = genotypeInput.files[0];
    const code = codeEditor.value.trim();

    if (!phenotype || !genotype) {
      setStatus(
        runStatus,
        "Please select both phenotype and genotype files.",
        "error"
      );
      return;
    }

    if (!code) {
      setStatus(
        runStatus,
        "R code is empty. Load the R code first.",
        "error"
      );
      return;
    }

    resetRunDisplay();

    runButton.disabled = true;
    loadCodeButton.disabled = true;

    setStatus(
      runStatus,
      "R/rMVP is running. Please wait...",
      "running"
    );

    let progress = 5;

    const progressTimer = setInterval(() => {
      if (progress < 90) {
        progress += 2;
        progressBar.style.width = `${progress}%`;
      }
    }, 700);

    const formData = new FormData();

    formData.append("phenotype", phenotype);
    formData.append("genotype", genotype);
    formData.append("code", new Blob([code], {
      type: "text/plain"
    }), "GWAS_R_EDITOR.R");

    const startTime = performance.now();

    try {
      const response = await fetch(`${API}/run-r`, {
        method: "POST",
        body: formData
      });

      const data = await response.json();

      if (!response.ok || data.status !== "ok") {
        throw new Error(
          data.error || `HTTP ${response.status}`
        );
      }

      clearInterval(progressTimer);

      progressBar.style.width = "100%";
      progressText.textContent =
        "R/rMVP completed successfully.";

      runState.textContent = "Completed";
      runId.textContent = data.run_id || "—";
      runTime.textContent =
        data.runtime_seconds != null
          ? `${data.runtime_seconds} seconds`
          : `${((performance.now() - startTime) / 1000).toFixed(1)} seconds`;

      exitCode.textContent =
        data.exit_code != null
          ? data.exit_code
          : "0";

      setStatus(
        runStatus,
        `R/rMVP completed successfully in ${data.runtime_seconds} seconds.`,
        "success"
      );

      showResults(data);

      if (data.stdout) {
        rOutput.textContent = data.stdout;
        outputSection.style.display = "block";
      }

      if (data.stderr) {
        rError.textContent = data.stderr;
        errorSection.style.display = "block";
      }

    } catch (error) {
      clearInterval(progressTimer);

      progressBar.style.width = "100%";
      progressText.textContent = "R execution failed.";

      runState.textContent = "Error";

      setStatus(
        runStatus,
        `R execution failed: ${error.message}`,
        "error"
      );

    } finally {
      runButton.disabled = false;
      loadCodeButton.disabled = false;
    }
  }

  phenotypeInput.addEventListener("change", updateInputStatus);
  genotypeInput.addEventListener("change", updateInputStatus);

  loadCodeButton.addEventListener("click", loadRCode);
  runButton.addEventListener("click", runRCode);

  loadRCode();

})();

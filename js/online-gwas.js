(() => {
  "use strict";

  /*
   * ONLINE GWAS
   *
   * This page is intentionally separate from the existing GWAS page.
   * The cloud R/rMVP backend will be connected here later.
   */

  const phenotypeInput =
    document.getElementById("onlinePhenotype");

  const genotypeInput =
    document.getElementById("onlineGenotype");

  const runButton =
    document.getElementById("runOnlineGWAS");

  const status =
    document.getElementById("onlineStatus");

  const resultsSection =
    document.getElementById("onlineResults");

  const resultsList =
    document.getElementById("onlineResultsList");


  function setStatus(message, type = "") {
    status.textContent = message;
    status.className = "status";

    if (type) {
      status.classList.add(type);
    }
  }


  function validateFiles() {

    const phenotype =
      phenotypeInput.files[0];

    const genotype =
      genotypeInput.files[0];


    if (!phenotype || !genotype) {

      setStatus(
        "Please select both phenotype and genotype files.",
        "error"
      );

      return false;
    }


    return true;
  }


  async function runOnlineGWAS() {

    if (!validateFiles()) {
      return;
    }


    const phenotype =
      phenotypeInput.files[0];

    const genotype =
      genotypeInput.files[0];


    runButton.disabled = true;

    resultsSection.style.display = "none";
    resultsList.innerHTML = "";


    setStatus(
      "Submitting your files to the Online GWAS server...",
      "running"
    );


    /*
     * Cloud API will be connected here.
     *
     * The browser will send only:
     *   1. phenotype file
     *   2. genotype file
     *
     * R/rMVP will perform the actual GWAS on the server.
     */

    const formData = new FormData();

    formData.append(
      "phenotype",
      phenotype
    );

    formData.append(
      "genotype",
      genotype
    );


    /*
     * Backend endpoint intentionally left disabled
     * until the cloud R/rMVP backend is deployed.
     */

    setStatus(
      "Files are ready. The cloud R/rMVP backend has not been connected yet.",
      "success"
    );


    runButton.disabled = false;
  }


  runButton.addEventListener(
    "click",
    runOnlineGWAS
  );

})();

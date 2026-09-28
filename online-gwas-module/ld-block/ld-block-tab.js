(() => {
  "use strict";

  const API = window.LD_BLOCK_API || "http://127.0.0.1:8767";
  const $ = (id) => document.getElementById(id);
  const status = $("ldblockStatus");
  const message = $("ldblockMessage");
  const runBtn = $("ldRunBtn");
  const checkBtn = $("ldCheckBtn");

  function setMessage(text, kind = "") {
    message.hidden = !text;
    message.className = "ldblock-message" + (kind ? ` ${kind}` : "");
    message.textContent = text || "";
  }

  async function checkSoftware() {
    status.className = "status-pill status-unknown";
    status.textContent = "Checking software…";
    try {
      const r = await fetch(`${API}/api/ldblock/check`);
      const d = await r.json();
      if (d.ready) {
        status.className = "status-pill status-ok";
        status.textContent = "LDBlockShow ready";
      } else {
        status.className = "status-pill status-bad";
        status.textContent = "LDBlockShow not installed";
      }
      return d;
    } catch (e) {
      status.className = "status-pill status-bad";
      status.textContent = "Backend offline";
      return null;
    }
  }

  function addDownload(container, url, label) {
    const a = document.createElement("a");
    a.href = url;
    a.download = "";
    a.textContent = label;
    a.target = "_blank";
    container.appendChild(a);
  }

  async function run() {
    const vcf = $("ldVcf").files[0];

    const chromosome = $("ldChromosome").value.trim();
    const start = $("ldStart").value.trim();
    const end = $("ldEnd").value.trim();

    if (!vcf) {
      return setMessage("Please select a VCF or VCF.GZ file.", "error");
    }

    if (!chromosome || !start || !end) {
      return setMessage(
        "Please enter the chromosome, start position, and end position.",
        "error"
      );
    }

    const chrNumber = Number(chromosome);
    const startNumber = Number(start);
    const endNumber = Number(end);

    if (!Number.isInteger(chrNumber) || chrNumber < 1 || chrNumber > 20) {
      return setMessage("Chromosome must be a number from 1 to 20.", "error");
    }

    if (!Number.isInteger(startNumber) || startNumber < 1) {
      return setMessage("Start position must be a positive integer.", "error");
    }

    if (!Number.isInteger(endNumber) || endNumber <= startNumber) {
      return setMessage("End position must be greater than the start position.", "error");
    }

    const fd = new FormData();
    fd.append("vcf", vcf);
    fd.append("chromosome", String(chrNumber));
    fd.append("start", String(startNumber));
    fd.append("end", String(endNumber));
    fd.append("selevar", $("ldSeleVar").value);
    fd.append("maf", $("ldMaf").value);
    fd.append("miss", $("ldMiss").value);
    fd.append("show_num", $("ldShowNum").checked ? "1" : "0");
    if ($("ldCutline").value) fd.append("gwas_cutline", $("ldCutline").value);
    if ($("ldGwas").files[0]) fd.append("gwas", $("ldGwas").files[0]);
    if ($("ldGff").files[0]) fd.append("gff", $("ldGff").files[0]);

    runBtn.disabled = true;
    setMessage("Running LDBlockShow… this can take time for large regions.");
    $("ldblockResults").hidden = true;

    try {
      const r = await fetch(`${API}/api/ldblock/run`, { method:"POST", body:fd });
      const d = await r.json();
      if (!r.ok || !d.ok) {
        setMessage(d.error || "LD Block analysis failed.", "error");
        return;
      }

      const results = $("ldblockResults");
      const png = $("ldblockPng");
      const svg = $("ldblockSvg");
      const downloads = $("ldblockDownloads");

      downloads.innerHTML = "";

      png.hidden = true;
      svg.hidden = true;

      if (d.files && d.files.png) {
        png.src = `${API}${d.files.png}`;
        png.hidden = false;
        addDownload(
          downloads,
          `${API}${d.files.png}`,
          "Download PNG"
        );
      }

      if (d.files && d.files.svg) {
        svg.src = `${API}${d.files.svg}`;
        svg.hidden = false;
        addDownload(
          downloads,
          `${API}${d.files.svg}`,
          "Open SVG"
        );
      }

      results.hidden = false;

      setMessage(
        `LD Block analysis completed for chromosome ${d.chromosome} (${d.vcf_chromosome}), region ${d.start}-${d.end}.`,
        "success"
      );
    } catch (e) {
      setMessage(`Backend error: ${e.message}`, "error");
    } finally {
      runBtn.disabled = false;
    }
  }

  checkBtn.addEventListener("click", checkSoftware);
  runBtn.addEventListener("click", run);
  checkSoftware();
})();

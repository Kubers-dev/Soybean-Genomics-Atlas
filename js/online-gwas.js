(() => {

  const API_BASE =
    window.ONLINE_GWAS_API ||
    "http://localhost:8000";

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

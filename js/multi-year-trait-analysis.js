(function () {
  "use strict";

  const state = {
    rows: [],
    accessionKey: null,
    yearKey: null,
    replicateKey: null,
    traits: [],
    trait: null
  };

  const $ = id => document.getElementById(id);

  function clean(v) {
    return String(v ?? "").trim();
  }

  function num(v) {
    if (v === null || v === undefined || clean(v) === "") return NaN;
    const n = Number(String(v).replace(/,/g, ""));
    return Number.isFinite(n) ? n : NaN;
  }

  function mean(a) {
    const x = a.filter(Number.isFinite);
    return x.length ? x.reduce((s, v) => s + v, 0) / x.length : NaN;
  }

  function sd(a) {
    const x = a.filter(Number.isFinite);
    if (x.length < 2) return 0;
    const m = mean(x);
    return Math.sqrt(
      x.reduce((s, v) => s + (v - m) ** 2, 0) / (x.length - 1)
    );
  }

  function unique(a) {
    return [...new Set(
      a.map(clean).filter(v => v !== "")
    )];
  }

  function esc(v) {
    return String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function showMessage(message, type = "") {
    const el = $("tmUploadMessage");
    if (!el) return;
    el.textContent = message;
    el.className = "status-message " + type;
  }

  function detectColumns(rows) {
    const keys = Object.keys(rows[0] || {});

    const find = patterns =>
      keys.find(k => patterns.some(p => p.test(k))) || null;

    state.accessionKey = find([
      /^accession$/i,
      /accession/i,
      /^genotype$/i,
      /^geno$/i,
      /^taxa$/i,
      /^line$/i,
      /^entry$/i
    ]);

    state.yearKey = find([
      /^year$/i,
      /year/i,
      /environment/i,
      /^env$/i,
      /season/i,
      /location/i,
      /site/i,
      /trial/i
    ]);

    state.replicateKey = find([
      /^replicate$/i,
      /^rep$/i,
      /replicate/i,
      /block/i
    ]);

    if (!state.accessionKey) {
      throw new Error("Accession column was not detected.");
    }

    if (!state.yearKey) {
      throw new Error(
        "Year/Environment column was not detected."
      );
    }

    state.traits = keys.filter(k => {
      if (
        k === state.accessionKey ||
        k === state.yearKey ||
        k === state.replicateKey
      ) return false;

      const values = rows.map(r => num(r[k]));
      const valid = values.filter(Number.isFinite).length;

      return valid >= Math.max(3, rows.length * 0.5);
    });

    if (!state.traits.length) {
      throw new Error("No numeric phenotype traits were detected.");
    }
  }

  function readFile(file) {
    if (!window.XLSX) {
      throw new Error("SheetJS/XLSX library is not available.");
    }

    const reader = new FileReader();

    reader.onload = function (event) {
      try {
        const workbook = XLSX.read(
          new Uint8Array(event.target.result),
          { type: "array" }
        );

        const sheet = workbook.Sheets[workbook.SheetNames[0]];

        const rows = XLSX.utils.sheet_to_json(sheet, {
          defval: ""
        });

        if (!rows.length) {
          throw new Error("The selected file contains no data.");
        }

        state.rows = rows;
        detectColumns(rows);
        state.trait = state.traits[0];

        buildSummary();
        buildSelectors();

        const section = $("traitMultiYearSection");

        if (!section) {
          throw new Error(
            "The multi-year analysis section was not found in the page."
          );
        }

        section.hidden = false;

        renderAll();

        showMessage(
          "Multi-year phenotype data loaded successfully.",
          "success"
        );

        section.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });

      } catch (err) {
        console.error(err);
        showMessage(
          "Error reading multi-year file: " + err.message,
          "error"
        );
      }
    };

    reader.onerror = function () {
      showMessage("Unable to read the selected file.", "error");
    };

    reader.readAsArrayBuffer(file);
  }

  function buildSummary() {
    const summary = $("tmSummary");
    if (!summary) return;

    const accessions = unique(
      state.rows.map(r => r[state.accessionKey])
    );

    const years = unique(
      state.rows.map(r => r[state.yearKey])
    );

    summary.innerHTML = `
      <div class="metric">
        <div class="metric-value">${accessions.length}</div>
        <div class="metric-label">Accessions</div>
      </div>
      <div class="metric">
        <div class="metric-value">${years.length}</div>
        <div class="metric-label">Years / Environments</div>
      </div>
      <div class="metric">
        <div class="metric-value">${state.traits.length}</div>
        <div class="metric-label">Traits</div>
      </div>
      <div class="metric">
        <div class="metric-value">${state.rows.length.toLocaleString()}</div>
        <div class="metric-label">Observations</div>
      </div>
    `;
  }

  function buildSelectors() {
    const traitSelect = $("tmTraitSelect");
    const yearSelect = $("tmYearSelect");

    if (traitSelect) {
      traitSelect.innerHTML = state.traits
        .map(t =>
          `<option value="${esc(t)}">${esc(t)}</option>`
        )
        .join("");

      traitSelect.value = state.trait;

      traitSelect.onchange = function () {
        state.trait = this.value;
        renderAll();
      };
    }

    if (yearSelect) {
      const years = unique(
        state.rows.map(r => r[state.yearKey])
      );

      yearSelect.innerHTML =
        `<option value="ALL">All years</option>` +
        years.map(y =>
          `<option value="${esc(y)}">${esc(y)}</option>`
        ).join("");

      yearSelect.onchange = renderAll;
    }
  }

  function selectedRows() {
    const selectedYear =
      $("tmYearSelect")?.value || "ALL";

    return state.rows
      .filter(r => {
        if (selectedYear === "ALL") return true;
        return clean(r[state.yearKey]) === selectedYear;
      })
      .map(r => ({
        accession: clean(r[state.accessionKey]),
        year: clean(r[state.yearKey]),
        replicate: state.replicateKey
          ? clean(r[state.replicateKey])
          : "",
        value: num(r[state.trait])
      }))
      .filter(r =>
        r.accession &&
        r.year &&
        Number.isFinite(r.value)
      );
  }

  function accessionYearMeans(rows) {
    const map = new Map();

    rows.forEach(r => {
      const key = r.accession + "|||" + r.year;

      if (!map.has(key)) {
        map.set(key, {
          accession: r.accession,
          year: r.year,
          values: []
        });
      }

      map.get(key).values.push(r.value);
    });

    return [...map.values()].map(d => ({
      accession: d.accession,
      year: d.year,
      value: mean(d.values)
    }));
  }

  function plot(id, data, layout) {
    const el = $(id);

    if (!el) {
      throw new Error("Plot container not found: " + id);
    }

    if (!window.Plotly) {
      throw new Error("Plotly library is not available.");
    }

    Plotly.newPlot(
      el,
      data,
      Object.assign({
        autosize: true,
        paper_bgcolor: "white",
        plot_bgcolor: "white",
        margin: { t: 60, r: 30, b: 70, l: 80 }
      }, layout),
      {
        responsive: true,
        displaylogo: false
      }
    );
  }

  function renderAll() {
    if (!state.rows.length || !state.trait) return;

    const rows = selectedRows();

    if (!rows.length) {
      throw new Error("No numeric observations are available for the selected trait.");
    }

    renderInfo(rows);
    renderMean(rows);
    renderDistribution(rows);
    renderInteraction(rows);
    renderCorrelation();
    renderVariance(rows);
    renderBLUP(rows);
    renderTraitSummary();
  }

  function renderInfo(rows) {
    const el = $("tmTraitInfo");
    if (!el) return;

    el.innerHTML = `
      <strong>Selected trait:</strong> ${esc(state.trait)}
      &nbsp; | &nbsp;
      <strong>Accessions:</strong> ${unique(rows.map(r => r.accession)).length}
      &nbsp; | &nbsp;
      <strong>Years / environments:</strong> ${unique(rows.map(r => r.year)).length}
      &nbsp; | &nbsp;
      <strong>Observations:</strong> ${rows.length}
    `;
  }

  function renderMean(rows) {
    const years = unique(rows.map(r => r.year));

    const x = [];
    const y = [];
    const error = [];

    years.forEach(year => {
      const values = rows
        .filter(r => r.year === year)
        .map(r => r.value);

      x.push(year);
      y.push(mean(values));
      error.push(sd(values));
    });

    plot(
      "tmMeanPlot",
      [{
        type: "scatter",
        mode: "lines+markers",
        x,
        y,
        error_y: {
          type: "data",
          array: error,
          visible: true
        },
        hovertemplate:
          "<b>%{x}</b><br>" +
          "Mean: %{y:.3f}<extra></extra>"
      }],
      {
        title: "Trait mean across years",
        xaxis: { title: "Year / Environment" },
        yaxis: { title: state.trait }
      }
    );
  }

  function renderDistribution(rows) {
    const years = unique(rows.map(r => r.year));

    const traces = years.map(year => ({
      type: "box",
      name: year,
      y: rows
        .filter(r => r.year === year)
        .map(r => r.value),
      boxpoints: "outliers",
      hovertemplate:
        "Year: " + esc(year) +
        "<br>Value: %{y:.3f}<extra></extra>"
    }));

    plot(
      "tmDistributionPlot",
      traces,
      {
        title: "Trait distribution across years",
        xaxis: { title: "Year / Environment" },
        yaxis: { title: state.trait },
        showlegend: false
      }
    );
  }

  function renderInteraction(rows) {
    const means = accessionYearMeans(rows);

    const accessionMap = new Map();

    means.forEach(d => {
      if (!accessionMap.has(d.accession)) {
        accessionMap.set(d.accession, []);
      }
      accessionMap.get(d.accession).push(d.value);
    });

    const ranked = [...accessionMap.entries()]
      .map(([accession, values]) => ({
        accession,
        overall: mean(values)
      }))
      .sort((a, b) => b.overall - a.overall);

    const rank = new Map(
      ranked.map((d, i) => [d.accession, i + 1])
    );

    const years = unique(means.map(d => d.year));

    const traces = years.map(year => {
      const subset = means
        .filter(d => d.year === year)
        .sort((a, b) => rank.get(a.accession) - rank.get(b.accession));

      return {
        type: "scatter",
        mode: "lines",
        name: year,
        x: subset.map(d => rank.get(d.accession)),
        y: subset.map(d => d.value),
        customdata: subset.map(d => d.accession),
        hovertemplate:
          "Accession: %{customdata}<br>" +
          "Rank: %{x}<br>" +
          "Value: %{y:.3f}<extra>" + esc(year) + "</extra>"
      };
    });

    plot(
      "tmInteractionPlot",
      traces,
      {
        title: "Genotype × year response",
        xaxis: {
          title: "Accession rank by overall trait performance"
        },
        yaxis: {
          title: state.trait
        },
        hovermode: "closest"
      }
    );
  }

  function pearson(a, b) {
    const pairs = [];

    for (let i = 0; i < a.length; i++) {
      if (Number.isFinite(a[i]) && Number.isFinite(b[i])) {
        pairs.push([a[i], b[i]]);
      }
    }

    if (pairs.length < 3) return NaN;

    const ax = pairs.map(p => p[0]);
    const bx = pairs.map(p => p[1]);

    const ma = mean(ax);
    const mb = mean(bx);

    let numerator = 0;
    let da = 0;
    let db = 0;

    for (let i = 0; i < pairs.length; i++) {
      const xa = ax[i] - ma;
      const xb = bx[i] - mb;
      numerator += xa * xb;
      da += xa * xa;
      db += xb * xb;
    }

    if (!da || !db) return NaN;

    return numerator / Math.sqrt(da * db);
  }

  function renderCorrelation() {
    const means = accessionYearMeans(
      state.rows
        .map(r => ({
          accession: clean(r[state.accessionKey]),
          year: clean(r[state.yearKey]),
          value: num(r[state.trait])
        }))
        .filter(r =>
          r.accession &&
          r.year &&
          Number.isFinite(r.value)
        )
    );

    const accessions = unique(means.map(d => d.accession));
    const years = unique(means.map(d => d.year));

    const matrix = years.map(y1 =>
      years.map(y2 => {
        const a = [];
        const b = [];

        accessions.forEach(acc => {
          const v1 = means.find(
            d => d.accession === acc && d.year === y1
          );
          const v2 = means.find(
            d => d.accession === acc && d.year === y2
          );

          a.push(v1 ? v1.value : NaN);
          b.push(v2 ? v2.value : NaN);
        });

        return pearson(a, b);
      })
    );

    plot(
      "tmCorrelationPlot",
      [{
        type: "heatmap",
        z: matrix,
        x: years,
        y: years,
        zmin: -1,
        zmax: 1,
        colorscale: "RdBu",
        reversescale: true,
        text: matrix.map(row =>
          row.map(v =>
            Number.isFinite(v) ? v.toFixed(2) : ""
          )
        ),
        texttemplate: "%{text}",
        hovertemplate:
          "Year 1: %{y}<br>" +
          "Year 2: %{x}<br>" +
          "r = %{z:.3f}<extra></extra>"
      }],
      {
        title: "Year-to-year correlation",
        xaxis: { title: "Year / Environment" },
        yaxis: { title: "Year / Environment" }
      }
    );
  }

  function renderVariance(rows) {
    const all = rows.map(r => r.value);
    const grand = mean(all);

    const genotypeMeans = {};
    const yearMeans = {};

    rows.forEach(r => {
      genotypeMeans[r.accession] ??= [];
      genotypeMeans[r.accession].push(r.value);

      yearMeans[r.year] ??= [];
      yearMeans[r.year].push(r.value);
    });

    const genotypeValues = Object.values(genotypeMeans)
      .map(mean);

    const yearValues = Object.values(yearMeans)
      .map(mean);

    const genotypeVariance = Math.max(
      0,
      sd(genotypeValues) ** 2
    );

    const yearVariance = Math.max(
      0,
      sd(yearValues) ** 2
    );

    const totalVariance = Math.max(
      0,
      sd(all) ** 2
    );

    const residualVariance = Math.max(
      0,
      totalVariance - genotypeVariance - yearVariance
    );

    plot(
      "tmVariancePlot",
      [{
        type: "bar",
        x: [
          "Genotype",
          "Year / Environment",
          "Residual"
        ],
        y: [
          genotypeVariance,
          yearVariance,
          residualVariance
        ],
        hovertemplate:
          "%{x}<br>Variance: %{y:.5f}<extra></extra>"
      }],
      {
        title: "Variance components",
        xaxis: { title: "Variance component" },
        yaxis: { title: "Estimated variance" }
      }
    );
  }

  function renderBLUP(rows) {
    const means = {};

    rows.forEach(r => {
      means[r.accession] ??= [];
      means[r.accession].push(r.value);
    });

    const raw = Object.entries(means)
      .map(([accession, values]) => ({
        accession,
        value: mean(values)
      }))
      .sort((a, b) => a.value - b.value);

    const overall = mean(raw.map(d => d.value));

    const variance = sd(
      rows.map(r => r.value)
    ) ** 2;

    const n = rows.length || 1;

    const shrinkage = variance /
      (variance + variance / Math.max(1, n));

    const blup = raw.map(d => ({
      accession: d.accession,
      value: overall +
        shrinkage * (d.value - overall)
    }));

    plot(
      "tmBlupPlot",
      [{
        type: "histogram",
        x: blup.map(d => d.value),
        nbinsx: 30,
        hovertemplate:
          "BLUP-style value: %{x:.3f}<br>" +
          "Count: %{y}<extra></extra>"
      }],
      {
        title: "Genotype BLUP distribution",
        xaxis: { title: "BLUP-style genotype effect" },
        yaxis: { title: "Number of accessions" }
      }
    );
  }

  function heritabilityForTrait(trait) {
    const values = state.rows
      .map(r => num(r[trait]))
      .filter(Number.isFinite);

    if (values.length < 2) return NaN;

    const accessionGroups = {};

    state.rows.forEach(r => {
      const acc = clean(r[state.accessionKey]);
      const v = num(r[trait]);

      if (acc && Number.isFinite(v)) {
        accessionGroups[acc] ??= [];
        accessionGroups[acc].push(v);
      }
    });

    const genotypeMeans = Object.values(accessionGroups)
      .map(mean);

    const vg = sd(genotypeMeans) ** 2;
    const vp = sd(values) ** 2;

    if (!Number.isFinite(vp) || vp <= 0) return NaN;

    return Math.max(0, Math.min(1, vg / vp));
  }

  function renderTraitSummary() {
    const means = [];
    const h2 = [];

    state.traits.forEach(trait => {
      const values = state.rows
        .map(r => num(r[trait]))
        .filter(Number.isFinite);

      means.push(mean(values));
      h2.push(heritabilityForTrait(trait));
    });

    plot(
      "tmTraitSummaryPlot",
      [
        {
          type: "bar",
          name: "Overall mean",
          x: state.traits,
          y: means,
          customdata: h2,
          hovertemplate:
            "<b>%{x}</b><br>" +
            "Mean: %{y:.3f}<br>" +
            "H²: %{customdata:.3f}<extra></extra>"
        }
      ],
      {
        title: "Trait-level overview across all multi-year traits",
        xaxis: {
          title: "Trait",
          tickangle: -35
        },
        yaxis: {
          title: "Overall trait mean"
        },
        margin: {
          t: 60,
          r: 30,
          b: 140,
          l: 80
        }
      }
    );
  }


  function downloadExcel() {
    if (!state.rows.length) {
      showMessage(
        "Please upload the multi-year phenotype dataset first.",
        "error"
      );
      return;
    }

    if (!window.XLSX) {
      showMessage(
        "Excel export library is not available.",
        "error"
      );
      return;
    }

    const wb = XLSX.utils.book_new();

    // ==========================================================
    // 1. RAW DATA
    // ==========================================================
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(state.rows),
      "Raw Data"
    );

    // ==========================================================
    // 2. TRAIT SUMMARY
    // ==========================================================
    const traitSummary = [[
      "Trait",
      "N",
      "Accessions",
      "Years / Environments",
      "Mean",
      "SD",
      "Broad-sense H2"
    ]];

    state.traits.forEach(trait => {
      const values = state.rows
        .map(r => num(r[trait]))
        .filter(Number.isFinite);

      const accessions = unique(
        state.rows.map(r => r[state.accessionKey])
      );

      const years = unique(
        state.rows.map(r => r[state.yearKey])
      );

      traitSummary.push([
        trait,
        values.length,
        accessions.length,
        years.length,
        mean(values),
        sd(values),
        heritabilityForTrait(trait)
      ]);
    });

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet(traitSummary),
      "Trait Summary"
    );

    // ==========================================================
    // 3. YEAR MEANS
    // ==========================================================
    const yearMeans = [[
      "Trait",
      "Year / Environment",
      "N",
      "Mean",
      "SD"
    ]];

    state.traits.forEach(trait => {
      const years = unique(
        state.rows.map(r => r[state.yearKey])
      );

      years.forEach(year => {
        const values = state.rows
          .filter(r => clean(r[state.yearKey]) === year)
          .map(r => num(r[trait]))
          .filter(Number.isFinite);

        yearMeans.push([
          trait,
          year,
          values.length,
          mean(values),
          sd(values)
        ]);
      });
    });

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet(yearMeans),
      "Year Means"
    );

    // ==========================================================
    // 4. GENOTYPE × YEAR MEANS
    // ==========================================================
    const gxYear = [[
      "Trait",
      "Accession",
      "Year / Environment",
      "Mean"
    ]];

    state.traits.forEach(trait => {
      const groups = new Map();

      state.rows.forEach(r => {
        const accession = clean(r[state.accessionKey]);
        const year = clean(r[state.yearKey]);
        const value = num(r[trait]);

        if (!accession || !year || !Number.isFinite(value)) return;

        const key = accession + "|||" + year;

        if (!groups.has(key)) {
          groups.set(key, {
            accession,
            year,
            values: []
          });
        }

        groups.get(key).values.push(value);
      });

      groups.forEach(d => {
        gxYear.push([
          trait,
          d.accession,
          d.year,
          mean(d.values)
        ]);
      });
    });

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet(gxYear),
      "Genotype Year Means"
    );

    // ==========================================================
    // 5. VARIANCE COMPONENTS
    // ==========================================================
    const varianceSheet = [[
      "Trait",
      "Genotype Variance",
      "Year / Environment Variance",
      "Residual Variance",
      "Broad-sense H2"
    ]];

    state.traits.forEach(trait => {

      const rows = state.rows
        .map(r => ({
          accession: clean(r[state.accessionKey]),
          year: clean(r[state.yearKey]),
          value: num(r[trait])
        }))
        .filter(r =>
          r.accession &&
          r.year &&
          Number.isFinite(r.value)
        );

      const all = rows.map(r => r.value);

      const genotype = {};
      const years = {};

      rows.forEach(r => {

        genotype[r.accession] ??= [];
        genotype[r.accession].push(r.value);

        years[r.year] ??= [];
        years[r.year].push(r.value);

      });

      const vg = Math.max(
        0,
        sd(Object.values(genotype).map(mean)) ** 2
      );

      const vy = Math.max(
        0,
        sd(Object.values(years).map(mean)) ** 2
      );

      const vp = Math.max(
        0,
        sd(all) ** 2
      );

      const vr = Math.max(
        0,
        vp - vg - vy
      );

      varianceSheet.push([
        trait,
        vg,
        vy,
        vr,
        heritabilityForTrait(trait)
      ]);
    });

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet(varianceSheet),
      "Variance Components"
    );

    // ==========================================================
    // 6. BLUP-STYLE VALUES
    // ==========================================================
    const blupSheet = [[
      "Trait",
      "Accession",
      "Raw Genotype Mean",
      "BLUP-style Value"
    ]];

    state.traits.forEach(trait => {

      const groups = {};

      state.rows.forEach(r => {

        const accession = clean(r[state.accessionKey]);
        const value = num(r[trait]);

        if (!accession || !Number.isFinite(value)) return;

        groups[accession] ??= [];
        groups[accession].push(value);

      });

      const raw = Object.entries(groups).map(
        ([accession, values]) => ({
          accession,
          value: mean(values)
        })
      );

      const overall = mean(
        raw.map(d => d.value)
      );

      const variance =
        sd(
          state.rows
            .map(r => num(r[trait]))
            .filter(Number.isFinite)
        ) ** 2;

      const n = state.rows.length || 1;

      const shrinkage =
        variance /
        (variance + variance / Math.max(1, n));

      raw.forEach(d => {

        const blup =
          overall +
          shrinkage * (d.value - overall);

        blupSheet.push([
          trait,
          d.accession,
          d.value,
          blup
        ]);

      });
    });

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet(blupSheet),
      "BLUP Values"
    );

    // ==========================================================
    // 7. YEAR-TO-YEAR CORRELATIONS
    // ==========================================================
    const correlationSheet = [[
      "Trait",
      "Year 1",
      "Year 2",
      "Pearson r"
    ]];

    function correlation(a, b) {

      const pairs = [];

      for (let i = 0; i < a.length; i++) {
        if (
          Number.isFinite(a[i]) &&
          Number.isFinite(b[i])
        ) {
          pairs.push([a[i], b[i]]);
        }
      }

      if (pairs.length < 3) return NaN;

      const x = pairs.map(p => p[0]);
      const y = pairs.map(p => p[1]);

      const mx = mean(x);
      const my = mean(y);

      let numerator = 0;
      let dx = 0;
      let dy = 0;

      for (let i = 0; i < pairs.length; i++) {

        const ax = x[i] - mx;
        const by = y[i] - my;

        numerator += ax * by;
        dx += ax * ax;
        dy += by * by;

      }

      if (!dx || !dy) return NaN;

      return numerator / Math.sqrt(dx * dy);
    }

    state.traits.forEach(trait => {

      const years = unique(
        state.rows.map(r => r[state.yearKey])
      );

      const groups = {};

      state.rows.forEach(r => {

        const accession = clean(r[state.accessionKey]);
        const year = clean(r[state.yearKey]);
        const value = num(r[trait]);

        if (
          !accession ||
          !year ||
          !Number.isFinite(value)
        ) return;

        groups[accession] ??= {};
        groups[accession][year] ??= [];

        groups[accession][year].push(value);

      });

      for (let i = 0; i < years.length; i++) {

        for (let j = i + 1; j < years.length; j++) {

          const a = [];
          const b = [];

          Object.values(groups).forEach(g => {

            a.push(
              g[years[i]]
                ? mean(g[years[i]])
                : NaN
            );

            b.push(
              g[years[j]]
                ? mean(g[years[j]])
                : NaN
            );

          });

          correlationSheet.push([
            trait,
            years[i],
            years[j],
            correlation(a, b)
          ]);
        }
      }
    });

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet(correlationSheet),
      "Year Correlations"
    );

    // ==========================================================
    // COLUMN WIDTHS
    // ==========================================================
    wb.SheetNames.forEach(name => {

      const ws = wb.Sheets[name];

      if (!ws["!ref"]) return;

      const range =
        XLSX.utils.decode_range(ws["!ref"]);

      const widths = [];

      for (
        let c = range.s.c;
        c <= range.e.c;
        c++
      ) {

        let max = 12;

        for (
          let r = range.s.r;
          r <= range.e.r;
          r++
        ) {

          const cell =
            ws[
              XLSX.utils.encode_cell({
                r,
                c
              })
            ];

          if (
            cell &&
            cell.v !== undefined
          ) {
            max = Math.max(
              max,
              String(cell.v).length + 2
            );
          }
        }

        widths.push({
          wch: Math.min(max, 35)
        });
      }

      ws["!cols"] = widths;
    });

    XLSX.writeFile(
      wb,
      "soybean_multi_year_analysis.xlsx"
    );

    showMessage(
      "Excel workbook downloaded successfully.",
      "success"
    );
  }

  const excelButton = $("tmDownloadExcel");

  if (excelButton) {
    excelButton.addEventListener(
      "click",
      downloadExcel
    );
  }

  const fileInput = $("traitMultiYearFile");

  if (fileInput) {
    fileInput.addEventListener("change", function () {
      if (this.files && this.files[0]) {
        readFile(this.files[0]);
      }
    });
  }

})();

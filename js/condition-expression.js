(() => {
"use strict";

const DATA_URL =
  "data/condition-expression/scn_root/scn_root_condition_expression.json";

const META_URL =
  "data/condition-expression/scn_root/scn_root_gene_metadata.json";

const state = {
  records: [],
  metadata: new Map(),
  selected: [],
  mode: "tpm"
};

const labels = {
  tpm: "TPM",
  log2tpm: "log₂(TPM + 1)",
  zscore: "Gene-wise Z-score"
};

const $ = id => document.getElementById(id);

function esc(value) {
  return String(value ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");
}

function normGene(value) {
  const s = String(value ?? "").trim();

  const m = s.match(
    /(Glyma\.\d{2}G\d{6})$/i
  );

  return (
    m ? m[1] : s
  ).toLowerCase();
}

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function fmt(value,digits=3) {
  const n = number(value);

  if (n === null) return "NA";

  return n.toFixed(digits);
}

function fmtP(value) {
  const n = number(value);

  if (n === null) return "NA";

  if (n === 0) return "0";

  if (n < 0.001) {
    return n.toExponential(2);
  }

  return n.toFixed(4);
}

function getMeta(record) {
  return (
    state.metadata.get(
      normGene(record.gene)
    ) || null
  );
}

function getValues(record) {
  const v = record[state.mode];

  if (Array.isArray(v)) {
    return v;
  }

  return [null,null];
}

function significance(record) {

  const p = number(record.padj);
  const fc = number(record.log2FoldChange);

  if (p !== null && p < 0.001) {
    return {
      text: fc >= 0 ? "↑ ***" : "↓ ***",
      cls: fc >= 0 ? "up" : "down"
    };
  }

  if (p !== null && p < 0.01) {
    return {
      text: fc >= 0 ? "↑ **" : "↓ **",
      cls: fc >= 0 ? "up" : "down"
    };
  }

  if (p !== null && p < 0.05) {
    return {
      text: fc >= 0 ? "↑ *" : "↓ *",
      cls: fc >= 0 ? "up" : "down"
    };
  }

  return {
    text: "NS",
    cls: "ns"
  };
}

function heatColor(value,min,max) {

  const n = number(value);

  if (n === null) {
    return "#eeeeee";
  }

  const range = max - min || 1;

  const t = Math.max(
    0,
    Math.min(
      1,
      (n-min)/range
    )
  );

  const r = Math.round(255 - 75*t);
  const g = Math.round(244 - 145*t);
  const b = Math.round(220 - 155*t);

  return `rgb(${r},${g},${b})`;
}

function findGene(query) {

  const q = normGene(query);

  return (
    state.records.find(
      r => normGene(r.gene) === q
    ) ||

    state.records.find(
      r => normGene(r.gene).includes(q)
    ) ||

    null
  );
}

function parseGenes() {

  return (
    $("geneInput").value || ""
  )
    .split(/[\s,;]+/)
    .map(x => x.trim())
    .filter(Boolean);
}

function renderHeatmap() {

  const wrap = $("heatmapWrap");

  const allValues = [];

  state.selected.forEach(record => {

    getValues(record).forEach(v => {

      const n = number(v);

      if (n !== null) {
        allValues.push(n);
      }

    });

  });

  const min =
    allValues.length
      ? Math.min(...allValues)
      : 0;

  const max =
    allValues.length
      ? Math.max(...allValues)
      : 1;

  let html = `

    <div style="
      display:flex;
      justify-content:space-between;
      gap:20px;
      margin-bottom:12px;
      color:#626a73;
      font-size:13px;
    ">

      <span>
        <strong>
          ${state.selected.length}
          gene${state.selected.length === 1 ? "" : "s"}
        </strong>
        · ${esc(labels[state.mode])}
      </span>

      <span>
        WC control vs SCN-WT treatment
      </span>

    </div>

    <table>

      <thead>

        <tr>
          <th>Gene</th>
          <th>WC</th>
          <th>SCN-WT</th>
          <th>Significance</th>
        </tr>

      </thead>

      <tbody>
  `;

  state.selected.forEach(record => {

    const values =
      getValues(record);

    const sig =
      significance(record);

    html += `

      <tr>

        <td class="gene">
          ${esc(record.gene)}
        </td>

        <td
          class="value"
          style="
            background:${heatColor(
              values[0],
              min,
              max
            )}
          "
        >
          ${
            number(values[0]) === null
              ? "NA"
              : fmt(values[0],2)
          }
        </td>

        <td
          class="value"
          style="
            background:${heatColor(
              values[1],
              min,
              max
            )}
          "
        >
          ${
            number(values[1]) === null
              ? "NA"
              : fmt(values[1],2)
          }
        </td>

        <td class="sig ${sig.cls}">
          ${esc(sig.text)}
        </td>

      </tr>
    `;
  });

  html += `

      </tbody>

    </table>

    <div class="gradient">

      <span>Low</span>

      <div class="gradient-bar"></div>

      <span>High</span>

    </div>
  `;

  wrap.innerHTML = html;
}

function renderDetails() {

  const wrap =
    $("geneDetailsWrap");

  let html = "";

  state.selected.forEach(record => {

    const meta =
      getMeta(record);

    const expressionClass =
      meta?.expression_class ||
      "Not classified";

    const lower =
      expressionClass.toLowerCase();

    let badgeClass =
      "neutral";

    if (lower.includes("induced")) {
      badgeClass = "up";
    }

    if (lower.includes("repressed")) {
      badgeClass = "down";
    }

    const go =
      Array.isArray(meta?.go_ids)
        ? meta.go_ids
        : [];

    const tf =
      meta?.tf || {};

    html += `

      <article class="detail-card">

        <div class="detail-title">

          <div>

            <div class="eyebrow">
              SELECTED GENE
            </div>

            <div class="detail-gene">
              ${esc(record.gene)}
            </div>

          </div>

          <span class="badge ${badgeClass}">
            ${esc(expressionClass)}
          </span>

        </div>

        <div class="detail-body">

          <h4>Condition response</h4>

          <div class="metrics">

            <div class="metric">
              <span>WC mean TPM</span>
              <strong>
                ${fmt(
                  meta?.wc_mean_tpm ??
                  record.tpm?.[0]
                )}
              </strong>
            </div>

            <div class="metric">
              <span>SCN-WT mean TPM</span>
              <strong>
                ${fmt(
                  meta?.scn_wt_mean_tpm ??
                  record.tpm?.[1]
                )}
              </strong>
            </div>

            <div class="metric">
              <span>log₂FC</span>
              <strong>
                ${fmt(
                  meta?.log2_fold_change ??
                  record.log2FoldChange
                )}
              </strong>
            </div>

            <div class="metric">
              <span>Fold change</span>
              <strong>
                ${fmt(
                  meta?.fold_change_scn_vs_wc
                )}
              </strong>
            </div>

            <div class="metric">
              <span>P-value</span>
              <strong>
                ${fmtP(
                  meta?.pvalue ??
                  record.pvalue
                )}
              </strong>
            </div>

            <div class="metric">
              <span>Adjusted P-value</span>
              <strong>
                ${fmtP(
                  meta?.padj ??
                  record.padj
                )}
              </strong>
            </div>

            <div class="metric">
              <span>SCN/WC TPM ratio</span>
              <strong>
                ${fmt(
                  meta?.scn_wt_vs_wc_tpm_ratio
                )}
              </strong>
            </div>

            <div class="metric">
              <span>log₂ TPM ratio</span>
              <strong>
                ${fmt(
                  meta?.log2_tpm_ratio_scn_vs_wc
                )}
              </strong>
            </div>

          </div>

          <h4>
            Functional annotation
          </h4>

          ${
            go.length

              ? `
                <div class="go">
                  ${go.map(
                    x =>
                      `<span>${esc(x)}</span>`
                  ).join("")}
                </div>
              `

              : `
                <div class="muted">
                  No GO identifiers available
                  for this gene.
                </div>
              `
          }

          <h4 style="margin-top:20px">
            Transcription factor annotation
          </h4>

          ${
            tf.is_tf

              ? `
                <div class="metrics">

                  <div class="metric">
                    <span>TF family</span>
                    <strong>
                      ${esc(
                        tf.family ||
                        "Unknown"
                      )}
                    </strong>
                  </div>

                  <div class="metric">
                    <span>TF gene</span>
                    <strong>
                      ${esc(
                        tf.planttfdb_gene ||
                        "Unknown"
                      )}
                    </strong>
                  </div>

                  <div class="metric">
                    <span>TF WC TPM</span>
                    <strong>
                      ${fmt(
                        tf.wc_mean_tpm
                      )}
                    </strong>
                  </div>

                  <div class="metric">
                    <span>TF SCN-WT TPM</span>
                    <strong>
                      ${fmt(
                        tf.scn_wt_mean_tpm
                      )}
                    </strong>
                  </div>

                </div>
              `

              : `
                <div class="muted">
                  This gene is not represented
                  in the current PlantTFDB
                  SCN TF summary.
                </div>
              `
          }

        </div>

      </article>
    `;
  });

  wrap.innerHTML =
    html ||
    `<div class="muted">
      No genes selected.
    </div>`;
}

function render() {

  $("resultsPanel").hidden = false;

  $("resultsSubtitle").textContent =
    `${labels[state.mode]} · WC control vs SCN-WT treatment · Root`;

  renderHeatmap();

  renderDetails();
}

function analyze() {

  const queries =
    parseGenes();

  const found = [];
  const missing = [];

  queries.forEach(query => {

    const record =
      findGene(query);

    if (
      record &&
      !found.includes(record)
    ) {
      found.push(record);
    }

    if (!record) {
      missing.push(query);
    }

  });

  state.selected =
    found;

  if (!queries.length) {

    $("searchStatus").textContent =
      "Enter at least one gene ID.";

    $("resultsPanel").hidden =
      true;

    return;
  }

  $("searchStatus").textContent =
    `${found.length} gene${
      found.length === 1
        ? ""
        : "s"
    } found${
      missing.length
        ? `; ${missing.length} not found`
        : ""
    }.`;

  if (missing.length) {

    $("missingPanel").hidden =
      false;

    $("missingPanel").textContent =
      `Not found: ${missing.join(", ")}`;

  } else {

    $("missingPanel").hidden =
      true;

  }

  if (!found.length) {

    $("resultsPanel").hidden =
      true;

    return;
  }

  render();
}

function clearAll() {

  $("geneInput").value = "";

  $("searchStatus").textContent =
    "";

  $("missingPanel").hidden =
    true;

  $("resultsPanel").hidden =
    true;

  state.selected = [];
}

function downloadCsv() {

  if (!state.selected.length) {
    return;
  }

  const rows = [[
    "Gene",
    "WC",
    "SCN-WT",
    "Expression scale",
    "log2FoldChange",
    "pvalue",
    "padj",
    "DE_status",
    "expression_class"
  ]];

  state.selected.forEach(record => {

    const meta =
      getMeta(record);

    const values =
      getValues(record);

    rows.push([
      record.gene,
      values[0] ?? "",
      values[1] ?? "",
      labels[state.mode],
      record.log2FoldChange ?? "",
      record.pvalue ?? "",
      record.padj ?? "",
      record.DE_status ?? "",
      meta?.expression_class ?? ""
    ]);

  });

  const csv =
    rows
      .map(row =>
        row
          .map(value => {

            const s =
              String(value ?? "");

            return /[",\n]/.test(s)
              ? `"${s.replace(
                  /"/g,
                  '""'
                )}"`
              : s;

          })
          .join(",")
      )
      .join("\n");

  const blob =
    new Blob(
      [csv],
      {
        type:
          "text/csv;charset=utf-8"
      }
    );

  const url =
    URL.createObjectURL(blob);

  const a =
    document.createElement("a");

  a.href = url;

  a.download =
    `SCN_W82_condition_expression_${state.mode}.csv`;

  document.body.appendChild(a);

  a.click();

  a.remove();

  URL.revokeObjectURL(url);
}

async function loadData() {

  const status =
    $("searchStatus");

  status.textContent =
    "Loading SCN_W82 data…";

  try {

    const responses =
      await Promise.all([
        fetch(
          DATA_URL,
          {
            cache:"no-store"
          }
        ),
        fetch(
          META_URL,
          {
            cache:"no-store"
          }
        )
      ]);

    if (!responses[0].ok) {
      throw new Error(
        `Expression data HTTP ${responses[0].status}`
      );
    }

    if (!responses[1].ok) {
      throw new Error(
        `Metadata HTTP ${responses[1].status}`
      );
    }

    const data =
      await responses[0].json();

    const metadata =
      await responses[1].json();

    if (!Array.isArray(data.records)) {
      throw new Error(
        "Expression dataset records missing"
      );
    }

    state.records =
      data.records;

    const metaRecords =
      Array.isArray(metadata.records)
        ? metadata.records
        : [];

    state.metadata =
      new Map(
        metaRecords
          .filter(
            x =>
              x &&
              (x.gene_norm || x.gene)
          )
          .map(
            x => [
              normGene(
                x.gene_norm ||
                x.gene
              ),
              x
            ]
          )
      );

    status.textContent =
      `SCN_W82 loaded: ${
        state.records.length.toLocaleString()
      } genes.`;

  } catch(error) {

    console.error(
      "Condition Expression error:",
      error
    );

    status.textContent =
      "Unable to load SCN_W82 expression data.";

  }
}

document.addEventListener(
  "DOMContentLoaded",
  () => {

    $("analyzeGenes")
      .addEventListener(
        "click",
        analyze
      );

    $("clearGenes")
      .addEventListener(
        "click",
        clearAll
      );

    $("downloadCsv")
      .addEventListener(
        "click",
        downloadCsv
      );

    $("expressionMode")
      .addEventListener(
        "change",
        event => {

          state.mode =
            event.target.value;

          if (state.selected.length) {
            render();
          }

        }
      );

    $("geneInput")
      .addEventListener(
        "keydown",
        event => {

          if (
            event.key === "Enter" &&
            (event.ctrlKey ||
             event.metaKey)
          ) {

            event.preventDefault();

            analyze();

          }

        }
      );

    loadData();

  }
);

})();

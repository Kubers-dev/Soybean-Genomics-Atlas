(() => {
  "use strict";

  const GENE_INDEX_URL =
    "data/a6/gene_index.json";

  const ANNOTATION_URL =
    "data/a6/annotation/candidate_annotation_index.json";

  const GO_URL =
    "data/a6/annotation/go_associations.json";

  const GO_TERMS_URL =
    "data/a6/annotation/go_terms.json";

  const TF_URL =
    "data/a6/annotation/tf/tf_combined_a6.json";

  let genes = [];
  let annotations = {};
  let goData = {};
  let goTerms = {};
  let tfData = {};

  let currentResults = [];
  let currentQuery = null;
  let currentEnrichment = [];
  let currentEnrichmentMeta = {
    candidateCount: 0,
    backgroundCount: 0
  };
  let currentNamespace = "BP";

  const $ = id => document.getElementById(id);

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c]));
  }

  function normalizeChr(value) {
    const s = String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/^chr/, "")
      .replace(/^g?m/, "");

    const n = parseInt(s, 10);

    return Number.isFinite(n) && n >= 1 && n <= 20
      ? String(n)
      : "";
  }

  function formatBp(n) {
    return Number(n).toLocaleString("en-US");
  }

  function formatDistance(n) {
    const kb = Math.abs(Number(n)) / 1000;

    if (kb >= 100) return `${Math.round(kb)} kb`;
    if (kb >= 10) return `${kb.toFixed(1)} kb`;

    return `${kb.toFixed(2)} kb`;
  }

  function setStatus(text, type = "") {
    const el = $("annotationStatus");
    el.textContent = text;
    el.className = `status-pill ${type}`.trim();
  }

  function normalizeGeneAnnotation(raw) {
    if (!raw) return {};

    if (Array.isArray(raw)) {
      const out = {};

      raw.forEach(item => {
        const id =
          item.id ||
          item.gene_id ||
          item.gene ||
          item.locusName ||
          item.locus ||
          "";

        if (id) out[id] = item;
      });

      return out;
    }

    if (raw.genes && Array.isArray(raw.genes)) {
      return normalizeGeneAnnotation(raw.genes);
    }

    return raw;
  }

  function normalizeTFData(raw) {
    if (!raw) return {};

    if (raw.genes) {
      return raw.genes;
    }

    return raw;
  }

  function normalizeGOData(raw) {
    if (!raw) return {};

    // Wm82.a6 GO association index stores both directions:
    // gene_to_terms and term_to_genes.
    if (raw.gene_to_terms || raw.term_to_genes) {
      return {
        source: raw.source || "",
        background_definition: raw.background_definition || "",
        background_gene_count: Number(raw.background_gene_count) || 0,
        gene_to_terms: raw.gene_to_terms || {},
        term_to_genes: raw.term_to_genes || {}
      };
    }

    if (raw.associations) {
      return raw.associations;
    }

    return raw;
  }

  async function fetchJSON(url) {
    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`${url}: HTTP ${response.status}`);
    }

    return response.json();
  }

  async function loadAllData() {
    try {
      const [
        geneRaw,
        annotationRaw,
        goRaw,
        goTermsRaw,
        tfRaw
      ] = await Promise.all([
        fetchJSON(GENE_INDEX_URL),
        fetchJSON(ANNOTATION_URL),
        fetchJSON(GO_URL),
        fetchJSON(GO_TERMS_URL),
        fetchJSON(TF_URL)
      ]);

      genes = Array.isArray(geneRaw)
        ? geneRaw
        : (geneRaw.genes
          ? geneRaw.genes
          : Object.values(geneRaw));

      genes = genes.map(g => ({
        id: g.id || g.gene_id || g.gene || "",
        chr: normalizeChr(
          g.chr ||
          g.chromosome ||
          g.seqid
        ),
        start: Number(g.start),
        end: Number(g.end),
        strand: g.strand || ".",
        name:
          g.name ||
          g.gene_name ||
          g.gene_id ||
          ""
      })).filter(g =>
        g.id &&
        g.chr &&
        Number.isFinite(g.start) &&
        Number.isFinite(g.end)
      );

      annotations = normalizeGeneAnnotation(annotationRaw);
      goData = normalizeGOData(goRaw);
      goTerms = goTermsRaw || {};
      tfData = normalizeTFData(tfRaw);

      setStatus(
        `${genes.length.toLocaleString()} genes + functional annotation loaded · Wm82.a6.v1`,
        "ready"
      );

      console.log("Candidate Gene data loaded:", {
        genes: genes.length,
        annotations: Object.keys(annotations).length,
        go: Object.keys(goData).length,
        goTerms: Object.keys(goTerms).length,
        tf: Object.keys(tfData).length
      });

    } catch (error) {
      console.error(error);

      setStatus(
        "Functional annotation not loaded",
        "error"
      );

      $("message").textContent =
        "The Wm82.a6.v1 gene index loaded, but one or more functional annotation files could not be loaded.";

      try {
        const raw = await fetchJSON(GENE_INDEX_URL);

        genes = Array.isArray(raw)
          ? raw
          : (raw.genes
            ? raw.genes
            : Object.values(raw));

        genes = genes.map(g => ({
          id: g.id || g.gene_id || g.gene || "",
          chr: normalizeChr(g.chr || g.chromosome || g.seqid),
          start: Number(g.start),
          end: Number(g.end),
          strand: g.strand || ".",
          name: g.name || g.gene_name || ""
        })).filter(g =>
          g.id &&
          g.chr &&
          Number.isFinite(g.start) &&
          Number.isFinite(g.end)
        );

        setStatus(
          `${genes.length.toLocaleString()} genes loaded · functional data unavailable`,
          "error"
        );

      } catch (fallbackError) {
        console.error(fallbackError);
        setStatus("Annotation not loaded", "error");
      }
    }
  }

  function getAnnotation(geneId) {
    return annotations[geneId] || {};
  }

  function getTF(geneId) {
    return tfData[geneId] || null;
  }

  function asArray(value) {
    if (value == null) return [];

    if (Array.isArray(value)) return value;

    return String(value)
      .split(/[;,|]/)
      .map(x => x.trim())
      .filter(Boolean);
  }

  function unique(values) {
    return [...new Set(values.filter(Boolean))];
  }

  function firstNonEmpty(...values) {
    for (const value of values) {
      if (value !== undefined &&
          value !== null &&
          String(value).trim() !== "") {
        return value;
      }
    }

    return "";
  }

  function annotationField(a, names) {
    for (const name of names) {
      if (a[name] !== undefined &&
          a[name] !== null &&
          String(a[name]).trim() !== "") {
        return a[name];
      }
    }

    return "";
  }

  function getDescription(gene) {
    const a = getAnnotation(gene.id);

    return firstNonEmpty(
      annotationField(a, [
        "description",
        "protein_description",
        "defline",
        "name",
        "function"
      ]),
      gene.name
    );
  }

  function getGO(geneId) {
    const a = getAnnotation(geneId);

    let values = [];

    values = values.concat(
      asArray(a.GO),
      asArray(a.go),
      asArray(a.go_terms),
      asArray(a.goTerms)
    );

    // Primary Wm82.a6 association source.
    if (!values.length && goData.gene_to_terms) {
      values = asArray(goData.gene_to_terms[geneId]);
    }

    return unique(values);
  }

  function getPfam(geneId) {
    const a = getAnnotation(geneId);

    return unique(
      asArray(
        annotationField(a, [
          "Pfam",
          "pfam",
          "pfams"
        ])
      )
    );
  }

  function getPanther(geneId) {
    const a = getAnnotation(geneId);

    return unique(
      asArray(
        annotationField(a, [
          "PANTHER",
          "panther"
        ])
      )
    );
  }

  function getInterPro(geneId) {
    const a = getAnnotation(geneId);

    return unique(
      asArray(
        annotationField(a, [
          "InterPro",
          "interpro"
        ])
      )
    );
  }

  function getEC(geneId) {
    const a = getAnnotation(geneId);

    return unique(
      asArray(
        annotationField(a, [
          "EC",
          "ec"
        ])
      )
    );
  }

  function getKO(geneId) {
    const a = getAnnotation(geneId);

    return unique(
      asArray(
        annotationField(a, [
          "KO",
          "ko"
        ])
      )
    );
  }

  function getTFInfo(geneId) {
    const raw = getTF(geneId);

    /*
     * The TF index contains directly mapped Wm82.a6 TF loci.
     * A missing entry therefore means that no TF annotation is
     * present in the current direct mapping index. It should not
     * automatically be labeled "unresolved".
     */

    if (!raw) {
      return {
        isTF: false,
        unresolved: false,
        family: [],
        proteins: [],
        source: []
      };
    }

    if (Array.isArray(raw)) {
      return {
        isTF: true,
        unresolved: false,
        family: unique(raw.map(x =>
          typeof x === "string"
            ? x
            : (x.family || x.Family || "")
        ).filter(Boolean)),
        proteins: unique(raw.map(x =>
          typeof x === "string"
            ? x
            : (x.TF_ID || x.protein_id || x.protein || "")
        ).filter(Boolean)),
        source: ["PlantTFDB"]
      };
    }

    const isTF =
      raw.isTF === true ||
      raw.is_tf === true ||
      Boolean(raw.family) ||
      Boolean(raw.Family) ||
      Array.isArray(raw.proteins) ||
      Array.isArray(raw.protein_ids) ||
      Array.isArray(raw.TF_ID) ||
      Array.isArray(raw.tf_ids);

    const unresolved =
      raw.unresolved === true ||
      raw.mapping_status === "unresolved" ||
      raw.status === "unresolved";

    return {
      isTF,
      unresolved,

      family: unique(
        asArray(
          raw.family ||
          raw.Family ||
          raw.families
        ).filter(Boolean)
      ),

      proteins: unique(
        asArray(
          raw.proteins ||
          raw.protein_ids ||
          raw.TF_ID ||
          raw.tf_ids
        ).filter(Boolean)
      ),

      source: unique(
        asArray(
          raw.source ||
          raw.sources ||
          "PlantTFDB"
        ).filter(Boolean)
      ),

      evidence: unique(
        asArray(
          raw.evidence ||
          raw.evidence_sources
        ).filter(Boolean)
      ),

      evidenceLevel:
        raw.evidence_level ||
        raw.evidenceLevel ||
        "",

      a6Description:
        raw.a6_description ||
        "",

      planttfdbSource:
        raw.planttfdb_source ||
        "",

      planttfdbSourceAnnotation:
        raw.planttfdb_source_annotation ||
        ""
    };
  }

  function functionalSummary(gene) {
    const tf = getTFInfo(gene.id);

    if (tf.isTF) {
      return `TF · ${tf.family.join(", ") || "family available"}`;
    }

    const description = getDescription(gene);

    if (description) {
      return description;
    }

    return "—";
  }

  function renderSummary(results, start, end) {
    const upstream =
      results.filter(g => g.region === "Upstream").length;

    const downstream =
      results.filter(g => g.region === "Downstream").length;

    const overlapping =
      results.filter(g => g.region === "Overlapping SNP").length;

    const tfCount =
      results.filter(g => getTFInfo(g.id).isTF).length;

    $("summary").innerHTML = `
      <div class="summary-box">
        <strong>${results.length}</strong>
        <span>Genes in region</span>
      </div>

      <div class="summary-box">
        <strong>${upstream}</strong>
        <span>Upstream genes</span>
      </div>

      <div class="summary-box">
        <strong>${downstream}</strong>
        <span>Downstream genes</span>
      </div>

      <div class="summary-box">
        <strong>${tfCount}</strong>
        <span>Annotated TFs</span>
      </div>

      <div class="summary-box">
        <strong>${overlapping}</strong>
        <span>Genes overlapping SNP</span>
      </div>

      <div class="summary-box">
        <strong>${formatBp(end - start + 1)} bp</strong>
        <span>Search interval</span>
      </div>
    `;
  }

  function renderPlot(results, chr, snp, start, end) {
    const plot = $("regionPlot");

    if (!results.length) {
      plot.hidden = true;
      plot.innerHTML = "";
      return;
    }

    const span = Math.max(1, end - start);

    const pct = value =>
      Math.max(
        0,
        Math.min(
          100,
          ((value - start) / span) * 100
        )
      );

    const geneBars = results
      .slice(0, 80)
      .map(g => {
        const left = pct(g.start);
        const right = pct(g.end);
        const width = Math.max(0.4, right - left);
        const center = left + width / 2;

        return `
          <div class="gene-bar ${getTFInfo(g.id).isTF ? "tf-bar" : ""}"
               title="${esc(g.id)}: ${formatBp(g.start)}–${formatBp(g.end)}"
               style="left:${left}%;width:${width}%"></div>

          <div class="gene-label"
               style="left:${center}%">
            ${esc(g.id)}
          </div>
        `;
      })
      .join("");

    const snpPct = pct(snp);

    plot.hidden = false;

    plot.innerHTML = `
      <div class="region-axis">
        <div class="axis-line"></div>

        <div class="snp-line"
             style="left:${snpPct}%"></div>

        <div class="snp-label"
             style="left:${snpPct}%">
          SNP ${formatBp(snp)}
        </div>

        ${geneBars}
      </div>
    `;
  }

  function renderResults(results, chr, snp, start, end) {
    currentResults = results;

    $("resultCount").textContent =
      `${results.length.toLocaleString()} gene${results.length === 1 ? "" : "s"}`;

    $("regionText").textContent =
      `Chr${String(chr).padStart(2, "0")}: ` +
      `${formatBp(start)}–${formatBp(end)} · ` +
      `SNP at ${formatBp(snp)}`;

    renderSummary(results, start, end);
    renderPlot(results, chr, snp, start, end);

    const body = $("resultsBody");

    if (!results.length) {
      body.innerHTML = `
        <tr>
          <td colspan="9" class="empty">
            No annotated genes overlap the selected interval.
          </td>
        </tr>
      `;

      $("downloadBtn").disabled = true;
      $("geneDetail").hidden = true;
      $("enrichmentSection").hidden = true;

      return;
    }

    body.innerHTML = results.map((g, index) => {
      const tf = getTFInfo(g.id);

      return `
        <tr class="candidate-row" data-index="${index}">
          <td>
            <button class="gene-link"
                    type="button"
                    data-index="${index}">
              ${esc(g.id)}
            </button>
          </td>

          <td>Chr${String(g.chr).padStart(2, "0")}</td>

          <td>${formatBp(g.start)}</td>

          <td>${formatBp(g.end)}</td>

          <td>${esc(g.strand)}</td>

          <td>${formatDistance(g.distance)}</td>

          <td class="${
            g.region === "Upstream"
              ? "region-upstream"
              : g.region === "Downstream"
                ? "region-downstream"
                : "region-overlap"
          }">
            ${esc(g.region)}
          </td>

          <td>
            ${
              tf.isTF
                ? `<span class="tf-badge">TF${tf.family.length ? " · " + esc(tf.family[0]) : ""}</span>`
                : `<span class="no-tf">No</span>`
            }
          </td>

          <td class="function-cell">
            ${esc(functionalSummary(g))}
          </td>
        </tr>
      `;
    }).join("");

    document.querySelectorAll(".gene-link").forEach(button => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.index);
        showGeneDetail(currentResults[index]);
      });
    });

    $("downloadBtn").disabled = false;

    $("enrichmentSection").hidden = false;

    calculateEnrichment();
  }

  function showGeneDetail(gene) {
    const panel = $("geneDetail");

    const a = getAnnotation(gene.id);

    const tf = getTFInfo(gene.id);

    const go = getGO(gene.id);

    const bp = go.filter(id => goNamespace(id) === "BP");
    const mf = go.filter(id => goNamespace(id) === "MF");
    const cc = go.filter(id => goNamespace(id) === "CC");

    const pfam = getPfam(gene.id);
    const panther = getPanther(gene.id);
    const interpro = getInterPro(gene.id);
    const ec = getEC(gene.id);
    const ko = getKO(gene.id);

    panel.hidden = false;

    panel.innerHTML = `
      <div class="detail-header">
        <div>
          <div class="eyebrow">CANDIDATE GENE DETAIL</div>
          <h2>${esc(gene.id)}</h2>
          <p>${esc(getDescription(gene))}</p>
        </div>

        <button type="button"
                class="close-detail"
                id="closeDetail">
          Close
        </button>
      </div>

      <div class="detail-grid">

        <div class="detail-box">
          <span>Chromosome</span>
          <strong>Chr${String(gene.chr).padStart(2, "0")}</strong>
        </div>

        <div class="detail-box">
          <span>Coordinates</span>
          <strong>${formatBp(gene.start)}–${formatBp(gene.end)}</strong>
        </div>

        <div class="detail-box">
          <span>Strand</span>
          <strong>${esc(gene.strand)}</strong>
        </div>

        <div class="detail-box">
          <span>Distance from SNP</span>
          <strong>${formatDistance(gene.distance)}</strong>
        </div>

        <div class="detail-box">
          <span>Region</span>
          <strong>${esc(gene.region)}</strong>
        </div>

        <div class="detail-box">
          <span>Transcription factor</span>
          <strong>
            ${
              tf.isTF
                ? `Yes${tf.family.length ? " · " + esc(tf.family.join(", ")) : ""}`
                : "No"
            }
          </strong>
        </div>

      </div>

      <div class="annotation-grid">

        <div class="annotation-box">
          <h3>Function / Description</h3>
          <p>${esc(getDescription(gene)) || "No description available."}</p>
        </div>

        <div class="annotation-box">
          <h3>Pfam</h3>
          <p>${pfam.length ? esc(pfam.join(", ")) : "Not available"}</p>
        </div>

        <div class="annotation-box">
          <h3>PANTHER</h3>
          <p>${panther.length ? esc(panther.join(", ")) : "Not available"}</p>
        </div>

        <div class="annotation-box">
          <h3>InterPro</h3>
          <p>
            ${
              interpro.length
                ? esc(interpro.join(", "))
                : "No InterPro annotation available in the current A6 index."
            }
          </p>
        </div>

        <div class="annotation-box">
          <h3>EC</h3>
          <p>${ec.length ? esc(ec.join(", ")) : "Not available"}</p>
        </div>

        <div class="annotation-box">
          <h3>KO</h3>
          <p>${ko.length ? esc(ko.join(", ")) : "Not available"}</p>
        </div>

        <div class="annotation-box">
          <h3>GO Biological Process</h3>
          <div class="tag-list">
            ${
              bp.length
                ? bp.map(id => `<span class="annotation-tag">${esc(id)} · ${esc(goTerm(id))}</span>`).join("")
                : "<span class='muted'>No BP annotation</span>"
            }
          </div>
        </div>

        <div class="annotation-box">
          <h3>GO Molecular Function</h3>
          <div class="tag-list">
            ${
              mf.length
                ? mf.map(id => `<span class="annotation-tag">${esc(id)} · ${esc(goTerm(id))}</span>`).join("")
                : "<span class='muted'>No MF annotation</span>"
            }
          </div>
        </div>

        <div class="annotation-box">
          <h3>GO Cellular Component</h3>
          <div class="tag-list">
            ${
              cc.length
                ? cc.map(id => `<span class="annotation-tag">${esc(id)} · ${esc(goTerm(id))}</span>`).join("")
                : "<span class='muted'>No CC annotation</span>"
            }
          </div>
        </div>

        <div class="annotation-box">
          <h3>Transcription Factor Information</h3>
          ${
            tf.isTF
              ? `
                <p><strong>Family:</strong> ${esc(tf.family.join(", ") || "Available")}</p>
                <p><strong>Evidence level:</strong> ${esc(tf.evidenceLevel || "Available")}</p>
                <p><strong>Evidence:</strong> ${esc(tf.evidence.join(", ") || "Available")}</p>
                <p><strong>Protein IDs:</strong> ${esc(tf.proteins.join(", ") || "Available")}</p>
                <p><strong>Source:</strong> ${esc(tf.source.join(", ") || "Available")}</p>
                ${
                  tf.a6Description
                    ? `<p><strong>A6 description:</strong> ${esc(tf.a6Description)}</p>`
                    : ""
                }
                ${
                  tf.planttfdbSource
                    ? `<p><strong>PlantTFDB:</strong> ${esc(tf.planttfdbSource)}${tf.planttfdbSourceAnnotation ? " · " + esc(tf.planttfdbSourceAnnotation) : ""}</p>`
                    : ""
                }
              `
              : `
                <p>No directly mapped TF annotation was found in the current
                Wm82.a6.1 TF mapping index.</p>
              `
          }
        </div>

      </div>
    `;

    $("closeDetail").addEventListener("click", () => {
      panel.hidden = true;
    });

    panel.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  /*
   * GO helpers
   *
   * The association index may contain:
   *   gene -> [GO IDs]
   * or:
   *   GO ID -> [gene IDs]
   */

  const goTermCache = {};

  function goNamespace(goId) {
    const term = goTerms[goId];

    if (term && typeof term === "object") {
      return term.category ||
        term.namespace ||
        term.ontology ||
        term.aspect ||
        "";
    }

    return "";
  }

  function goTerm(goId) {
    const cached = goTermCache[goId];

    if (cached) return cached;

    const term = goTerms[goId];

    if (typeof term === "string") {
      goTermCache[goId] = term;
      return term;
    }

    if (term && typeof term === "object") {
      const name =
        term.name ||
        term.term ||
        term.description ||
        "";

      goTermCache[goId] = name || goId;

      return goTermCache[goId];
    }

    goTermCache[goId] = goId;
    return goId;
  }

  function buildGOAssociations() {
    if (goData.gene_to_terms) {
      return goData.gene_to_terms;
    }

    return {};
  }

  let normalizedGO = null;

  function getNormalizedGO() {
    if (!normalizedGO) {
      normalizedGO = buildGOAssociations();
    }

    return normalizedGO;
  }

  function getGeneGOTerms(geneId) {
    const direct = getGO(geneId);

    if (direct.length) {
      return direct;
    }

    const normalized = getNormalizedGO();

    return unique(normalized[geneId] || []);
  }

  function goGenesByTerm() {
    const termToGenes = {};

    // Use the precomputed Wm82.a6 term -> gene index.
    if (goData.term_to_genes) {
      for (const [term, geneList] of Object.entries(goData.term_to_genes)) {
        termToGenes[term] = new Set(
          Array.isArray(geneList)
            ? geneList
            : []
        );
      }

      return termToGenes;
    }

    // Fallback for a gene -> terms-only index.
    for (const gene of genes) {
      const terms = getGeneGOTerms(gene.id);

      terms.forEach(term => {
        if (!termToGenes[term]) {
          termToGenes[term] = new Set();
        }

        termToGenes[term].add(gene.id);
      });
    }

    return termToGenes;
  }

  /*
   * Lanczos log-gamma implementation.
   * Used only for hypergeometric probability calculation.
   */

  function logGamma(z) {
    const coefficients = [
      676.5203681218851,
      -1259.1392167224028,
      771.32342877765313,
      -176.61502916214059,
      12.507343278686905,
      -0.13857109526572012,
      9.9843695780195716e-6,
      1.5056327351493116e-7
    ];

    if (z < 0.5) {
      return Math.log(Math.PI) -
        Math.log(Math.sin(Math.PI * z)) -
        logGamma(1 - z);
    }

    z -= 1;

    let x = 0.99999999999980993;

    for (let i = 0; i < coefficients.length; i++) {
      x += coefficients[i] / (z + i + 1);
    }

    const t = z + coefficients.length - 0.5;

    return (
      0.5 * Math.log(2 * Math.PI) +
      (z + 0.5) * Math.log(t) -
      t +
      Math.log(x)
    );
  }

  function logCombination(n, k) {
    if (k < 0 || k > n) return -Infinity;

    return (
      logGamma(n + 1) -
      logGamma(k + 1) -
      logGamma(n - k + 1)
    );
  }

  function hypergeomUpperTail(
    population,
    successes,
    draws,
    observed
  ) {
    if (
      observed <= 0 ||
      successes <= 0 ||
      draws <= 0 ||
      population <= 0
    ) {
      return 1;
    }

    const maxK =
      Math.min(
        successes,
        draws
      );

    const minK =
      Math.max(
        0,
        draws - (population - successes)
      );

    const start =
      Math.max(
        observed,
        minK
      );

    if (start > maxK) return 1;

    let sum = 0;

    for (let k = start; k <= maxK; k++) {
      const logP =
        logCombination(successes, k) +
        logCombination(
          population - successes,
          draws - k
        ) -
        logCombination(
          population,
          draws
        );

      const p = Math.exp(logP);

      if (Number.isFinite(p)) {
        sum += p;
      }
    }

    return Math.min(1, Math.max(0, sum));
  }

  function bhAdjust(rows) {
    const sorted = rows
      .map((row, index) => ({
        row,
        index
      }))
      .sort((a, b) =>
        a.row.p - b.row.p
      );

    const m = sorted.length;
    const q = new Array(m);

    let previous = 1;

    for (let i = m - 1; i >= 0; i--) {
      const rank = i + 1;

      const value =
        Math.min(
          previous,
          sorted[i].row.p * m / rank
        );

      q[i] = value;
      previous = value;
    }

    sorted.forEach((item, i) => {
      item.row.fdr = q[i];
    });

    return rows;
  }

  function calculateEnrichment() {
    if (!currentResults.length) return;

    const candidateIds =
      new Set(currentResults.map(g => g.id));

    const allGenesWithGO =
      genes.filter(g =>
        getGeneGOTerms(g.id).length > 0
      );

    const backgroundIds =
      new Set(allGenesWithGO.map(g => g.id));

    const candidateBackground =
      currentResults.filter(g =>
        backgroundIds.has(g.id)
      );

    const N = backgroundIds.size;
    const n = candidateBackground.length;

    if (!N || !n) {
      currentEnrichment = [];
      currentEnrichmentMeta = {
        candidateCount: n,
        backgroundCount: N
      };

      $("enrichmentBody").innerHTML = `
        <tr>
          <td colspan="9" class="empty">
            No GO-annotated candidate genes are available for enrichment.
          </td>
        </tr>
      `;

      $("downloadEnrichmentBtn").disabled = true;

      return;
    }

    const termToGenes = goGenesByTerm();

    const rows = [];

    for (const [termId, geneSet] of Object.entries(termToGenes)) {

      const namespace =
        goNamespace(termId);

      if (!["BP", "MF", "CC"].includes(namespace)) {
        continue;
      }

      const backgroundCount =
        [...geneSet].filter(id =>
          backgroundIds.has(id)
        ).length;

      if (!backgroundCount) continue;

      const candidateCount =
        [...geneSet].filter(id =>
          candidateIds.has(id) &&
          backgroundIds.has(id)
        ).length;

      if (!candidateCount) continue;

      const expected =
        n * backgroundCount / N;

      const fold =
        expected > 0
          ? candidateCount / expected
          : 0;

      const p =
        hypergeomUpperTail(
          N,
          backgroundCount,
          n,
          candidateCount
        );

      rows.push({
        id: termId,
        term: goTerm(termId),
        namespace,
        candidateCount,
        backgroundCount,
        expected,
        fold,
        p,
        fdr: 1
      });
    }

    bhAdjust(rows);

    rows.sort((a, b) =>
      a.fdr - b.fdr ||
      b.fold - a.fold
    );

    currentEnrichment = rows;
    currentEnrichmentMeta = {
      candidateCount: n,
      backgroundCount: N
    };

    renderEnrichment(currentNamespace);
  }

  function renderEnrichment(namespace) {
    const rows =
      currentEnrichment
        .filter(row =>
          row.namespace === namespace
        )
        .slice(0, 50);

    const body =
      $("enrichmentBody");

    if (!rows.length) {
      body.innerHTML = `
        <tr>
          <td colspan="9" class="empty">
            No enriched ${namespace} GO terms were found.
          </td>
        </tr>
      `;

      $("downloadEnrichmentBtn").disabled = true;

      $("enrichmentPlot").innerHTML = "";

      return;
    }

    const candidateCount =
      currentEnrichmentMeta.candidateCount;

    const backgroundCount =
      currentEnrichmentMeta.backgroundCount;

    const interpretation =
      candidateCount < 10
        ? `GO enrichment is based on ${candidateCount} GO-annotated candidate gene${candidateCount === 1 ? "" : "s"} out of ${backgroundCount.toLocaleString()} GO-annotated Wm82.a6.v1 background genes. Because the candidate set is small, fold-enrichment values can be unstable and should be interpreted together with the candidate count, expected count, raw p-value, and BH-adjusted FDR.`
        : `GO enrichment is based on ${candidateCount.toLocaleString()} GO-annotated candidate genes out of ${backgroundCount.toLocaleString()} GO-annotated Wm82.a6.v1 background genes. Fold enrichment is descriptive; statistical interpretation should rely primarily on the raw p-value and BH-adjusted FDR together with candidate and expected counts.`;

    body.innerHTML = `
      <tr class="enrichment-note-row">
        <td colspan="9">
          <strong>Interpretation:</strong> ${esc(interpretation)}
        </td>
      </tr>
      ${rows.map(row => `
      <tr>
        <td>${esc(row.id)}</td>

        <td>${esc(row.term)}</td>

        <td>${esc(row.namespace)}</td>

        <td>${row.candidateCount}</td>

        <td>${row.backgroundCount}</td>

        <td>${row.expected.toFixed(2)}</td>

        <td>${row.fold.toFixed(2)}</td>

        <td>${formatP(row.p)}</td>

        <td>
          <strong>${formatP(row.fdr)}</strong>
        </td>
      </tr>
      `).join("")}
    `;

    $("downloadEnrichmentBtn").disabled = false;

    renderEnrichmentPlot(rows);
  }

  function formatP(value) {
    if (!Number.isFinite(value)) return "NA";

    if (value === 0) return "<1e-300";

    if (value < 0.0001) {
      return value.toExponential(2);
    }

    return value.toPrecision(3);
  }

  function renderEnrichmentPlot(rows) {
    const plot = $("enrichmentPlot");

    if (!rows.length) {
      plot.innerHTML = "";
      return;
    }

    const top =
      rows
        .slice()
        .sort((a, b) =>
          a.fdr - b.fdr ||
          b.fold - a.fold
        )
        .slice(0, 12);

    const max =
      Math.max(
        1,
        ...top.map(x => x.fold)
      );

    plot.innerHTML = `
      <div class="plot-title">
        Top enriched GO terms
      </div>

      <div class="bar-chart">
        ${
          top.map(row => {
            const width =
              Math.max(
                2,
                (row.fold / max) * 100
              );

            return `
              <div class="bar-row"
                   title="${esc(row.id)} · ${esc(row.term)}">

                <div class="bar-label">
                  ${esc(row.term)}
                </div>

                <div class="bar-track">
                  <div class="bar-fill"
                       style="width:${width}%"></div>
                </div>

                <div class="bar-value">
                  ${row.fold.toFixed(2)}×
                </div>

              </div>
            `;
          }).join("")
        }
      </div>
    `;
  }

  function downloadCSV() {
    if (!currentResults.length || !currentQuery) return;

    const header = [
      "SNP_ID",
      "Chromosome",
      "SNP_Position_bp",
      "Upstream_kb",
      "Downstream_kb",
      "Region_Start_bp",
      "Region_End_bp",
      "Gene_ID",
      "Gene_Name",
      "Gene_Start_bp",
      "Gene_End_bp",
      "Strand",
      "Distance_from_SNP_bp",
      "Region",
      "Function",
      "TF",
      "TF_Family",
      "TF_Evidence_Level",
      "TF_Evidence",
      "TF_Sources",
      "TF_Protein_IDs",
      "GO_BP",
      "GO_MF",
      "GO_CC",
      "Pfam",
      "PANTHER",
      "InterPro",
      "EC",
      "KO"
    ];

    const rows =
      currentResults.map(g => {
        const tf = getTFInfo(g.id);

        const go =
          getGeneGOTerms(g.id);

        return [
          currentQuery.snpId,
          `Chr${String(currentQuery.chr).padStart(2, "0")}`,
          currentQuery.snp,
          currentQuery.up,
          currentQuery.down,
          currentQuery.start,
          currentQuery.end,
          g.id,
          g.name,
          g.start,
          g.end,
          g.strand,
          g.distance,
          g.region,
          getDescription(g),
          tf.isTF ? "Yes" : "No",
          tf.family.join("; "),
          tf.evidenceLevel || "",
          tf.evidence.join("; "),
          tf.source.join("; "),
          tf.proteins.join("; "),
          go.filter(x => goNamespace(x) === "BP").join("; "),
          go.filter(x => goNamespace(x) === "MF").join("; "),
          go.filter(x => goNamespace(x) === "CC").join("; "),
          getPfam(g.id).join("; "),
          getPanther(g.id).join("; "),
          getInterPro(g.id).join("; "),
          getEC(g.id).join("; "),
          getKO(g.id).join("; ")
        ];
      });

    downloadCSVFile(
      [header, ...rows],
      `candidate_genes_chr${currentQuery.chr}_${currentQuery.snp}_${currentQuery.up}kb_${currentQuery.down}kb.csv`
    );
  }

  function downloadEnrichmentCSV() {
    if (!currentEnrichment.length) return;

    const header = [
      "GO_ID",
      "Term",
      "Ontology",
      "Candidate_Count",
      "Background_Count",
      "Expected",
      "Fold_Enrichment",
      "P_Value",
      "FDR"
    ];

    const rows =
      currentEnrichment.map(row => [
        row.id,
        row.term,
        row.namespace,
        row.candidateCount,
        row.backgroundCount,
        row.expected,
        row.fold,
        row.p,
        row.fdr
      ]);

    downloadCSVFile(
      [header, ...rows],
      "candidate_gene_GO_enrichment.csv"
    );
  }

  function downloadCSVFile(rows, filename) {
    const csv =
      rows.map(row =>
        row.map(value =>
          `"${String(value ?? "").replace(/"/g, '""')}"`
        ).join(",")
      ).join("\n");

    const blob =
      new Blob(
        [csv],
        { type: "text/csv;charset=utf-8" }
      );

    const url =
      URL.createObjectURL(blob);

    const a =
      document.createElement("a");

    a.href = url;
    a.download = filename;

    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
  }

  function search() {
    if (!genes.length) {
      $("message").textContent =
        "The Wm82.a6.v1 annotation is not loaded yet.";

      return;
    }

    const chr =
      normalizeChr($("chromosome").value);

    const snp =
      Number($("position").value);

    const up =
      Number($("upstream").value);

    const down =
      Number($("downstream").value);

    if (
      !chr ||
      !Number.isFinite(snp) ||
      snp < 1
    ) {
      $("message").textContent =
        "Enter a valid chromosome and SNP position.";

      return;
    }

    if (
      !Number.isFinite(up) ||
      up < 0 ||
      !Number.isFinite(down) ||
      down < 0
    ) {
      $("message").textContent =
        "Upstream and downstream distances must be non-negative.";

      return;
    }

    const start =
      Math.max(
        1,
        Math.floor(snp - up * 1000)
      );

    const end =
      Math.floor(
        snp + down * 1000
      );

    currentQuery = {
      snpId: $("snpId").value.trim(),
      chr,
      snp,
      up,
      down,
      start,
      end
    };

    const results =
      genes
        .filter(g =>
          g.chr === chr &&
          g.end >= start &&
          g.start <= end
        )
        .map(g => {
          let distance = 0;
          let region = "Overlapping SNP";

          if (g.end < snp) {
            distance = g.end - snp;
            region = "Upstream";
          } else if (g.start > snp) {
            distance = g.start - snp;
            region = "Downstream";
          }

          return {
            ...g,
            distance,
            region
          };
        })
        .sort((a, b) =>
          Math.abs(a.distance) -
          Math.abs(b.distance)
        );

    $("message").textContent =
      `Searched ${formatBp(start)}–${formatBp(end)} ` +
      `on Chr${String(chr).padStart(2, "0")}.`;

    renderResults(
      results,
      chr,
      snp,
      start,
      end
    );
  }

  document
    .querySelectorAll(".quick-distances button")
    .forEach(btn => {
      btn.addEventListener("click", () => {
        $("upstream").value =
          btn.dataset.kb;

        $("downstream").value =
          btn.dataset.kb;
      });
    });

  document
    .querySelectorAll(".go-tab")
    .forEach(tab => {
      tab.addEventListener("click", () => {

        document
          .querySelectorAll(".go-tab")
          .forEach(x =>
            x.classList.remove("active")
          );

        tab.classList.add("active");

        currentNamespace =
          tab.dataset.namespace;

        renderEnrichment(
          currentNamespace
        );
      });
    });

  $("searchBtn")
    .addEventListener("click", search);

  $("downloadBtn")
    .addEventListener("click", downloadCSV);

  $("downloadEnrichmentBtn")
    .addEventListener(
      "click",
      downloadEnrichmentCSV
    );

  $("position")
    .addEventListener(
      "keydown",
      event => {
        if (event.key === "Enter") {
          search();
        }
      }
    );

  loadAllData();

})();

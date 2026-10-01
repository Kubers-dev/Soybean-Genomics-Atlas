(function () {
    "use strict";

    const DATA_URL = "data/multiple-gene/kegg_pathways.json";
    const FDR_CUTOFF = 0.05;

    let keggData = null;

    function normalizeGene(id) {
        return String(id || "")
            .trim()
            .toUpperCase();
    }

    function parseGenes() {
        const input = document.getElementById("multipleGeneInput");

        if (!input) {
            return [];
        }

        return [...new Set(
            input.value
                .split(/[\s,;]+/)
                .map(normalizeGene)
                .filter(Boolean)
        )];
    }

    function logFactorial(n) {
        if (n < 2) return 0;

        let result = 0;

        for (let i = 2; i <= n; i++) {
            result += Math.log(i);
        }

        return result;
    }

    function logCombination(n, k) {
        if (k < 0 || k > n) {
            return -Infinity;
        }

        return (
            logFactorial(n) -
            logFactorial(k) -
            logFactorial(n - k)
        );
    }

    /*
     * Hypergeometric upper-tail probability:
     *
     * P(X >= observed)
     *
     * Population N
     * Successes K
     * Sample size n
     * Observed successes k
     */
    function hypergeometricUpperTail(N, K, n, k) {

        if (
            N <= 0 ||
            K <= 0 ||
            n <= 0 ||
            k <= 0
        ) {
            return 1;
        }

        const maxX = Math.min(K, n);

        let probability = 0;

        for (let x = k; x <= maxX; x++) {

            if (n - x > N - K) {
                continue;
            }

            const logP =
                logCombination(K, x) +
                logCombination(N - K, n - x) -
                logCombination(N, n);

            probability += Math.exp(logP);
        }

        return Math.min(1, Math.max(0, probability));
    }

    function benjaminiHochberg(pValues) {

        const indexed = pValues
            .map((p, index) => ({
                p,
                index
            }))
            .sort((a, b) => a.p - b.p);

        const m = indexed.length;

        const adjusted = new Array(m);

        let previous = 1;

        for (let i = m - 1; i >= 0; i--) {

            const rank = i + 1;

            const value =
                (indexed[i].p * m) / rank;

            previous = Math.min(previous, value);

            adjusted[indexed[i].index] =
                Math.min(1, previous);
        }

        return adjusted;
    }

    async function loadKEGG() {

        if (keggData) {
            return keggData;
        }

        const response = await fetch(DATA_URL, {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error(
                `Unable to load KEGG data (${response.status})`
            );
        }

        const data = await response.json();

        if (!data.pathways || typeof data.pathways !== "object") {
            throw new Error(
                "KEGG pathway dictionary is missing or invalid."
            );
        }

        if (!Array.isArray(data.background_genes)) {
            throw new Error(
                "KEGG background gene list is missing or invalid."
            );
        }

        keggData = data;

        return data;
    }

    function escapeHTML(value) {

        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function formatP(value) {

        if (!Number.isFinite(value)) {
            return "—";
        }

        if (value === 0) {
            return "< 1×10⁻³⁰⁰";
        }

        if (value < 0.001) {
            return value.toExponential(2);
        }

        return value.toPrecision(3);
    }

    function formatFDR(value) {

        if (!Number.isFinite(value)) {
            return "—";
        }

        if (value < 0.001) {
            return value.toExponential(2);
        }

        return value.toPrecision(3);
    }

    function calculateEnrichment(genes, data) {

        const background = new Set(
            data.background_genes.map(normalizeGene)
        );

        const submitted = genes.filter(g =>
            background.has(g)
        );

        const submittedSet = new Set(submitted);

        const pathways = Object.values(data.pathways);

        const results = [];

        const N = background.size;
        const n = submitted.length;

        if (!n) {
            return {
                submitted,
                background,
                results: []
            };
        }

        for (const pathway of pathways) {

            const pathwayGenes = new Set(
                (pathway.genes || [])
                    .map(normalizeGene)
                    .filter(g => background.has(g))
            );

            const K = pathwayGenes.size;

            if (!K) {
                continue;
            }

            const contributingGenes =
                [...submittedSet]
                    .filter(g => pathwayGenes.has(g));

            const observed = contributingGenes.length;

            if (!observed) {
                continue;
            }

            const expected =
                (n * K) / N;

            const enrichment =
                expected > 0
                    ? observed / expected
                    : 0;

            const rawP =
                hypergeometricUpperTail(
                    N,
                    K,
                    n,
                    observed
                );

            results.push({
                id: pathway.id,
                name: pathway.name,
                observed,
                pathwayGenes: K,
                expected,
                enrichment,
                rawP,
                contributingGenes
            });
        }

        const fdr =
            benjaminiHochberg(
                results.map(r => r.rawP)
            );

        results.forEach((r, i) => {
            r.fdr = fdr[i];
        });

        results.sort((a, b) => {

            if (a.fdr !== b.fdr) {
                return a.fdr - b.fdr;
            }

            return a.rawP - b.rawP;
        });

        return {
            submitted,
            background,
            results
        };
    }

    function createSummaryHTML(
        genes,
        data,
        analysis
    ) {

        const mapped =
            analysis.submitted.length;

        const unmapped =
            genes.length - mapped;

        const significant =
            analysis.results.filter(
                r => r.fdr <= FDR_CUTOFF
            ).length;

        return `
            <div class="fresh-kegg-summary">

                <div class="fresh-kegg-card">
                    <span>GWAS CANDIDATES</span>
                    <strong>${genes.length}</strong>
                </div>

                <div class="fresh-kegg-card">
                    <span>KEGG-MAPPED</span>
                    <strong>${mapped}</strong>
                </div>

                <div class="fresh-kegg-card">
                    <span>BACKGROUND</span>
                    <strong>${data.background_gene_count.toLocaleString()}</strong>
                </div>

                <div class="fresh-kegg-card">
                    <span>FDR ≤ 0.05</span>
                    <strong>${significant}</strong>
                </div>

            </div>

            <div class="fresh-kegg-note">

                <strong>KEGG mapping:</strong>
                ${mapped} of ${genes.length} submitted candidate genes
                have KEGG pathway annotations.

                ${
                    unmapped > 0
                    ? `${unmapped} candidate genes have no KEGG pathway mapping and are excluded from pathway enrichment.`
                    : ""
                }

            </div>
        `;
    }

    function createPlot(results) {

        const significant =
            results
                .filter(r => r.fdr <= FDR_CUTOFF)
                .sort((a, b) => a.fdr - b.fdr)
                .slice(0, 10);

        if (!significant.length) {

            return `
                <div class="fresh-kegg-empty">
                    No KEGG pathways reached FDR ≤ 0.05.
                    The complete enrichment results are shown in
                    the statistical table below.
                </div>
            `;
        }

        const maxEnrichment =
            Math.max(
                ...significant.map(r => r.enrichment)
            );

        const scaleMax =
            Math.ceil(maxEnrichment / 10) * 10;

        return `

            <div class="fresh-kegg-legend">

                <span>
                    <span class="fresh-kegg-legend-dot"></span>
                    Enrichment relative to expected representation
                </span>

                <span>
                    FDR ≤ 0.05
                </span>

            </div>

            ${significant.map((r) => {

                const width =
                    Math.max(
                        5,
                        Math.min(
                            100,
                            (r.enrichment / scaleMax) * 100
                        )
                    );

                return `
                    <div class="fresh-kegg-row">

                        <div class="fresh-kegg-label">

                            <strong>
                                ${escapeHTML(r.name)}
                            </strong>

                            <small>
                                ${escapeHTML(r.id)}
                            </small>

                        </div>

                        <div class="fresh-kegg-track">

                            <div
                                class="fresh-kegg-bar"
                                style="width:${width}%"
                                title="${r.enrichment.toFixed(2)}× enrichment"
                            ></div>

                        </div>

                        <div class="fresh-kegg-value">
                            ${r.enrichment.toFixed(2)}×
                        </div>

                        <div class="fresh-kegg-fdr">
                            FDR ${formatFDR(r.fdr)}
                        </div>

                    </div>
                `;

            }).join("")}

            <div class="fresh-kegg-plot-note">
                Pathways are ordered by Benjamini–Hochberg FDR.
                Bar length represents enrichment relative to the
                expected number of candidate genes.
            </div>
        `;
    }

    function createTable(results) {

        if (!results.length) {

            return `
                <div class="fresh-kegg-empty">
                    None of the submitted candidate genes have
                    KEGG pathway annotations.
                </div>
            `;
        }

        return `
            <div class="fresh-kegg-table-wrapper">

                <table class="fresh-kegg-table">

                    <thead>
                        <tr>
                            <th>KEGG pathway</th>
                            <th>Observed</th>
                            <th>Pathway genes</th>
                            <th>Expected</th>
                            <th>Enrichment</th>
                            <th>Raw P</th>
                            <th>FDR</th>
                            <th>Contributing GWAS genes</th>
                        </tr>
                    </thead>

                    <tbody>

                        ${results.map(r => {

                            const significant =
                                r.fdr <= FDR_CUTOFF;

                            return `
                                <tr>

                                    <td>
                                        <strong>
                                            ${escapeHTML(r.name)}
                                        </strong>
                                        <br>
                                        <small>
                                            ${escapeHTML(r.id)}
                                        </small>
                                    </td>

                                    <td>
                                        ${r.observed}
                                    </td>

                                    <td>
                                        ${r.pathwayGenes}
                                    </td>

                                    <td>
                                        ${r.expected.toFixed(2)}
                                    </td>

                                    <td>
                                        ${r.enrichment.toFixed(2)}×
                                    </td>

                                    <td>
                                        ${formatP(r.rawP)}
                                    </td>

                                    <td>
                                        <strong
                                            ${
                                                significant
                                                ? 'class="fresh-kegg-significant"'
                                                : ""
                                            }
                                        >
                                            ${formatFDR(r.fdr)}
                                        </strong>
                                    </td>

                                    <td>
                                        ${r.contributingGenes
                                            .map(escapeHTML)
                                            .join(", ")}
                                    </td>

                                </tr>
                            `;

                        }).join("")}

                    </tbody>

                </table>

            </div>
        `;
    }


    function downloadKEGGCSV(analysis) {

        const rows = [
            [
                "KEGG pathway",
                "KEGG ID",
                "Observed",
                "Pathway genes",
                "Expected",
                "Enrichment",
                "Raw P",
                "FDR",
                "Contributing GWAS genes"
            ]
        ];

        analysis.results.forEach(r => {

            rows.push([
                r.name,
                r.id,
                r.observed,
                r.pathwayGenes,
                r.expected,
                r.enrichment,
                r.rawP,
                r.fdr,
                r.contributingGenes.join("; ")
            ]);

        });

        const csv = rows.map(row =>
            row.map(value => {

                const text = String(value ?? "");

                return (
                    text.includes(",") ||
                    text.includes('"') ||
                    text.includes("\n")
                )
                    ? '"' + text.replace(/"/g, '""') + '"'
                    : text;

            }).join(",")
        ).join("\n");

        const blob = new Blob(
            [csv],
            { type: "text/csv;charset=utf-8;" }
        );

        const url = URL.createObjectURL(blob);

        const link = document.createElement("a");

        link.href = url;
        link.download =
            "soybean_GWAS_KEGG_enrichment_results.csv";

        document.body.appendChild(link);
        link.click();
        link.remove();

        URL.revokeObjectURL(url);
    }


    async function downloadKEGGPNG() {

        const module =
            document.querySelector(
                "#multipleGeneKEGGFresh .fresh-kegg-module"
            );

        if (!module) {
            console.warn(
                "KEGG module not available for PNG export."
            );
            return;
        }

        if (typeof html2canvas === "undefined") {
            alert(
                "PNG export library is not available."
            );
            return;
        }

        const button =
            document.getElementById(
                "freshKeggDownloadPNG"
            );

        if (button) {
            button.disabled = true;
            button.textContent = "Preparing PNG...";
        }

        try {

            const canvas =
                await html2canvas(
                    module,
                    {
                        backgroundColor: "#ffffff",
                        scale: 2,
                        useCORS: true,
                        logging: false
                    }
                );

            const link =
                document.createElement("a");

            link.download =
                "soybean_GWAS_KEGG_enrichment_plot.png";

            link.href =
                canvas.toDataURL("image/png");

            document.body.appendChild(link);
            link.click();
            link.remove();

        } catch (error) {

            console.error(
                "KEGG PNG export failed:",
                error
            );

            alert(
                "Unable to export the KEGG plot as PNG."
            );

        } finally {

            if (button) {
                button.disabled = false;
                button.textContent =
                    "Download Plot PNG";
            }
        }
    }


    function addKEGGDownloadButtons(analysis) {

        const actions =
            document.getElementById(
                "freshKeggDownloadActions"
            );

        const pngButton =
            document.getElementById(
                "freshKeggDownloadPNG"
            );

        const csvButton =
            document.getElementById(
                "freshKeggDownloadCSV"
            );

        if (!actions || !pngButton || !csvButton) {
            console.warn(
                "KEGG download controls not found."
            );
            return;
        }

        actions.hidden = false;

        pngButton.onclick = function () {
            downloadKEGGPNG();
        };

        csvButton.onclick = function () {
            downloadKEGGCSV(analysis);
        };
    }


    function render(genes, data, analysis) {

        const container =
            document.getElementById(
                "multipleGeneKEGGFresh"
            );

        if (!container) {
            console.warn(
                "Fresh KEGG container not found."
            );
            return;
        }

        const significant =
            analysis.results.filter(
                r => r.fdr <= FDR_CUTOFF
            );

        container.innerHTML = `

            <section class="fresh-kegg-module">

                <div class="fresh-kegg-header">

                    <div>

                        <div class="network-eyebrow">
                            KEGG PATHWAY ENRICHMENT
                        </div>

                        <h2>
                            Functional Convergence Through KEGG
                        </h2>

                        <p>
                            Hypergeometric pathway enrichment of
                            the submitted GWAS candidate genes using
                            the soybean KEGG-mapped background.
                        </p>

                    </div>

                    <div class="fresh-kegg-method-badge">
                        FDR ≤ 0.05
                    </div>

                </div>

                ${createSummaryHTML(
                    genes,
                    data,
                    analysis
                )}

                <div class="fresh-kegg-scientific-note">

                    <strong>Interpretation:</strong>
                    KEGG enrichment identifies pathways represented
                    more often among the submitted candidate genes
                    than expected from the KEGG-mapped soybean
                    background. It does not establish causality,
                    physical interaction, or regulatory direction.

                </div>

                <div class="fresh-kegg-section">

                    <div class="network-eyebrow">
                        ENRICHED PATHWAYS
                    </div>

                    <h3>
                        Significant KEGG Convergence
                    </h3>

                    ${createPlot(
                        analysis.results
                    )}

                </div>

                <div class="fresh-kegg-section">

                    <div class="network-eyebrow">
                        ENRICHMENT RESULTS
                    </div>

                    <h3>
                        KEGG Statistical Results
                    </h3>

                    ${createTable(
                        analysis.results
                    )}

                </div>

                ${
                    significant.length
                    ? `
                        <div class="fresh-kegg-note">

                            <strong>
                                Significant pathways:
                            </strong>

                            ${significant.length}
                            pathway(s) passed
                            Benjamini–Hochberg FDR ≤ 0.05.

                        </div>
                    `
                    : ""
                }

            </section>
        `;
    }

    async function runFreshKEGG() {

        const container =
            document.getElementById(
                "multipleGeneKEGGFresh"
            );

        if (!container) {
            return;
        }

        const genes = parseGenes();

        if (genes.length < 2) {
            container.innerHTML = "";
            container.hidden = true;
            return;
        }

        container.hidden = false;

        container.innerHTML = `
            <section class="fresh-kegg-module">
                <div class="fresh-kegg-loading">
                    Loading KEGG pathway data…
                </div>
            </section>
        `;

        try {

            const data = await loadKEGG();

            const analysis =
                calculateEnrichment(
                    genes,
                    data
                );

            render(
                genes,
                data,
                analysis
            );

            addKEGGDownloadButtons(
                analysis
            );

            console.log(
                "Fresh KEGG analysis complete:",
                {
                    submitted: genes.length,
                    mapped: analysis.submitted.length,
                    pathways: analysis.results.length,
                    significant:
                        analysis.results.filter(
                            r => r.fdr <= FDR_CUTOFF
                        ).length
                }
            );

        } catch (error) {

            console.error(
                "Fresh KEGG analysis failed:",
                error
            );

            container.innerHTML = `
                <section class="fresh-kegg-module">
                    <div class="fresh-kegg-error">
                        <strong>
                            KEGG analysis error
                        </strong>
                        <br><br>
                        ${escapeHTML(error.message)}
                    </div>
                </section>
            `;
        }
    }

    function attach() {

        const buildButton =
            document.getElementById(
                "buildMultipleGeneNetwork"
            );

        if (!buildButton) {

            setTimeout(
                attach,
                500
            );

            return;
        }

        if (
            buildButton.dataset
                .freshKeggAttached === "true"
        ) {
            return;
        }

        buildButton.dataset
            .freshKeggAttached = "true";

        buildButton.addEventListener(
            "click",
            function () {

                setTimeout(
                    runFreshKEGG,
                    350
                );

            }
        );

        console.log(
            "Fresh KEGG module attached."
        );
    }

    if (document.readyState === "loading") {

        document.addEventListener(
            "DOMContentLoaded",
            attach
        );

    } else {

        attach();

    }

    window.runFreshKEGG =
        runFreshKEGG;

})();

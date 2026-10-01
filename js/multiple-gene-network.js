(function () {
    "use strict";

    /*
     * ============================================================
     * MULTIPLE GENE — EVIDENCE-DRIVEN CANDIDATE CONVERGENCE
     * ============================================================
     *
     * Independent from js/network-analysis.js.
     *
     * Evidence source:
     *   data/multiple-gene/evidence/GmXX.json
     *
     * Analysis:
     *   1. Candidate Network
     *   2. Network Modules
     *   3. Shared Neighborhood
     *   4. Bridge Analysis
     *   5. Expression Convergence
     *   6. Functional Convergence
     *
     * No physical PPI or regulatory interaction is inferred.
     * Expression similarity is explicitly labeled as expression
     * evidence, and functional overlap is kept separate.
     * ============================================================
     */

    const EVIDENCE_BASE = "data/multiple-gene/evidence/";

    const state = {
        genes: [],
        evidence: {},
        edges: [],
        modules: [],
        sharedNeighbors: [],
        bridges: [],
        network: null,
        loadedChromosomes: new Set()
    };

    const $ = (id) => document.getElementById(id);

    const geneInput = $("multipleGeneInput");
    const geneCount = $("multipleGeneCount");
    const buildButton = $("buildMultipleGeneNetwork");
    const clearButton = $("clearMultipleGeneNetwork");
    const statusBox = $("multipleGeneStatus");
    const results = $("multipleGeneResults");

    const resultCount = $("multipleGeneResultCount");
    const relationshipCount = $("multipleGeneRelationshipCount");
    const densityBox = $("multipleGeneDensity");

    const canvas = $("multipleGeneCanvas");
    const connectivityBody = $("multipleGeneConnectivityBody");

    const interpretation = $("multipleGeneInterpretation");
    const fingerprintBox = $("multipleGeneFingerprint");
    const modulesBox = $("multipleGeneModules");
    const sharedNeighborsBox = $("multipleGeneSharedNeighbors");
    const bridgesBox = $("multipleGeneBridges");
    const architectureBox = $("multipleGeneArchitectureText");

    const fitButton = $("fitMultipleGeneNetwork");
    const resetButton = $("resetMultipleGeneNetwork");

    const networkType = $("multipleNetworkType");
    const thresholdControl = $("multipleCorrelationThreshold");

    function normalizeGene(value) {
        if (!value) return "";

        let gene = String(value).trim();

        if (!gene) return "";

        const prefix = "glyma.Wm82.gnm6.ann1.";

        if (gene.toLowerCase().startsWith(prefix)) {
            gene = gene.slice(prefix.length);
        }

        if (/^GLYMA\d{2}G\d+$/i.test(gene)) {
            const upper = gene.toUpperCase();
            const chromosome = upper.slice(5, 7);
            const number = upper.slice(8);

            gene = "Glyma." + chromosome + "G" + number;
        }

        return gene;
    }

    function getGenes() {
        if (!geneInput) return [];

        const raw = geneInput.value
            .split(/[\s,;]+/)
            .map(normalizeGene)
            .filter(Boolean);

        return [...new Set(raw)];
    }

    function updateGeneCount() {
        const genes = getGenes();

        if (geneCount) {
            geneCount.textContent = genes.length + " candidate gene" +
                (genes.length === 1 ? "" : "s");
        }
    }

    function showStatus(message, type) {
        if (!statusBox) return;

        statusBox.textContent = message;
        statusBox.className = "multiple-gene-status";

        if (type) {
            statusBox.classList.add(type);
        }
    }

    function chromosomeForGene(gene) {
        const match = gene.match(/^Glyma\.(\d{2})G/i);

        if (!match) return null;

        return "Gm" + match[1];
    }

    async function loadChromosome(chromosome) {
        if (!chromosome) return;

        if (state.loadedChromosomes.has(chromosome)) {
            return;
        }

        const response = await fetch(
            EVIDENCE_BASE + chromosome + ".json"
        );

        if (!response.ok) {
            throw new Error(
                "Unable to load evidence for " + chromosome
            );
        }

        const data = await response.json();

        Object.assign(state.evidence, data.genes);

        state.loadedChromosomes.add(chromosome);
    }

    async function loadCandidateEvidence(genes) {
        const chromosomes = [
            ...new Set(
                genes
                    .map(chromosomeForGene)
                    .filter(Boolean)
            )
        ];

        await Promise.all(
            chromosomes.map(loadChromosome)
        );

        const missingChromosome = genes.filter(
            gene => !chromosomeForGene(gene)
        );

        if (missingChromosome.length) {
            throw new Error(
                "Invalid Wm82.a6 gene ID: " +
                missingChromosome.join(", ")
            );
        }

        const missingGenes = genes.filter(
            gene => !state.evidence[gene]
        );

        return {
            chromosomes,
            missingGenes
        };
    }

    function getExpressionVector(item, dataset) {
        if (!item || !item[dataset]) {
            return null;
        }

        const values = item[dataset].log2tpm;

        if (!values || typeof values !== "object") {
            return null;
        }

        const vector = [];

        Object.keys(values).forEach(condition => {
            const value = values[condition];

            if (typeof value === "number" && Number.isFinite(value)) {
                vector.push({
                    condition,
                    value
                });
            }
        });

        if (!vector.length) {
            return null;
        }

        return vector;
    }

    function pearson(a, b) {
        if (!a || !b) return null;

        const mapA = {};
        const mapB = {};

        a.forEach(x => {
            mapA[x.condition] = x.value;
        });

        b.forEach(x => {
            mapB[x.condition] = x.value;
        });

        const common = Object.keys(mapA).filter(
            key => Object.prototype.hasOwnProperty.call(mapB, key)
        );

        if (common.length < 3) {
            return null;
        }

        const x = common.map(k => mapA[k]);
        const y = common.map(k => mapB[k]);

        const meanX = x.reduce((s, v) => s + v, 0) / x.length;
        const meanY = y.reduce((s, v) => s + v, 0) / y.length;

        let numerator = 0;
        let denominatorX = 0;
        let denominatorY = 0;

        for (let i = 0; i < x.length; i++) {
            const dx = x[i] - meanX;
            const dy = y[i] - meanY;

            numerator += dx * dy;
            denominatorX += dx * dx;
            denominatorY += dy * dy;
        }

        const denominator =
            Math.sqrt(denominatorX * denominatorY);

        if (!denominator) {
            return null;
        }

        return numerator / denominator;
    }

    function expressionRelationship(geneA, geneB) {
        const a = state.evidence[geneA];
        const b = state.evidence[geneB];

        if (!a || !b) return null;

        const tissueA = getExpressionVector(a, "tx");
        const tissueB = getExpressionVector(b, "tx");

        const tissueCorrelation = pearson(tissueA, tissueB);

        const rootA = getExpressionVector(a, "rh");
        const rootB = getExpressionVector(b, "rh");

        const rootCorrelation = pearson(rootA, rootB);

        const candidates = [];

        if (tissueCorrelation !== null) {
            candidates.push({
                type: "Expression — tissue",
                correlation: tissueCorrelation
            });
        }

        if (rootCorrelation !== null) {
            candidates.push({
                type: "Expression — root hair",
                correlation: rootCorrelation
            });
        }

        if (!candidates.length) {
            return null;
        }

        candidates.sort(
            (x, y) =>
                Math.abs(y.correlation) -
                Math.abs(x.correlation)
        );

        return candidates[0];
    }

    function functionalRelationship(geneA, geneB) {
        const a = state.evidence[geneA];
        const b = state.evidence[geneB];

        if (!a || !b) return null;

        const termsA = new Set(
            Array.isArray(a.go) ? a.go.map(String) : []
        );

        const termsB = new Set(
            Array.isArray(b.go) ? b.go.map(String) : []
        );

        const sharedGO = [...termsA].filter(
            term => termsB.has(term)
        );

        const domainsA = new Set(
            []
                .concat(a.pf || [])
                .concat(a.ip || [])
                .concat(a.ko || [])
                .concat(a.dm || [])
                .map(String)
        );

        const domainsB = new Set(
            []
                .concat(b.pf || [])
                .concat(b.ip || [])
                .concat(b.ko || [])
                .concat(b.dm || [])
                .map(String)
        );

        const sharedFunctional = [...domainsA].filter(
            item => domainsB.has(item)
        );

        if (!sharedGO.length && !sharedFunctional.length) {
            return null;
        }

        return {
            type: "Functional evidence",
            sharedGO,
            sharedFunctional
        };
    }

    function buildEdges(genes) {
        const threshold = Number(
            thresholdControl ? thresholdControl.value : 0.80
        );

        const edges = [];

        for (let i = 0; i < genes.length; i++) {
            for (let j = i + 1; j < genes.length; j++) {

                const geneA = genes[i];
                const geneB = genes[j];

                const expression = expressionRelationship(
                    geneA,
                    geneB
                );

                const functional = functionalRelationship(
                    geneA,
                    geneB
                );

                if (
                    expression &&
                    Math.abs(expression.correlation) >= threshold
                ) {
                    edges.push({
                        source: geneA,
                        target: geneB,
                        relationship: expression.type,
                        weight: expression.correlation,
                        evidence: "Expression"
                    });
                }

                /*
                 * Functional overlap is deliberately kept separate.
                 * It does not become a numeric expression edge.
                 */
                if (
                    functional &&
                    functional.sharedGO.length > 0
                ) {
                    edges.push({
                        source: geneA,
                        target: geneB,
                        relationship: "Shared GO evidence",
                        weight: functional.sharedGO.length,
                        evidence: "Functional"
                    });
                }
            }
        }

        return edges;
    }

    function buildAdjacency(genes, edges) {
        const adjacency = {};

        genes.forEach(gene => {
            adjacency[gene] = new Set();
        });

        edges.forEach(edge => {
            if (!adjacency[edge.source]) {
                adjacency[edge.source] = new Set();
            }

            if (!adjacency[edge.target]) {
                adjacency[edge.target] = new Set();
            }

            adjacency[edge.source].add(edge.target);
            adjacency[edge.target].add(edge.source);
        });

        return adjacency;
    }

    function findModules(genes, adjacency) {
        const visited = new Set();
        const modules = [];

        genes.forEach(start => {
            if (visited.has(start)) return;

            const queue = [start];
            const module = [];

            visited.add(start);

            while (queue.length) {
                const current = queue.shift();

                module.push(current);

                adjacency[current].forEach(next => {
                    if (!visited.has(next)) {
                        visited.add(next);
                        queue.push(next);
                    }
                });
            }

            modules.push(module);
        });

        return modules;
    }

    /*
     * GWAS shared-neighborhood analysis
     *
     * Identify non-candidate Wm82.a6 genes that show
     * expression-supported similarity to two or more
     * submitted GWAS candidate genes.
     *
     * This is an expression-based neighborhood analysis.
     * It does NOT imply physical interaction, regulation,
     * or causality.
     */
    function findSharedNeighborhood(genes) {

        const threshold = Number(
            thresholdControl ? thresholdControl.value : 0.80
        );

        const candidateSet = new Set(genes);
        const neighborMap = {};

        Object.keys(state.evidence).forEach(neighborGene => {

            if (candidateSet.has(neighborGene)) {
                return;
            }

            const connectedCandidates = [];

            genes.forEach(candidateGene => {

                const relationship =
                    expressionRelationship(
                        neighborGene,
                        candidateGene
                    );

                if (
                    relationship &&
                    Math.abs(relationship.correlation) >= threshold
                ) {

                    connectedCandidates.push({
                        gene: candidateGene,
                        correlation:
                            relationship.correlation,
                        relationship:
                            relationship.type
                    });

                }

            });

            /*
             * A shared neighborhood gene must connect
             * to at least two submitted GWAS candidates.
             */
            if (connectedCandidates.length >= 2) {

                connectedCandidates.sort(
                    (a, b) =>
                        Math.abs(b.correlation) -
                        Math.abs(a.correlation)
                );

                neighborMap[neighborGene] = {
                    gene: neighborGene,
                    candidates: connectedCandidates,
                    candidateCount:
                        connectedCandidates.length,
                    maxCorrelation:
                        Math.max(
                            ...connectedCandidates.map(
                                item =>
                                    Math.abs(
                                        item.correlation
                                    )
                            )
                        ),
                    meanCorrelation:
                        connectedCandidates.reduce(
                            (sum, item) =>
                                sum +
                                Math.abs(
                                    item.correlation
                                ),
                            0
                        ) /
                        connectedCandidates.length
                };

            }

        });

        return Object.values(neighborMap)
            .sort(
                (a, b) =>
                    b.candidateCount -
                    a.candidateCount ||
                    b.meanCorrelation -
                    a.meanCorrelation
            )
            .slice(0, 100);

    }

    function findBridges(genes, modules, adjacency) {
        if (modules.length < 2) {
            return [];
        }

        const moduleMap = {};

        modules.forEach((module, index) => {
            module.forEach(gene => {
                moduleMap[gene] = index;
            });
        });

        return genes
            .map(gene => {
                const neighboringModules = new Set();

                adjacency[gene].forEach(neighbor => {
                    if (
                        moduleMap[neighbor] !== undefined &&
                        moduleMap[neighbor] !== moduleMap[gene]
                    ) {
                        neighboringModules.add(
                            moduleMap[neighbor]
                        );
                    }
                });

                return {
                    gene,
                    neighboringModules: [...neighboringModules]
                };
            })
            .filter(
                item => item.neighboringModules.length > 0
            );
    }

    function calculateDensity(genes, edges) {
        if (genes.length < 2) return 0;

        const possible =
            genes.length * (genes.length - 1) / 2;

        const uniquePairs = new Set(
            edges.map(edge => {
                return [edge.source, edge.target]
                    .sort()
                    .join("|");
            })
        );

        return uniquePairs.size / possible;
    }

    function renderFingerprint(genes, edges, modules, shared, bridges) {
        if (!fingerprintBox) return;

        const possible =
            genes.length * (genes.length - 1) / 2;

        const density = calculateDensity(genes, edges);

        fingerprintBox.innerHTML = `
            <div class="fingerprint-item">
                <strong>${genes.length}</strong>
                <span>Candidate genes</span>
            </div>

            <div class="fingerprint-item">
                <strong>${edges.length}</strong>
                <span>Evidence relationships</span>
            </div>

            <div class="fingerprint-item">
                <strong>${modules.length}</strong>
                <span>Network modules</span>
            </div>

            <div class="fingerprint-item">
                <strong>${shared.length}</strong>
                <span>Shared neighborhoods</span>
            </div>

            <div class="fingerprint-item">
                <strong>${bridges.length}</strong>
                <span>Bridge candidates</span>
            </div>

            <div class="fingerprint-item">
                <strong>${possible}</strong>
                <span>Possible candidate pairs</span>
            </div>

            <div class="fingerprint-item">
                <strong>${(density * 100).toFixed(1)}%</strong>
                <span>Network density</span>
            </div>
        `;
    }

    function renderModules(modules) {
        if (!modulesBox) return;

        if (!modules.length) {
            modulesBox.innerHTML =
                "<p>No network modules could be calculated.</p>";
            return;
        }

        modulesBox.innerHTML = modules.map(
            (module, index) => `
                <div class="multiple-gene-module">
                    <div class="multiple-gene-module-header">
                        <span class="multiple-gene-module-title">
                            Module ${index + 1}
                        </span>
                        <span class="multiple-gene-module-count">
                            ${module.length} candidate${module.length === 1 ? "" : "s"}
                        </span>
                    </div>

                    <div class="multiple-gene-gene-list">
                        ${module.map(gene =>
                            `<span>${gene}</span>`
                        ).join("")}
                    </div>
                </div>
            `
        ).join("");
    }

    function renderSharedNeighbors(shared) {
        if (!sharedNeighborsBox) return;

        if (!shared.length) {
            sharedNeighborsBox.innerHTML = `
                <p>
                    No expression-supported shared neighborhood
                    genes were detected for the submitted GWAS
                    candidates at the selected correlation threshold.
                </p>

                <div class="multiple-gene-scientific-note">
                    A shared neighborhood gene must show expression
                    similarity to at least two submitted candidate genes.
                    Absence of a detected neighbor does not indicate
                    absence of biological association.
                </div>
            `;
            return;
        }

        sharedNeighborsBox.innerHTML = `
            <div class="multiple-gene-node-note">
                Shared neighborhood genes are non-candidate Wm82.a6
                genes showing expression-supported similarity to
                multiple submitted GWAS candidates. These relationships
                do not establish physical interaction, regulation,
                or causality.
            </div>

            ${shared.map(item => `
                <div class="shared-neighbor-row">

                    <div>
                        <strong>${item.gene}</strong>
                    </div>

                    <div>
                        Connected to
                        <strong>
                            ${item.candidateCount}
                        </strong>
                        GWAS candidates
                    </div>

                    <div class="multiple-gene-node-note">
                        ${item.candidates.map(candidate => `
                            <span>
                                ${candidate.gene}
                                (${candidate.correlation >= 0 ? "+" : ""}
                                ${candidate.correlation.toFixed(2)})
                            </span>
                        `).join(" · ")}
                    </div>

                    <div class="multiple-gene-node-note">
                        Mean absolute expression correlation:
                        <strong>
                            ${item.meanCorrelation.toFixed(2)}
                        </strong>
                    </div>

                </div>
            `).join("")}
        `;
    }

    function renderBridges(bridges) {
        if (!bridgesBox) return;

        if (!bridges.length) {
            bridgesBox.innerHTML = `
                <p>
                    No cross-module bridge candidates were
                    identified in the current candidate network.
                </p>
            `;
            return;
        }

        bridgesBox.innerHTML = bridges.map(
            item => `
                <div class="bridge-row">
                    <strong>${item.gene}</strong>
                    <span>
                        Connects ${item.neighboringModules.length}
                        additional module
                        ${item.neighboringModules.length === 1 ? "" : "s"}
                    </span>
                </div>
            `
        ).join("");
    }

    function renderArchitecture(modules, bridges) {
        if (!architectureBox) return;

        if (modules.length <= 1) {
            architectureBox.innerHTML = `
                <p>
                    The entered candidates form a single connected
                    network component under the selected evidence
                    threshold. No cross-module bridge structure is
                    therefore present.
                </p>
            `;
            return;
        }

        architectureBox.innerHTML = `
            <p>
                The candidate set separates into
                <strong>${modules.length}</strong> network modules.
                ${bridges.length
                    ? `<strong>${bridges.length}</strong>
                       candidate(s) show connections spanning
                       otherwise separate modules.`
                    : `No candidate currently shows a
                       cross-module connection.`}
            </p>
        `;
    }

    function renderConnectivityTable(genes, adjacency, modules, bridges) {
        if (!connectivityBody) return;

        const moduleMap = {};

        modules.forEach((module, index) => {
            module.forEach(gene => {
                moduleMap[gene] = index + 1;
            });
        });

        const bridgeSet = new Set(
            bridges.map(item => item.gene)
        );

        connectivityBody.innerHTML = genes.map(gene => {

            const degree = adjacency[gene]
                ? adjacency[gene].size
                : 0;

            const connectivity =
                genes.length > 1
                    ? degree / (genes.length - 1)
                    : 0;

            return `
                <tr>
                    <td>${gene}</td>
                    <td>${degree}</td>
                    <td>${(connectivity * 100).toFixed(1)}%</td>
                    <td>Module ${moduleMap[gene] || "—"}</td>
                    <td>
                        ${bridgeSet.has(gene)
                            ? "Cross-module"
                            : "—"}
                    </td>
                </tr>
            `;
        }).join("");
    }

    function renderInterpretation(
        genes,
        edges,
        modules,
        shared,
        bridges
    ) {
        if (!interpretation) return;

        const expressionEdges = edges.filter(
            edge => edge.evidence === "Expression"
        ).length;

        const functionalEdges = edges.filter(
            edge => edge.evidence === "Functional"
        ).length;

        interpretation.innerHTML = `
            <div class="reading-item">
                <strong>Expression evidence</strong>
                <span>
                    ${expressionEdges} relationship(s) were
                    supported by similarity in the available
                    expression profiles.
                </span>
            </div>

            <div class="reading-item">
                <strong>Functional evidence</strong>
                <span>
                    ${functionalEdges} relationship(s) involved
                    shared GO evidence.
                </span>
            </div>

            <div class="reading-item">
                <strong>Network structure</strong>
                <span>
                    The candidate set contains ${modules.length}
                    network module(s), with ${bridges.length}
                    cross-module bridge candidate(s).
                </span>
            </div>

            <div class="reading-item">
                <strong>Shared neighborhood</strong>
                <span>
                    ${shared.length}
                    shared functional neighborhood(s) were
                    detected among multiple candidates.
                </span>
            </div>

            <div class="multiple-gene-scientific-note">
                Network relationships represent evidence-supported
                expression or functional similarity. They do not
                establish physical interaction, direct regulation,
                or causality.
            </div>
        `;
    }

    function renderExpressionConvergence(genes) {
        const existing =
            document.getElementById("multipleGeneExpressionConvergence");

        if (!existing) return;

        const tissueConditions = [
            "Nodule",
            "SAM",
            "Flower",
            "Green Pod",
            "Leaf",
            "Root",
            "Root Tip"
        ];

        const rootConditions = [
            "12HAI UN RH",
            "12HAI IN RH",
            "24HAI UN RH",
            "24HAI IN RH",
            "48HAI UN RH",
            "48HAI IN RH",
            "48HAI Stripped Root"
        ];

        function buildTable(dataset, conditions, label) {
            const rows = genes.map(gene => {

                const item = state.evidence[gene];
                const expr = item ? item[dataset] : null;

                if (!expr || !expr.log2tpm) {
                    return `
                        <tr>
                            <td>${gene}</td>
                            <td colspan="${conditions.length}">
                                Expression unavailable
                            </td>
                        </tr>
                    `;
                }

                return `
                    <tr>
                        <td>${gene}</td>
                        ${conditions.map(condition => {
                            const value =
                                expr.log2tpm[condition];

                            return `
                                <td>
                                    ${
                                        typeof value === "number" &&
                                        Number.isFinite(value)
                                            ? value.toFixed(2)
                                            : "—"
                                    }
                                </td>
                            `;
                        }).join("")}
                    </tr>
                `;
            }).join("");

            return `
                <h4>${label}</h4>

                <div class="multiple-gene-table-wrap">
                    <table class="multiple-gene-table">
                        <thead>
                            <tr>
                                <th>Gene</th>
                                ${conditions.map(
                                    condition =>
                                        `<th>${condition}</th>`
                                ).join("")}
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            `;
        }

        existing.innerHTML =
            buildTable(
                "tx",
                tissueConditions,
                "Tissue expression"
            ) +
            buildTable(
                "rh",
                rootConditions,
                "Root-hair / infection expression"
            );
    }

    function renderFunctionalConvergence(genes) {
        const existing =
            document.getElementById("multipleGeneFunctionalConvergence");

        if (!existing) return;

        existing.innerHTML = genes.map(gene => {

            const item = state.evidence[gene];

            if (!item) return "";

            const description =
                item.d || "No functional description available.";

            const go = item.go || [];
            const pf = item.pf || [];
            const ip = item.ip || [];
            const ko = item.ko || [];
            const domains = item.dm || [];

            return `
                <div class="multiple-gene-analysis-card">
                    <h4>${gene}</h4>

                    <p>${description}</p>

                    <div class="multiple-gene-node-note">
                        GO terms: ${go.length}
                        &nbsp;|&nbsp;
                        PFAM: ${pf.length}
                        &nbsp;|&nbsp;
                        InterPro: ${ip.length}
                        &nbsp;|&nbsp;
                        KO: ${ko.length}
                        &nbsp;|&nbsp;
                        Domains: ${domains.length}
                    </div>

                    ${
                        go.length
                            ? `<div class="multiple-gene-gene-list">
                                ${go.slice(0, 20).map(
                                    term => `<span>${term}</span>`
                                ).join("")}
                               </div>`
                            : `<div class="multiple-gene-node-note">
                                No GO terms available.
                               </div>`
                    }
                </div>
            `;
        }).join("");
    }

    function renderNetwork(genes, edges) {

        if (!canvas || typeof cytoscape === "undefined") {
            return;
        }

        if (state.network) {
            state.network.destroy();
            state.network = null;
        }

        const elements = [];

        genes.forEach(gene => {
            elements.push({
                data: {
                    id: gene,
                    label: gene,
                    type: "candidate"
                }
            });
        });

        edges.forEach((edge, index) => {

            const edgeId =
                "e" + index + "_" +
                edge.source + "_" +
                edge.target;

            elements.push({
                data: {
                    id: edgeId,
                    source: edge.source,
                    target: edge.target,
                    label: edge.relationship,
                    evidence: edge.evidence,
                    weight: edge.weight
                }
            });
        });

        state.network = cytoscape({
            container: canvas,
            elements,

            style: [
                {
                    selector: "node",
                    style: {
                        "background-color": "#2f6b45",
                        "label": "data(label)",
                        "color": "#1f2937",
                        "font-size": "11px",
                        "text-valign": "bottom",
                        "text-margin-y": 8,
                        "width": 38,
                        "height": 38,
                        "border-width": 2,
                        "border-color": "#1f4d31"
                    }
                },

                {
                    selector: "edge",
                    style: {
                        "line-color": "#7b8794",
                        "width": 2,
                        "curve-style": "bezier",
                        "opacity": 0.8
                    }
                },

                {
                    selector: 'edge[evidence = "Functional"]',
                    style: {
                        "line-style": "dashed",
                        "line-color": "#8a6d3b"
                    }
                },

                {
                    selector: 'edge[evidence = "Expression"]',
                    style: {
                        "line-style": "solid"
                    }
                },

                {
                    selector: "node:selected",
                    style: {
                        "border-width": 4
                    }
                }
            ],

            layout: {
                name: "cose",
                animate: true,
                fit: true,
                padding: 50,
                nodeRepulsion: 9000,
                idealEdgeLength: 150,
                gravity: 0.6,
                numIter: 1000
            }
        });

        state.network.on(
            "tap",
            "node",
            function (event) {

                const gene =
                    event.target.data("id");

                const item =
                    state.evidence[gene];

                if (!item) return;

                showStatus(
                    gene +
                    " — " +
                    (
                        item.d ||
                        "No functional description available."
                    ),
                    "info"
                );
            }
        );
    }

    async function buildMultipleGeneAnalysis() {

        const genes = getGenes();

        if (genes.length < 2) {
            showStatus(
                "Enter at least 2 Wm82.a6 candidate genes.",
                "error"
            );
            return;
        }

        if (genes.length > 50) {
            showStatus(
                "Please enter no more than 50 candidate genes.",
                "error"
            );
            return;
        }

        showStatus(
            "Loading Wm82.a6 evidence...",
            "loading"
        );

        try {

            const loaded =
                await loadCandidateEvidence(genes);

            if (loaded.missingGenes.length) {
                showStatus(
                    "Gene(s) not found in Wm82.a6: " +
                    loaded.missingGenes.join(", "),
                    "error"
                );
                return;
            }

            state.genes = genes;

            showStatus(
                "Calculating evidence-supported relationships...",
                "loading"
            );

            const edges = buildEdges(genes);
            const adjacency = buildAdjacency(genes, edges);
            const modules = findModules(genes, adjacency);
            const shared = findSharedNeighborhood(genes);
            const bridges = findBridges(
                genes,
                modules,
                adjacency
            );

            state.edges = edges;
            state.modules = modules;
            state.sharedNeighbors = shared;
            state.bridges = bridges;

            const density =
                calculateDensity(genes, edges);

            if (resultCount) {
                resultCount.textContent = genes.length;
            }

            if (relationshipCount) {
                relationshipCount.textContent = edges.length;
            }

            if (densityBox) {
                densityBox.textContent =
                    (density * 100).toFixed(1) + "%";
            }

            renderFingerprint(
                genes,
                edges,
                modules,
                shared,
                bridges
            );

            renderModules(modules);
            renderSharedNeighbors(shared);
            renderBridges(bridges);
            renderArchitecture(modules, bridges);

            renderConnectivityTable(
                genes,
                adjacency,
                modules,
                bridges
            );

            renderInterpretation(
                genes,
                edges,
                modules,
                shared,
                bridges
            );

            renderExpressionConvergence(genes);
            renderFunctionalConvergence(genes);

            if (results) {
                results.hidden = false;
            }

            renderNetwork(genes, edges);

            showStatus(
                "Analysis complete using Wm82.a6 evidence.",
                "success"
            );

        } catch (error) {

            console.error(
                "Multiple Gene analysis error:",
                error
            );

            showStatus(
                "Analysis failed: " + error.message,
                "error"
            );
        }
    }

    function clearMultipleGeneAnalysis() {

        if (geneInput) {
            geneInput.value = "";
        }

        state.genes = [];
        state.evidence = {};
        state.edges = [];
        state.modules = [];
        state.sharedNeighbors = [];
        state.bridges = [];
        state.loadedChromosomes.clear();

        if (state.network) {
            state.network.destroy();
            state.network = null;
        }

        if (results) {
            results.hidden = true;
        }

        showStatus(
            "Enter candidate genes to begin analysis.",
            ""
        );

        updateGeneCount();
    }

    if (geneInput) {
        geneInput.addEventListener(
            "input",
            updateGeneCount
        );
    }

    if (buildButton) {
        buildButton.addEventListener(
            "click",
            buildMultipleGeneAnalysis
        );
    }

    if (clearButton) {
        clearButton.addEventListener(
            "click",
            clearMultipleGeneAnalysis
        );
    }

    if (fitButton) {
        fitButton.addEventListener(
            "click",
            function () {
                if (state.network) {
                    state.network.fit(undefined, 50);
                }
            }
        );
    }

    if (resetButton) {
        resetButton.addEventListener(
            "click",
            function () {
                if (state.network) {
                    state.network.layout({
                        name: "cose",
                        animate: true,
                        fit: true,
                        padding: 50,
                        nodeRepulsion: 9000,
                        idealEdgeLength: 150,
                        gravity: 0.6,
                        numIter: 1000
                    }).run();
                }
            }
        );
    }

    updateGeneCount();

    window.currentMultipleGeneNetwork = state;

})();

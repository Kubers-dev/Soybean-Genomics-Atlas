/*
 * Soybean Genomics Atlas
 * Network Analysis Module
 *
 * This module is isolated from:
 * - GWAS Analysis
 * - Online GWAS
 * - Phenotype Analysis
 * - Candidate Gene
 *
 * Current version:
 * - Functional demonstration network
 * - Uses predefined example network relationships
 * - Ready for future Wm82.a6 network datasets
 */

(function () {
    "use strict";

    /* =========================================================
       DEMO NETWORK DATA
       ========================================================= */

    const NETWORK_DATA = {

        "Glyma.09G073600": {
            name: "Glyma.09G073600",

            expression: [
                {
                    gene: "Glyma.09G073600",
                    correlation: 1.00,
                    evidence: "Query gene"
                },
                {
                    gene: "Glyma.09G073700",
                    correlation: 0.91,
                    evidence: "RNA-seq co-expression"
                },
                {
                    gene: "Glyma.09G073800",
                    correlation: 0.86,
                    evidence: "RNA-seq co-expression"
                },
                {
                    gene: "Glyma.09G073900",
                    correlation: 0.82,
                    evidence: "RNA-seq co-expression"
                },
                {
                    gene: "Glyma.09G074000",
                    correlation: 0.77,
                    evidence: "RNA-seq co-expression"
                },
                {
                    gene: "Glyma.09G074100",
                    correlation: 0.71,
                    evidence: "RNA-seq co-expression"
                },
                {
                    gene: "Glyma.09G074200",
                    correlation: 0.65,
                    evidence: "RNA-seq co-expression"
                }
            ],

            interaction: [
                {
                    gene: "Glyma.09G073700",
                    correlation: 0.91,
                    evidence: "Gene–gene interaction"
                },
                {
                    gene: "Glyma.09G073800",
                    correlation: 0.86,
                    evidence: "Gene–gene interaction"
                },
                {
                    gene: "Glyma.09G074000",
                    correlation: 0.77,
                    evidence: "Gene–gene interaction"
                }
            ],

            regulation: [
                {
                    gene: "Glyma.09G073700",
                    correlation: 0.91,
                    evidence: "TF → target relationship"
                },
                {
                    gene: "Glyma.09G073900",
                    correlation: 0.82,
                    evidence: "TF → target relationship"
                },
                {
                    gene: "Glyma.09G074100",
                    correlation: 0.71,
                    evidence: "TF → target relationship"
                }
            ]
        }
    };


    /* =========================================================
       DOM ELEMENTS
       ========================================================= */

    const geneInput = document.getElementById("geneInput");
    const networkType = document.getElementById("networkType");
    const correlationThreshold =
        document.getElementById("correlationThreshold");

    const buildButton = document.getElementById("buildNetwork");
    const clearButton = document.getElementById("clearNetwork");

    const resultsSection = document.getElementById("networkResults");
    const statusMessage = document.getElementById("networkStatus");

    const queryGeneElement = document.getElementById("queryGene");
    const selectedNetworkElement =
        document.getElementById("selectedNetwork");

    const nodeCountElement = document.getElementById("nodeCount");
    const connectionCountElement =
        document.getElementById("connectionCount");

    const connectedGenesElement =
        document.getElementById("connectedGenes");

    const degreeElement = document.getElementById("degree");
    const averageCorrelationElement =
        document.getElementById("averageCorrelation");

    const densityElement =
        document.getElementById("networkDensity");

    const hubCandidatesElement =
        document.getElementById("hubCandidates");

    const networkCanvas =
        document.getElementById("networkCanvas");



    /* =========================================================
       MULTI-GENE / CANDIDATE SET CONTROLS
       ========================================================= */

    function createCandidateSetControls() {

        if (
            document.getElementById(
                "candidateSetPanel"
            )
        ) {
            return;
        }


        if (!buildButton || !buildButton.parentElement) {
            return;
        }


        const panel =
            document.createElement("div");

        panel.id =
            "candidateSetPanel";

        panel.className =
            "candidate-set-panel";


        panel.innerHTML = `

            <div class="candidate-set-header">

                <div>

                    <span class="network-eyebrow">
                        MULTI-GENE ANALYSIS
                    </span>

                    <h3>
                        Candidate Gene Set Network
                    </h3>

                    <p>
                        Analyze multiple candidate genes together
                        and visualize relationships among the
                        candidate set and associated genes.
                    </p>

                </div>

            </div>


            <div class="candidate-mode-row">

                <label>
                    <span>Analysis Mode</span>

                    <select id="networkAnalysisMode">

                        <option value="single">
                            Single Gene Network
                        </option>

                        <option value="candidate">
                            Candidate Gene Set
                        </option>

                    </select>

                </label>

            </div>


            <div
                id="candidateGeneInputArea"
                class="candidate-gene-input-area"
                style="display:none;"
            >

                <label>

                    <span>
                        Candidate Gene IDs
                    </span>

                    <textarea
                        id="candidateGeneInput"
                        rows="7"
                        placeholder="Enter one Wm82.a6 gene ID per line

Example:
Glyma.09G073600
Glyma.09G073700
Glyma.09G073800
Glyma.09G073900"
                    ></textarea>

                </label>


                <div class="candidate-input-footer">

                    <span id="candidateGeneCount">
                        0 candidate genes
                    </span>

                    <span>
                        Maximum 100 genes
                    </span>

                </div>

            </div>


            <div
                id="candidateDisplayOptions"
                class="candidate-display-options"
                style="display:none;"
            >

                <label>

                    <span>
                        Display
                    </span>

                    <select id="candidateDisplayLimit">

                        <option value="10">
                            Top 10 partners
                        </option>

                        <option value="25">
                            Top 25 partners
                        </option>

                        <option value="50" selected>
                            Top 50 partners
                        </option>

                        <option value="100">
                            Top 100 partners
                        </option>

                        <option value="all">
                            All available
                        </option>

                    </select>

                </label>


                <label>

                    <span>
                        Node Size
                    </span>

                    <select id="candidateNodeSizing">

                        <option value="connectivity" selected>
                            By Connectivity
                        </option>

                        <option value="uniform">
                            Uniform
                        </option>

                    </select>

                </label>

            </div>


            <div
                id="candidateSetActions"
                style="display:none;"
            >

                <button
                    type="button"
                    class="candidate-analyze-button"
                    id="analyzeCandidateSet"
                >
                    Analyze Candidate Gene Set
                </button>

                <button
                    type="button"
                    class="candidate-clear-button"
                    id="clearCandidateSet"
                >
                    Clear Candidates
                </button>

            </div>

        `;


        /*
         * Put candidate controls directly before
         * the existing Build Network button.
         */

        buildButton.parentElement.insertBefore(
            panel,
            buildButton
        );


        const modeSelect =
            document.getElementById(
                "networkAnalysisMode"
            );

        const candidateArea =
            document.getElementById(
                "candidateGeneInputArea"
            );

        const displayOptions =
            document.getElementById(
                "candidateDisplayOptions"
            );

        const actions =
            document.getElementById(
                "candidateSetActions"
            );


        function updateCandidateMode() {

            const candidateMode =
                modeSelect.value === "candidate";


            candidateArea.style.display =
                candidateMode
                    ? "block"
                    : "none";


            displayOptions.style.display =
                candidateMode
                    ? "grid"
                    : "none";


            actions.style.display =
                candidateMode
                    ? "flex"
                    : "none";


            if (candidateMode) {

                /*
                 * Keep the original single-gene
                 * controls available, but the user
                 * will use the candidate-set button.
                 */

                showStatus(
                    "Enter your candidate genes and select Analyze Candidate Gene Set."
                );

            }

        }


        modeSelect.addEventListener(
            "change",
            updateCandidateMode
        );


        const textarea =
            document.getElementById(
                "candidateGeneInput"
            );


        textarea.addEventListener(
            "input",
            updateCandidateCount
        );


        document
            .getElementById(
                "analyzeCandidateSet"
            )
            .addEventListener(
                "click",
                analyzeCandidateGeneSet
            );


        document
            .getElementById(
                "clearCandidateSet"
            )
            .addEventListener(
                "click",
                clearCandidateGeneSet
            );


        updateCandidateMode();

    }


    /* =========================================================
       PARSE CANDIDATE GENES
       ========================================================= */

    function getCandidateGenes() {

        const textarea =
            document.getElementById(
                "candidateGeneInput"
            );

        if (!textarea) {
            return [];
        }


        const genes =
            textarea.value
                .split(/[\n,\t; ]+/)
                .map(
                    function(gene) {
                        return gene.trim();
                    }
                )
                .filter(Boolean)
                .map(normalizeGene);


        /*
         * Remove duplicates.
         */

        return [
            ...new Set(genes)
        ].slice(0, 100);

    }


    function updateCandidateCount() {

        const genes =
            getCandidateGenes();

        const counter =
            document.getElementById(
                "candidateGeneCount"
            );

        if (counter) {

            counter.textContent =
                genes.length +
                (
                    genes.length === 1
                        ? " candidate gene"
                        : " candidate genes"
                );

        }

    }


    /* =========================================================
       CANDIDATE GENE SET NETWORK
       ========================================================= */

    function analyzeCandidateGeneSet() {

        const genes =
            getCandidateGenes();


        if (!genes.length) {

            showStatus(
                "Please enter at least one candidate gene.",
                "error"
            );

            return;
        }


        if (genes.length > 100) {

            showStatus(
                "Please limit the candidate set to 100 genes.",
                "error"
            );

            return;
        }


        showStatus(
            "Building candidate gene set network...",
            "loading"
        );

        /*
         * IMPORTANT:
         * Make the results section visible BEFORE
         * Cytoscape measures the candidate network container.
         *
         * The single-gene workflow follows the same principle.
         */

        showResults();

        setTimeout(
            function() {

                buildCandidateSetNetwork(
                    genes
                );

            },
            350
        );

    }


    /* =========================================================
       BUILD CANDIDATE SET
       ========================================================= */

    function buildCandidateSetNetwork(
        genes
    ) {

        /*
         * Current demonstration mode:
         *
         * Candidate genes are represented as primary nodes.
         * Relationships between candidates are generated
         * only for visualization until the real Wm82.a6
         * expression matrix is connected.
         *
         * These relationships must NOT be interpreted as
         * biological evidence.
         */


        const threshold =
            correlationThreshold
                ? parseFloat(
                    correlationThreshold.value
                )
                : 0.70;


        const candidateNodes =
            genes.map(
                function(gene) {

                    return {
                        data: {
                            id: gene,
                            label: gene,
                            type: "candidate",
                            degree: 0
                        }
                    };

                }
            );


        const candidateEdges =
            edges.filter(
                function(edge) {

                    return (
                        edge.data.source &&
                        edge.data.target &&
                        candidateGenes.includes(
                            edge.data.source
                        ) &&
                        candidateGenes.includes(
                            edge.data.target
                        )
                    );

                }
            );

        /*
         * Maximum possible pairwise relationships.
         */

        const possiblePairs =
            genes.length > 1
                ? (
                    genes.length *
                    (genes.length - 1)
                ) / 2
                : 0;

        const density =
            possiblePairs
                ? candidateEdges.length /
                  possiblePairs
                : 0;

        /*
         * Average demonstration relationship.
         */

        const weights =
            candidateEdges
                .map(
                    function(edge) {
                        return Number(
                            edge.data.correlation ||
                            edge.data.weight ||
                            0
                        );
                    }
                )
                .filter(
                    function(value) {
                        return Number.isFinite(value);
                    }
                );

        const average =
            weights.length
                ? weights.reduce(
                    function(a, b) {
                        return a + b;
                    },
                    0
                ) / weights.length
                : 0;

        /*
         * Strongest candidate pair.
         */

        let strongest =
            null;

        candidateEdges.forEach(
            function(edge) {

                const value =
                    Number(
                        edge.data.correlation ||
                        edge.data.weight ||
                        0
                    );

                if (
                    !strongest ||
                    value > strongest.value
                ) {

                    strongest = {
                        source:
                            edge.data.source,

                        target:
                            edge.data.target,

                        value:
                            value
                    };

                }

            }
        );

        /*
         * Candidate degree ranking.
         */

        const rankedCandidates =
            candidateNodes
                .slice()
                .sort(
                    function(a, b) {

                        return (
                            Number(
                                b.data.degree || 0
                            ) -
                            Number(
                                a.data.degree || 0
                            )
                        );

                    }
                );

        /*
         * Create readable candidate table.
         */

        let tableRows = "";

        rankedCandidates.forEach(
            function(node, index) {

                const degree =
                    Number(
                        node.data.degree || 0
                    );

                const possible =
                    Math.max(
                        1,
                        genes.length - 1
                    );

                const connectivity =
                    (
                        degree /
                        possible
                    ) * 100;

                tableRows += `

                    <tr>

                        <td>
                            ${index + 1}
                        </td>

                        <td>
                            <strong>
                                ${node.data.label}
                            </strong>
                        </td>

                        <td>
                            ${degree}
                        </td>

                        <td>
                            ${connectivity.toFixed(0)}%
                        </td>

                        <td>
                            Candidate gene
                        </td>

                    </tr>

                `;

            }
        );

        /*
         * Strongest pair text.
         */

        let strongestHTML =
            "No candidate-to-candidate relationship was detected.";

        if (strongest) {

            strongestHTML = `

                <strong>
                    ${strongest.source}
                </strong>

                <span class="candidate-pair-arrow">
                    ↔
                </span>

                <strong>
                    ${strongest.target}
                </strong>

                <span class="candidate-pair-value">
                    ${strongest.value.toFixed(2)}
                </span>

            `;

        }

        /*
         * Network interpretation.
         */

        let densityInterpretation =
            "No pairwise candidate relationships were detected.";

        if (
            candidateEdges.length ===
            possiblePairs &&
            possiblePairs > 0
        ) {

            densityInterpretation =
                "Every possible candidate-gene pair is connected in this demonstration network.";

        } else if (density >= 0.5) {

            densityInterpretation =
                "More than half of the possible candidate-gene pairs are connected in this network.";

        } else if (density > 0) {

            densityInterpretation =
                "Only a subset of the possible candidate-gene pairs are connected.";

        }

        summary.innerHTML = `

            <div class="candidate-interpretation-header">

                <div>

                    <span class="network-eyebrow">
                        CANDIDATE GENE SET RESULTS
                    </span>

                    <h2>
                        How to Read This Candidate Network
                    </h2>

                    <p class="candidate-interpretation-lead">
                        This view evaluates the submitted genes as a group.
                        Dark nodes are the genes you entered. Lines represent
                        relationships included by the selected network settings.
                    </p>

                </div>

            </div>


            <div class="candidate-stat-grid">

                <div class="candidate-stat-card">

                    <span>
                        Candidate genes
                    </span>

                    <strong>
                        ${genes.length}
                    </strong>

                    <small>
                        genes submitted for analysis
                    </small>

                </div>


                <div class="candidate-stat-card">

                    <span>
                        Candidate pairs
                    </span>

                    <strong>
                        ${candidateEdges.length}
                    </strong>

                    <small>
                        pairwise relationships shown
                    </small>

                </div>


                <div class="candidate-stat-card">

                    <span>
                        Possible pairs
                    </span>

                    <strong>
                        ${possiblePairs}
                    </strong>

                    <small>
                        maximum for this candidate set
                    </small>

                </div>


                <div class="candidate-stat-card">

                    <span>
                        Network density
                    </span>

                    <strong>
                        ${(density * 100).toFixed(0)}%
                    </strong>

                    <small>
                        connected candidate pairs
                    </small>

                </div>

            </div>


            <div class="candidate-reading-grid">

                <article class="candidate-reading-card">

                    <div class="candidate-reading-number">
                        1
                    </div>

                    <div>

                        <h3>
                            Start with the dark nodes
                        </h3>

                        <p>
                            Dark green nodes are the candidate genes
                            submitted by the researcher. Their size reflects
                            the number of displayed connections when
                            <strong>By Connectivity</strong> is selected.
                        </p>

                    </div>

                </article>


                <article class="candidate-reading-card">

                    <div class="candidate-reading-number">
                        2
                    </div>

                    <div>

                        <h3>
                            Follow the connecting lines
                        </h3>

                        <p>
                            Each line represents a relationship included in
                            the current network. Thicker lines indicate a
                            stronger relationship value in the current
                            demonstration network.
                        </p>

                    </div>

                </article>


                <article class="candidate-reading-card">

                    <div class="candidate-reading-number">
                        3
                    </div>

                    <div>

                        <h3>
                            Look for shared connectivity
                        </h3>

                        <p>
                            A candidate connected to many other candidates
                            has a higher network degree. Such connectivity
                            can be used to prioritize genes for further
                            biological investigation once real evidence is
                            connected.
                        </p>

                    </div>

                </article>


                <article class="candidate-reading-card">

                    <div class="candidate-reading-number">
                        4
                    </div>

                    <div>

                        <h3>
                            Do not interpret an edge by itself
                        </h3>

                        <p>
                            A network relationship does not automatically
                            mean physical interaction, regulation, or a
                            causal biological relationship. The evidence
                            source must be considered.
                        </p>

                    </div>

                </article>

            </div>


            <div class="candidate-density-box">

                <div>

                    <span class="candidate-box-label">
                        NETWORK STRUCTURE
                    </span>

                    <h3>
                        ${densityInterpretation}
                    </h3>

                </div>

                <div class="candidate-density-number">
                    ${(density * 100).toFixed(0)}%
                </div>

            </div>


            <div class="candidate-table-section">

                <div class="candidate-section-heading">

                    <div>

                        <span class="network-eyebrow">
                            CANDIDATE CONNECTIVITY
                        </span>

                        <h3>
                            Candidate Gene Connectivity
                        </h3>

                    </div>

                    <span class="candidate-section-note">
                        Based on displayed network edges
                    </span>

                </div>


                <div class="candidate-table-wrap">

                    <table class="candidate-connectivity-table">

                        <thead>

                            <tr>

                                <th>
                                    Rank
                                </th>

                                <th>
                                    Candidate gene
                                </th>

                                <th>
                                    Connections
                                </th>

                                <th>
                                    Candidate connectivity
                                </th>

                                <th>
                                    Role
                                </th>

                            </tr>

                        </thead>

                        <tbody>

                            ${tableRows}

                        </tbody>

                    </table>

                </div>

            </div>


            <div class="candidate-strongest-box">

                  <span class="candidate-box-label">
                      NETWORK STRUCTURE NOTE
                  </span>

                  <div class="candidate-strongest-pair">
                      The displayed connections describe the structure of
                      the current candidate-gene network. Because this
                      version uses demonstration relationships, no pair
                      should be interpreted as the strongest biological
                      interaction or as a validated gene-gene relationship.
                  </div>

              </div>


            <div class="candidate-scientific-warning">

                <div class="candidate-warning-icon">
                    !
                </div>

                <div>

                    <h3>
                        Important: demonstration network
                    </h3>

                    <p>
                        The current Candidate Gene Set visualization uses
                        demonstration relationships so that the interface
                        can be tested. The displayed correlation values,
                        density, strongest pair, and connectivity are
                        <strong>not biological findings</strong>.
                    </p>

                    <p>
                        In the final Wm82.a6 implementation, these
                        relationships should be calculated from the
                        underlying expression/network evidence. Only then
                        should correlation strength, hub status, shared
                        partners, and biological interpretation be used for
                        scientific conclusions.
                    </p>

                </div>

            </div>

        `;


        /*
         * Put the candidate interpretation immediately
         * after the network visualization.
         */

        if (networkCanvas && networkCanvas.parentElement) {

            networkCanvas.parentElement.appendChild(
                summary
            );

        }


        /*
         * Remove the generic single-gene connection
         * explanation if it exists.
         */

        const genericConnection =
            document.getElementById(
                "connectionExplanation"
            );

        if (genericConnection) {
            genericConnection.remove();
        }

    }


    /* =========================================================
       CLEAR CANDIDATE SET
       ========================================================= */

    function clearCandidateGeneSet() {

        const textarea =
            document.getElementById(
                "candidateGeneInput"
            );

        if (textarea) {
            textarea.value = "";
        }


        updateCandidateCount();


        const mode =
            document.getElementById(
                "networkAnalysisMode"
            );

        if (mode) {
            mode.value = "single";
        }


        const area =
            document.getElementById(
                "candidateGeneInputArea"
            );

        const options =
            document.getElementById(
                "candidateDisplayOptions"
            );

        const actions =
            document.getElementById(
                "candidateSetActions"
            );


        if (area) {
            area.style.display = "none";
        }

        if (options) {
            options.style.display = "none";
        }

        if (actions) {
            actions.style.display = "none";
        }


        const summary =
            document.getElementById(
                "candidateNetworkSummary"
            );

        if (summary) {
            summary.remove();
        }


        hideResults();


        showStatus(
            "Enter a Wm82.a6 gene ID to begin network analysis."
        );

    }


    /* =========================================================
       HELPER FUNCTIONS
       ========================================================= */

    function normalizeGene(gene) {
        return gene.trim().toUpperCase();
    }


    function showStatus(message, type) {

        if (!statusMessage) return;

        statusMessage.textContent = message;

        statusMessage.className = "network-status";

        if (type) {
            statusMessage.classList.add(type);
        }
    }


    function hideResults() {

        if (resultsSection) {
            resultsSection.style.display = "none";
        }

    }


    function showResults() {

        if (resultsSection) {
            resultsSection.style.display = "block";
        }

    }


    function getNetworkData(gene, type) {

        const matchingKey = Object.keys(NETWORK_DATA).find(
            function (key) {
                return key.toUpperCase() === gene.toUpperCase();
            }
        );

        if (!matchingKey) {
            return null;
        }

        const data = NETWORK_DATA[matchingKey];

        if (type === "expression") {
            return data.expression;
        }

        if (type === "interaction") {
            return data.interaction;
        }

        if (type === "regulation") {
            return data.regulation;
        }

        if (type === "hub") {
            return data.expression;
        }

        return data.expression;
    }


    function getNetworkTypeLabel(type) {

        const labels = {
            expression: "Co-expression Network",
            interaction: "Gene–Gene Interaction",
            regulation: "Gene Regulatory Network",
            hub: "Hub Gene Analysis"
        };

        return labels[type] || "Network Analysis";
    }


    /* =========================================================
       NETWORK VISUALIZATION
       ========================================================= */

    function drawNetwork(gene, connections) {

        if (!networkCanvas) return;

        networkCanvas.innerHTML = "";

        /*
         * Cytoscape-style biological network.
         *
         * Query gene = central node
         * Connected genes = surrounding nodes
         * Node size = connectivity
         * Edge thickness = correlation strength
         *
         * NOTE:
         * Current relationships are demonstration data.
         * Real Wm82.a6 network edges will be added later.
         */

        if (typeof cytoscape === "undefined") {

            networkCanvas.innerHTML = `
                <div class="network-library-error">
                    <strong>Network visualization library not loaded.</strong>
                    <p>Please check that Cytoscape.js is available.</p>
                </div>
            `;

            return;
        }


        /* -----------------------------------------------------
           Visualization container
           ----------------------------------------------------- */

        const cyContainer =
            document.createElement("div");

        cyContainer.id = "cyNetwork";

        networkCanvas.appendChild(
            cyContainer
        );


        /* -----------------------------------------------------
           Create nodes
           ----------------------------------------------------- */

        const nodeMap = {};

        nodeMap[gene] = {
            data: {
                id: gene,
                label: gene,
                type: "query",
                degree: connections.length
            }
        };


        connections.forEach(function (item) {

            nodeMap[item.gene] = {
                data: {
                    id: item.gene,
                    label: item.gene,
                    type: "connected",
                    correlation: item.correlation,
                    evidence: item.evidence,
                    degree: 1
                }
            };

        });


        /* -----------------------------------------------------
           Create query → gene edges
           ----------------------------------------------------- */

        const edges = [];

        connections.forEach(function (item, index) {

            edges.push({
                data: {
                    id: "query_edge_" + index,
                    source: gene,
                    target: item.gene,
                    weight: item.correlation,
                    correlation: item.correlation,
                    evidence: item.evidence
                }
            });

        });


        /* -----------------------------------------------------
           Add additional network connections.

           These create the dense network appearance for testing.
           They will later be replaced with real Wm82.a6
           co-expression relationships.
           ----------------------------------------------------- */

        for (
            let i = 0;
            i < connections.length;
            i++
        ) {

            for (
                let j = i + 1;
                j < connections.length;
                j++
            ) {

                /*
                 * Only connect selected pairs so the graph
                 * remains readable.
                 */

                if ((i + j) % 2 === 0) {

                    const weight =
                        Math.min(
                            connections[i].correlation,
                            connections[j].correlation
                        ) * 0.85;


                    edges.push({

                        data: {

                            id:
                                "network_edge_" +
                                i +
                                "_" +
                                j,

                            source:
                                connections[i].gene,

                            target:
                                connections[j].gene,

                            weight:
                                weight,

                            correlation:
                                weight,

                            evidence:
                                "Network association"

                        }

                    });


                    /*
                     * Increase apparent connectivity.
                     */

                    nodeMap[
                        connections[i].gene
                    ].data.degree++;

                    nodeMap[
                        connections[j].gene
                    ].data.degree++;

                }

            }

        }


        const elements =
            Object.values(nodeMap).concat(edges);


        /* -----------------------------------------------------
           Create Cytoscape network
           ----------------------------------------------------- */

        const cy =
            cytoscape({

                container:
                    cyContainer,

                elements:
                    elements,

                style: [

                    {
                        selector: "node",

                        style: {

                            "background-color":
                                "#dcebe1",

                            "border-color":
                                "#4d765d",

                            "border-width":
                                3,

                            "width":
                                "mapData(degree, 1, 7, 34, 78)",

                            "height":
                                "mapData(degree, 1, 7, 34, 78)",

                            "label":
                                "data(label)",

                            "color":
                                "#183b28",

                            "font-size":
                                11,

                            "font-weight":
                                600,

                            "text-valign":
                                "bottom",

                            "text-halign":
                                "center",

                            "text-margin-y":
                                10,

                            "text-wrap":
                                "none",

                            "text-max-width":
                                180,

                            "text-overflow-wrap":
                                "none",

                            "overlay-opacity":
                                0

                        }

                    },


                    {
                        selector:
                            'node[type="query"]',

                        style: {

                            "background-color":
                                "#2f6847",

                            "border-color":
                                "#173d27",

                            "border-width":
                                5,

                            "color":
                                "#183b28",

                            "font-size":
                                11,

                            "font-weight":
                                700,

                            "text-valign":
                                "bottom",

                            "text-halign":
                                "center",

                            "text-margin-y":
                                10,

                            "text-wrap":
                                "none",

                            "text-max-width":
                                180,

                            "text-overflow-wrap":
                                "none",

                            "width":
                                88,

                            "height":
                                88

                        }

                    },


                    {
                        selector: "edge",

                        style: {

                            "line-color":
                                "#789889",

                            "width":
                                "mapData(weight, 0.5, 1, 1.5, 6)",

                            "opacity":
                                0.65,

                            "curve-style":
                                "bezier",

                            "target-arrow-shape":
                                "none"

                        }

                    },


                    {
                        selector:
                            'edge[evidence = "Network association"]',

                        style: {

                            "line-color":
                                "#a3b1a8",

                            "width":
                                1.5,

                            "opacity":
                                0.48

                        }

                    },


                    {
                        selector:
                            "node:selected",

                        style: {

                            "border-color":
                                "#168046",

                            "border-width":
                                6,

                            "overlay-color":
                                "#7eae8d",

                            "overlay-opacity":
                                0.15

                        }

                    }

                ],


                layout: {

                    name:
                        "cose",

                    animate:
                        true,

                    animationDuration:
                        900,

                    fit:
                        true,

                    padding:
                        65,

                    nodeRepulsion:
                        10000,

                    idealEdgeLength:
                        155,

                    edgeElasticity:
                        0.25,

                    gravity:
                        0.7,

                    numIter:
                        1200

                },

                minZoom:
                    0.25,

                maxZoom:
                    3

            });


        /* -----------------------------------------------------
           Controls
           ----------------------------------------------------- */

        const controls =
            document.createElement("div");

        controls.className =
            "network-controls-overlay";

        controls.innerHTML = `

            <button
                type="button"
                class="network-mini-button"
                id="networkFitButton">
                Fit Network
            </button>

            <button
                type="button"
                class="network-mini-button"
                id="networkResetButton">
                Reset Layout
            </button>

        `;

        networkCanvas.appendChild(
            controls
        );


        document
            .getElementById("networkFitButton")
            .addEventListener(
                "click",
                function () {

                    cy.fit(
                        cy.elements(),
                        65
                    );

                }
            );


        document
            .getElementById("networkResetButton")
            .addEventListener(
                "click",
                function () {

                    cy.layout({

                        name:
                            "cose",

                        animate:
                            true,

                        animationDuration:
                            900,

                        fit:
                            true,

                        padding:
                            65,

                        nodeRepulsion:
                            10000,

                        idealEdgeLength:
                            155,

                        edgeElasticity:
                            0.25,

                        gravity:
                            0.7,

                        numIter:
                            1200

                    }).run();

                }
            );


        /* -----------------------------------------------------
           Legend
           ----------------------------------------------------- */

        const legend =
            document.createElement("div");

        legend.className =
            "network-cytoscape-legend";

        legend.innerHTML = `

            <div class="network-cytoscape-legend-title">
                Network interpretation
            </div>

            <div class="network-legend-row">
                <span
                    class="network-legend-dot"
                    style="
                        background:#2f6847;
                        border:2px solid #173d27;
                    ">
                </span>
                Query gene
            </div>

            <div class="network-legend-row">
                <span
                    class="network-legend-dot"
                    style="
                        background:#dcebe1;
                        border:2px solid #4d765d;
                    ">
                </span>
                Connected gene
            </div>

            <div class="network-legend-row">
                <span class="network-legend-line"></span>
                Gene relationship
            </div>

            <div class="network-legend-row">
                Larger node = higher connectivity
            </div>

        `;

        networkCanvas.appendChild(
            legend
        );


        /* -----------------------------------------------------
           Node click
           ----------------------------------------------------- */

        cy.on(
            "tap",
            "node",
            function (event) {

                const node =
                    event.target;


                if (
                    node.data("type") ===
                    "query"
                ) {

                    showConnectionExplanation(

                        gene,

                        {
                            gene:
                                gene,

                            correlation:
                                1,

                            evidence:
                                "Query gene"
                        }

                    );

                    return;
                }


                showConnectionExplanation(

                    gene,

                    {
                        gene:
                            node.data("label"),

                        correlation:
                            node.data("correlation") ||
                            0,

                        evidence:
                            node.data("evidence") ||
                            "Network association"
                    }

                );

            }
        );


        /* -----------------------------------------------------
           Mouse-over information
           ----------------------------------------------------- */

        cy.on(
            "mouseover",
            "node",
            function (event) {

                const node =
                    event.target;

                const oldTooltip =
                    document.getElementById(
                        "activeNetworkTooltip"
                    );

                if (oldTooltip) {
                    oldTooltip.remove();
                }


                const tooltip =
                    document.createElement(
                        "div"
                    );

                tooltip.id =
                    "activeNetworkTooltip";

                tooltip.className =
                    "network-node-tooltip";

                tooltip.innerHTML = `

                    <strong>
                        ${node.data("label")}
                    </strong>

                    <span>
                        Connectivity:
                        ${node.data("degree") || 0}
                    </span>

                    ${
                        node.data("correlation")
                            ? `
                            <span>
                                Correlation:
                                r = ${Number(
                                    node.data("correlation")
                                ).toFixed(2)}
                            </span>
                            `
                            : ""
                    }

                    ${
                        node.data("evidence")
                            ? `
                            <span>
                                Evidence:
                                ${node.data("evidence")}
                            </span>
                            `
                            : ""
                    }

                `;


                networkCanvas.appendChild(
                    tooltip
                );


                const pos =
                    node.renderedPosition();


                tooltip.style.left =
                    (pos.x + 15) + "px";

                tooltip.style.top =
                    (pos.y + 15) + "px";

                tooltip.style.display =
                    "block";

            }
        );


        cy.on(
            "mouseout",
            "node",
            function () {

                const tooltip =
                    document.getElementById(
                        "activeNetworkTooltip"
                    );

                if (tooltip) {
                    tooltip.remove();
                }

            }
        );



        /* -----------------------------------------------------
           NODE APPEARANCE CONTROLS
           ----------------------------------------------------- */

        const appearanceControls =
            document.createElement("div");

        appearanceControls.className =
            "network-appearance-controls";

        appearanceControls.innerHTML = `

            <div class="network-appearance-title">
                Network Appearance
            </div>

            <label>
                <span>Node Shape</span>

                <select id="networkNodeShape">
                    <option value="ellipse">Circle</option>
                    <option value="roundrectangle">
                        Rounded Rectangle
                    </option>
                    <option value="rectangle">
                        Rectangle
                    </option>
                    <option value="diamond">
                        Diamond
                    </option>
                    <option value="hexagon">
                        Hexagon
                    </option>
                    <option value="triangle">
                        Triangle
                    </option>
                </select>
            </label>

            <label>
                <span>Node Size</span>

                <select id="networkNodeSize">
                    <option value="small">
                        Small
                    </option>

                    <option value="medium" selected>
                        Medium
                    </option>

                    <option value="large">
                        Large
                    </option>

                    <option value="connectivity">
                        By Connectivity
                    </option>
                </select>
            </label>

            <label>
                <span>Gene Label</span>

                <select id="networkLabelPosition">
                    <option value="outside" selected>
                        Outside Node
                    </option>

                    <option value="inside">
                        Inside Node
                    </option>
                </select>
            </label>

        `;

        networkCanvas.appendChild(
            appearanceControls
        );


        /*
         * Node shape control.
         */

        const shapeSelect =
            document.getElementById(
                "networkNodeShape"
            );


        shapeSelect.addEventListener(
            "change",
            function () {

                cy.nodes().style(
                    "shape",
                    shapeSelect.value
                );

            }
        );


        /*
         * Node size control.
         */

        const sizeSelect =
            document.getElementById(
                "networkNodeSize"
            );


        sizeSelect.addEventListener(
            "change",
            function () {

                const value =
                    sizeSelect.value;


                if (value === "small") {

                    cy.nodes().style(
                        "width",
                        42
                    );

                    cy.nodes().style(
                        "height",
                        42
                    );

                }


                if (value === "medium") {

                    cy.nodes().style(
                        "width",
                        58
                    );

                    cy.nodes().style(
                        "height",
                        58
                    );

                }


                if (value === "large") {

                    cy.nodes().style(
                        "width",
                        82
                    );

                    cy.nodes().style(
                        "height",
                        82
                    );

                }


                if (value === "connectivity") {

                    cy.nodes().forEach(
                        function (node) {

                            const degree =
                                node.data(
                                    "degree"
                                ) || 1;


                            const size =
                                Math.min(
                                    100,
                                    Math.max(
                                        38,
                                        32 +
                                        degree * 10
                                    )
                                );


                            node.style(
                                "width",
                                size
                            );

                            node.style(
                                "height",
                                size
                            );

                        }
                    );

                }

            }
        );


        /*
         * Gene label position.
         */

        const labelPositionSelect =
            document.getElementById(
                "networkLabelPosition"
            );


        labelPositionSelect.addEventListener(
            "change",
            function () {

                if (
                    labelPositionSelect.value ===
                    "outside"
                ) {

                    cy.nodes().style({

                        "text-valign":
                            "bottom",

                        "text-halign":
                            "center",

                        "text-margin-y":
                            10,

                        "text-wrap":
                            "none",

                        "text-max-width":
                            180

                    });

                } else {

                    cy.nodes().style({

                        "text-valign":
                            "center",

                        "text-halign":
                            "center",

                        "text-margin-y":
                            0,

                        "text-wrap":
                            "wrap",

                        "text-max-width":
                            90

                    });

                }

            }
        );


        /*
         * Add detailed network interpretation.
         */

        renderNetworkInterpretation(
            gene,
            connections
        );


        /*
         * Store the Cytoscape instance.
         */

        window.currentSoybeanNetwork =
            cy;

    }


    /* =========================================================
       CONNECTION EXPLANATION
       ========================================================= */

    function showConnectionExplanation(
        queryGene,
        connection
    ) {

        let panel =
            document.getElementById(
                "connectionExplanation"
            );


        if (!panel) {

            panel =
                document.createElement(
                    "div"
                );

            panel.id =
                "connectionExplanation";

            panel.className =
                "connection-explanation";


            if (
                networkCanvas &&
                networkCanvas.parentElement
            ) {

                networkCanvas.parentElement
                    .appendChild(panel);

            }

        }


        const evidence =
            connection.evidence ||
            "Network association";


        let explanation;


        if (
            evidence
                .toLowerCase()
                .includes("co-expression")
        ) {

            explanation =
                "The genes show similar expression " +
                "patterns across the analyzed samples. " +
                "This is evidence of co-expression and " +
                "does not by itself establish direct " +
                "physical interaction or regulation.";

        } else if (
            evidence
                .toLowerCase()
                .includes("interaction")
        ) {

            explanation =
                "The genes are connected by gene–gene " +
                "interaction evidence. The biological " +
                "interpretation depends on the source " +
                "and evidence type supporting the interaction.";

        } else if (
            evidence
                .toLowerCase()
                .includes("tf")
        ) {

            explanation =
                "The connection represents a potential " +
                "transcription-factor regulatory relationship " +
                "between the regulator and target gene.";

        } else {

            explanation =
                "This connection represents an association " +
                "within the selected network. The exact " +
                "biological interpretation depends on the " +
                "underlying network evidence.";

        }


        panel.innerHTML = `

            <div class="connection-explanation-header">

                <div>

                    <span class="network-eyebrow">
                        CONNECTION EVIDENCE
                    </span>

                    <h3>
                        ${queryGene}
                        <span class="arrow">→</span>
                        ${connection.gene}
                    </h3>

                </div>

                <div class="connection-score">

                    <strong>
                        ${Number(
                            connection.correlation
                        ).toFixed(2)}
                    </strong>

                    <span>
                        correlation
                    </span>

                </div>

            </div>


            <div class="connection-evidence-badge">
                ${evidence}
            </div>


            <p>
                ${explanation}
            </p>


            <div class="connection-details">

                <div>
                    <span>Query gene</span>
                    <strong>
                        ${queryGene}
                    </strong>
                </div>

                <div>
                    <span>Connected gene</span>
                    <strong>
                        ${connection.gene}
                    </strong>
                </div>

                <div>
                    <span>Correlation</span>
                    <strong>
                        r =
                        ${Number(
                            connection.correlation
                        ).toFixed(2)}
                    </strong>
                </div>

                <div>
                    <span>Evidence</span>
                    <strong>
                        ${evidence}
                    </strong>
                </div>

            </div>

        `;

    }



    /* =========================================================
       DETAILED NETWORK INTERPRETATION
       ========================================================= */

    function renderNetworkInterpretation(
        gene,
        connections
    ) {

        const oldPanel =
            document.getElementById(
                "networkInterpretation"
            );

        if (oldPanel) {
            oldPanel.remove();
        }


        const panel =
            document.createElement("section");

        panel.id =
            "networkInterpretation";

        panel.className =
            "network-interpretation";


        const totalGenes =
            connections.length + 1;


        let averageCorrelation = 0;

        if (connections.length > 0) {

            const sum =
                connections.reduce(
                    function(total, item) {
                        return (
                            total +
                            Number(item.correlation)
                        );
                    },
                    0
                );

            averageCorrelation =
                sum / connections.length;
        }


        const strongest =
            connections.length > 0
                ? connections.slice().sort(
                    function(a, b) {
                        return (
                            Number(b.correlation) -
                            Number(a.correlation)
                        );
                    }
                )[0]
                : null;


        const topGenes =
            connections
                .slice()
                .sort(
                    function(a, b) {
                        return (
                            Number(b.correlation) -
                            Number(a.correlation)
                        );
                    }
                )
                .slice(0, 3);


        const topGeneText =
            topGenes.length > 0
                ? topGenes.map(
                    function(item) {
                        return item.gene;
                    }
                ).join(", ")
                : "None";


        panel.innerHTML = `

            <div class="interpretation-header">

                <span class="network-eyebrow">
                    HOW TO READ THIS NETWORK
                </span>

                <h2>
                    Understanding the Gene Relationships
                </h2>

                <p>
                    This network shows genes associated with
                    <strong>${gene}</strong> using the selected
                    network type and correlation threshold.
                    Each circle represents a gene and each line
                    represents a relationship between genes.
                </p>

            </div>


            <div class="network-reading-grid">

                <div class="reading-card">

                    <div class="reading-icon query-icon">
                        ●
                    </div>

                    <div>
                        <h3>Query Gene</h3>

                        <p>
                            The dark green node is the gene
                            you searched for:
                            <strong>${gene}</strong>.
                        </p>
                    </div>

                </div>


                <div class="reading-card">

                    <div class="reading-icon gene-icon">
                        ○
                    </div>

                    <div>
                        <h3>Connected Genes</h3>

                        <p>
                            These genes meet the selected
                            network criteria and are connected
                            to the query gene.
                        </p>
                    </div>

                </div>


                <div class="reading-card">

                    <div class="reading-icon edge-icon">
                        ━
                    </div>

                    <div>
                        <h3>Connecting Lines</h3>

                        <p>
                            Lines represent relationships.
                            Thicker lines indicate stronger
                            relationships in the current network.
                        </p>
                    </div>

                </div>


                <div class="reading-card">

                    <div class="reading-icon hub-icon">
                        ●
                    </div>

                    <div>
                        <h3>Hub Genes</h3>

                        <p>
                            Highly connected genes can act as
                            network hubs and may be useful for
                            further biological investigation.
                        </p>
                    </div>

                </div>

            </div>


            <div class="network-summary-explanation">

                <div class="summary-explanation-title">
                    NETWORK SUMMARY
                </div>

                <div class="summary-explanation-grid">

                    <div>
                        <span>Query gene</span>
                        <strong>${gene}</strong>
                    </div>

                    <div>
                        <span>Genes represented</span>
                        <strong>${totalGenes}</strong>
                    </div>

                    <div>
                        <span>Connections</span>
                        <strong>${connections.length}</strong>
                    </div>

                    <div>
                        <span>Average correlation</span>
                        <strong>
                            ${
                                averageCorrelation
                                    ? averageCorrelation.toFixed(2)
                                    : "—"
                            }
                        </strong>
                    </div>

                </div>

            </div>


            <div class="network-biological-interpretation">

                <div class="interpretation-column">

                    <span class="interpretation-label">
                        WHAT DOES THIS MEAN?
                    </span>

                    <p>
                        ${
                            connections.length
                                ? `
                                The genes shown in this network
                                have similar or related patterns
                                under the selected network criteria.
                                For a co-expression network,
                                the correlation describes how
                                similarly genes are expressed
                                across the analyzed samples.
                                `
                                : `
                                No genes meet the selected
                                threshold.
                                `
                        }
                    </p>

                </div>


                <div class="interpretation-column">

                    <span class="interpretation-label">
                        IMPORTANT SCIENTIFIC NOTE
                    </span>

                    <p>
                        A strong correlation indicates similar
                        expression patterns. It does
                        <strong>not</strong> by itself prove
                        direct physical interaction,
                        transcriptional regulation, or a
                        causal relationship between genes.
                    </p>

                </div>

            </div>


            ${
                strongest
                    ? `
                    <div class="strongest-connection">

                        <div>

                            <span class="interpretation-label">
                                STRONGEST CONNECTION
                            </span>

                            <h3>
                                ${gene}
                                <span>↔</span>
                                ${strongest.gene}
                            </h3>

                        </div>

                        <div class="strongest-score">

                            <strong>
                                r = ${Number(
                                    strongest.correlation
                                ).toFixed(2)}
                            </strong>

                            <span>
                                ${strongest.evidence}
                            </span>

                        </div>

                    </div>
                    `
                    : ""
            }


            <div class="hub-summary">

                <span class="interpretation-label">
                    HIGH-CORRELATION CANDIDATES
                </span>

                <p>
                    ${topGeneText}
                </p>

                <small>
                    These are candidates with the strongest
                    relationships in the current network.
                    Formal hub identification should use
                    network centrality measures when the
                    complete biological network is available.
                </small>

            </div>

        `;


        /*
         * Place the explanation immediately below
         * the graphical network.
         */

        if (
            networkCanvas &&
            networkCanvas.parentElement
        ) {

            networkCanvas.parentElement.appendChild(
                panel
            );

        }

    }



    function renderConnectedGenes(connections) {

        if (!connectedGenesElement) return;

        connectedGenesElement.innerHTML = "";

        if (!connections.length) {

            connectedGenesElement.innerHTML =
                '<p class="empty-message">' +
                'No connected genes meet the selected threshold.' +
                '</p>';

            return;
        }


        const table = document.createElement("table");

        table.className = "network-gene-table";


        table.innerHTML = `
            <thead>
                <tr>
                    <th>Gene</th>
                    <th>Relationship</th>
                    <th>Strength</th>
                    <th>Evidence</th>
                    <th>What it means</th>
                </tr>
            </thead>
            <tbody></tbody>
        `;


        const tbody = table.querySelector("tbody");


        connections.forEach(function (item) {

            const row = document.createElement("tr");

            let meaning =
                "Network association";

            if (
                item.evidence
                    .toLowerCase()
                    .includes("co-expression")
            ) {

                meaning =
                    "Similar expression patterns across the analyzed samples.";

            } else if (
                item.evidence
                    .toLowerCase()
                    .includes("interaction")
            ) {

                meaning =
                    "Supported gene–gene interaction evidence.";

            } else if (
                item.evidence
                    .toLowerCase()
                    .includes("tf")
            ) {

                meaning =
                    "Potential transcription-factor regulatory relationship.";

            }


            row.innerHTML = `
                <td>
                    <span class="gene-chip">
                        ${item.gene}
                    </span>
                </td>

                <td>
                    Co-expression
                </td>

                <td>
                    <strong>
                        r = ${item.correlation.toFixed(2)}
                    </strong>
                </td>

                <td>
                    ${item.evidence}
                </td>

                <td>
                    ${meaning}
                </td>
            `;

            tbody.appendChild(row);

        });


        connectedGenesElement.appendChild(table);

    }


    /* =========================================================
       NETWORK STATISTICS
       ========================================================= */

    function calculateStatistics(connections) {

        const degree = connections.length;

        let averageCorrelation = 0;

        if (degree > 0) {

            const sum = connections.reduce(
                function (total, item) {
                    return total + item.correlation;
                },
                0
            );

            averageCorrelation = sum / degree;
        }


        /*
         * For a simple star-style demonstration network:
         *
         * density = number of observed edges /
         *            possible edges
         */

        const nodes = degree + 1;

        let density = 0;

        if (nodes > 1) {

            const possibleEdges =
                (nodes * (nodes - 1)) / 2;

            density =
                degree / possibleEdges;
        }


        return {
            degree: degree,
            averageCorrelation: averageCorrelation,
            density: density
        };

    }


    /* =========================================================
       HUB CANDIDATES
       ========================================================= */

    function identifyHubCandidates(connections) {

        if (!connections.length) {
            return "None";
        }

        /*
         * Current demonstration:
         * genes with correlation >= 0.80
         * are reported as potential hub candidates.
         *
         * This will later be replaced by
         * network centrality calculations.
         */

        const hubs = connections
            .filter(function (item) {
                return item.correlation >= 0.80;
            })
            .map(function (item) {
                return item.gene;
            });


        if (!hubs.length) {
            return "None";
        }


        return hubs.join(", ");

    }


    /* =========================================================
       BUILD NETWORK
       ========================================================= */

    function buildNetwork() {

        const rawGene = geneInput
            ? geneInput.value
            : "";

        const gene = normalizeGene(rawGene);


        if (!gene) {

            showStatus(
                "Please enter a soybean gene ID.",
                "error"
            );

            hideResults();

            return;
        }


        const type =
            networkType
                ? networkType.value
                : "expression";


        const threshold =
            correlationThreshold
                ? parseFloat(correlationThreshold.value)
                : 0.70;


        showStatus(
            "Building network...",
            "loading"
        );


        /*
         * Small delay gives the interface a realistic
         * analysis response while keeping everything local.
         */

        setTimeout(function () {

            const network =
                getNetworkData(gene, type);


            if (!network) {

                showStatus(
                    "Gene not found in the current network dataset. " +
                    "Try Glyma.09G073600 for the demonstration network.",
                    "error"
                );

                hideResults();

                return;
            }


            const filtered =
                network.filter(function (item) {

                    return item.gene !== gene &&
                           item.correlation >= threshold;

                });


            const statistics =
                calculateStatistics(filtered);


            if (queryGeneElement) {
                queryGeneElement.textContent = gene;
            }


            if (selectedNetworkElement) {
                selectedNetworkElement.textContent =
                    getNetworkTypeLabel(type);
            }


            if (nodeCountElement) {
                nodeCountElement.textContent =
                    filtered.length + 1;
            }


            if (connectionCountElement) {
                connectionCountElement.textContent =
                    filtered.length;
            }


            if (degreeElement) {
                degreeElement.textContent =
                    statistics.degree;
            }


            if (averageCorrelationElement) {

                averageCorrelationElement.textContent =
                    statistics.averageCorrelation
                        ? statistics.averageCorrelation.toFixed(2)
                        : "—";
            }


            if (densityElement) {

                densityElement.textContent =
                    statistics.density
                        ? statistics.density.toFixed(3)
                        : "—";
            }


            if (hubCandidatesElement) {

                hubCandidatesElement.textContent =
                    identifyHubCandidates(filtered);
            }


            renderConnectedGenes(filtered);

            drawNetwork(gene, filtered);

            showResults();


            showStatus(
                "Network analysis completed successfully.",
                "success"
            );

        }, 350);

    }


    /* =========================================================
       CLEAR
       ========================================================= */

    function clearNetwork() {

        if (geneInput) {
            geneInput.value = "";
        }

        hideResults();

        if (networkCanvas) {
            networkCanvas.innerHTML = "";
        }

        if (connectedGenesElement) {
            connectedGenesElement.innerHTML = "";
        }

        showStatus(
            "Enter a Wm82.a6 gene ID to begin network analysis."
        );

    }


    /* =========================================================
       EVENT LISTENERS
       ========================================================= */

    if (buildButton) {

        buildButton.addEventListener(
            "click",
            buildNetwork
        );

    }


    if (clearButton) {

        clearButton.addEventListener(
            "click",
            clearNetwork
        );

    }


    if (geneInput) {

        geneInput.addEventListener(
            "keydown",
            function (event) {

                if (event.key === "Enter") {
                    buildNetwork();
                }

            }
        );

    }


    /* =========================================================
       INITIAL STATE
       ========================================================= */

    createCandidateSetControls();

    hideResults();

    showStatus(
        "Enter a Wm82.a6 gene ID to begin network analysis."
    );


})();

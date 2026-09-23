(() => {
    "use strict";

    const state = {
        file: null,
        genome: "a4",
        samples: [],
        variants: [],
        filteredVariants: []
    };

    const $ = (id) => document.getElementById(id);

    function showStatus(message, type = "") {
        const el = $("statusMessage");

        el.textContent = message;
        el.className = "status-message";

        if (type) {
            el.classList.add(type);
        }
    }

    function hideStatus() {
        $("statusMessage").className = "status-message hidden";
        $("statusMessage").textContent = "";
    }

    function validateInputs() {
        const file = $("vcfFile").files[0];

        if (!file) {
            throw new Error("Please upload a VCF or VCF.GZ genotype file.");
        }

        const chromosome = $("chromosome").value.trim();

        if (!chromosome) {
            throw new Error("Please enter a chromosome or contig.");
        }

        const start = Number($("startPosition").value);
        const end = Number($("endPosition").value);

        if (!Number.isInteger(start) || start < 1) {
            throw new Error("Please enter a valid start position.");
        }

        if (!Number.isInteger(end) || end < start) {
            throw new Error("Please enter a valid end position.");
        }

        const flanking = Number($("flanking").value || 0);

        if (!Number.isInteger(flanking) || flanking < 0) {
            throw new Error("Flanking region must be zero or a positive integer.");
        }

        return {
            file,
            chromosome,
            start: Math.max(1, start - flanking),
            end: end + flanking,
            genome: $("genomeVersion").value
        };
    }

    function decodeText(buffer) {
        return new TextDecoder("utf-8").decode(buffer);
    }

    async function readVcfText(file) {
        /*
         * Browser support for gzip decompression varies by environment.
         * Plain VCF is handled directly here. GZ support will use the
         * browser DecompressionStream when available.
         */

        const buffer = await file.arrayBuffer();

        const isGzip =
            file.name.toLowerCase().endsWith(".gz") ||
            new Uint8Array(buffer.slice(0, 2))[0] === 0x1f &&
            new Uint8Array(buffer.slice(0, 2))[1] === 0x8b;

        if (!isGzip) {
            return decodeText(buffer);
        }

        if (typeof DecompressionStream === "undefined") {
            throw new Error(
                "This browser does not support direct VCF.GZ decompression. " +
                "Please use a modern Chrome, Edge, or Firefox browser."
            );
        }

        const stream = new Blob([buffer])
            .stream()
            .pipeThrough(new DecompressionStream("gzip"));

        return await new Response(stream).text();
    }

    function parseGenotype(sampleValue, formatKeys) {
        const values = sampleValue.split(":");
        const result = {};

        formatKeys.forEach((key, index) => {
            result[key] = values[index] ?? ".";
        });

        const gt = result.GT || "./.";

        return {
            gt,
            ad: result.AD || ".",
            dp: result.DP || ".",
            gq: result.GQ || "."
        };
    }

    function genotypeClass(gt) {
        if (!gt || gt.includes(".")) {
            return "missing";
        }

        const alleles = gt.replace("|", "/").split("/");

        if (alleles.length !== 2) {
            return "other";
        }

        if (alleles[0] === "0" && alleles[1] === "0") {
            return "reference";
        }

        if (
            (alleles[0] === "1" && alleles[1] === "1")
        ) {
            return "alternate";
        }

        if (
            alleles.includes("1")
        ) {
            return "heterozygous";
        }

        return "other";
    }

    function parseVcf(text, chromosome, start, end) {
        const lines = text.split(/\r?\n/);

        let samples = [];
        const variants = [];

        for (const line of lines) {

            if (!line) {
                continue;
            }

            if (line.startsWith("#CHROM")) {

                const columns = line.split("\t");

                samples = columns.slice(9);

                continue;
            }

            if (line.startsWith("#")) {
                continue;
            }

            const columns = line.split("\t");

            if (columns.length < 10) {
                continue;
            }

            const [
                chrom,
                posText,
                id,
                ref,
                alt,
                qual,
                filter,
                info,
                format,
                ...sampleValues
            ] = columns;

            if (chrom !== chromosome) {
                continue;
            }

            const pos = Number(posText);

            if (!Number.isInteger(pos)) {
                continue;
            }

            if (pos < start || pos > end) {
                continue;
            }

            const formatKeys = format.split(":");

            const genotypes = sampleValues.map(
                (value) => parseGenotype(value, formatKeys)
            );

            let referenceCount = 0;
            let alternateCount = 0;
            let missingCount = 0;

            const carriers = [];

            genotypes.forEach((genotype, index) => {

                const classification = genotypeClass(genotype.gt);

                if (classification === "reference") {
                    referenceCount++;
                } else if (
                    classification === "alternate" ||
                    classification === "heterozygous"
                ) {
                    alternateCount++;

                    carriers.push({
                        accession: samples[index],
                        genotype: genotype.gt,
                        ad: genotype.ad,
                        dp: genotype.dp,
                        gq: genotype.gq
                    });

                } else if (classification === "missing") {
                    missingCount++;
                }

            });

            const called = referenceCount + alternateCount;

            const alleleFrequency =
                called > 0
                    ? alternateCount / called
                    : 0;

            variants.push({
                chrom,
                pos,
                id,
                ref,
                alt,
                qual,
                filter,
                info,
                format,
                referenceCount,
                alternateCount,
                missingCount,
                calledCount: called,
                alleleFrequency,
                carriers
            });
        }

        return {
            samples,
            variants
        };
    }

    function formatFrequency(value) {
        return `${(value * 100).toFixed(2)}%`;
    }

    function carrierHtml(carriers) {

        if (!carriers.length) {
            return "—";
        }

        return `
            <div class="carrier-list">
                ${carriers
                    .map((carrier) => escapeHtml(carrier.accession))
                    .join("<br>")}
            </div>
        `;
    }

    function escapeHtml(value) {

        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function renderSummary(params) {

        $("summaryGenome").textContent =
            `Wm82.${params.genome}`;

        $("summaryRegion").textContent =
            `${params.chromosome}:${params.start.toLocaleString()}–${params.end.toLocaleString()}`;

        $("summaryAccessions").textContent =
            state.samples.length;

        $("summaryVariants").textContent =
            state.variants.length;

        $("summarySection").classList.remove("hidden");
    }

    function renderVariantTable() {

        const tbody = $("variantTableBody");

        tbody.innerHTML = "";

        state.filteredVariants.forEach((variant) => {

            const row = document.createElement("tr");

            row.innerHTML = `
                <td>${escapeHtml(variant.pos.toLocaleString())}</td>

                <td>${escapeHtml(variant.ref)}</td>

                <td>${escapeHtml(variant.alt)}</td>

                <td>${variant.referenceCount}</td>

                <td>${variant.alternateCount}</td>

                <td>${variant.missingCount}</td>

                <td>${formatFrequency(variant.alleleFrequency)}</td>

                <td>${carrierHtml(variant.carriers)}</td>
            `;

            tbody.appendChild(row);
        });

        $("variantSection").classList.remove("hidden");
    }

    function renderAccessionTable() {

        const tbody = $("accessionTableBody");

        tbody.innerHTML = "";

        state.filteredVariants.forEach((variant) => {

            variant.carriers.forEach((carrier) => {

                const row = document.createElement("tr");

                row.innerHTML = `
                    <td>
                        ${escapeHtml(variant.chrom)}:${escapeHtml(variant.pos)}
                        ${escapeHtml(variant.ref)}→${escapeHtml(variant.alt)}
                    </td>

                    <td>${escapeHtml(carrier.accession)}</td>

                    <td>${escapeHtml(carrier.genotype)}</td>

                    <td>${escapeHtml(carrier.ad)}</td>

                    <td>${escapeHtml(carrier.dp)}</td>

                    <td>${escapeHtml(carrier.gq)}</td>
                `;

                tbody.appendChild(row);
            });
        });

        $("accessionSection").classList.remove("hidden");
    }

    function renderProteinPlaceholder() {

        const genome = $("genomeVersion").value;

        $("proteinStatus").textContent =
            `The variant extraction is complete for Wm82.${genome}. ` +
            `Protein-level annotation requires the matching Wm82.${genome} ` +
            `CDS/GFF/protein reference resources.`;

        $("proteinTableBody").innerHTML = "";

        $("proteinSection").classList.remove("hidden");
    }


    /*
     * ============================================================
     * GBS REGION / PROTEIN CONSEQUENCE ENGINE
     * ============================================================
     *
     * A4 resources:
     * data/gbs/references/a4/
     *
     * The VCF is expected to use the same NCBI RefSeq contig IDs
     * as the GCF_000004515.6 annotation, e.g. NC_016088.4.
     */

    /*
     * ============================================================
     * VALIDATED A4 PROTEIN CONSEQUENCE ENGINE
     * ============================================================
     *
     * Reference:
     *   Glycine max v4.0
     *   NCBI GCF_000004515.6
     *
     * Mapping:
     *   VCF genomic variant
     *       ↓
     *   GFF CDS
     *       ↓
     *   Parent transcript
     *       ↓
     *   protein_id
     *       ↓
     *   CDS FASTA
     *       ↓
     *   CDS coordinate
     *       ↓
     *   codon
     *       ↓
     *   amino acid
     *
     * The implementation handles:
     *   - positive and negative strands
     *   - multi-exon CDS
     *   - protein_id-based CDS FASTA matching
     *   - reference allele validation
     *   - synonymous / missense / stop gained / stop lost / start lost
     *   - noncoding and unsupported variants
     */

    const A4_GFF =
        "data/gbs/references/a4/GCF_000004515.6_Glycine_max_v4.0_genomic.gff.gz";

    const A4_CDS =
        "data/gbs/references/a4/GCF_000004515.6_Glycine_max_v4.0_cds_from_genomic.fna.gz";

    const A4_PROTEIN =
        "data/gbs/references/a4/GCF_000004515.6_Glycine_max_v4.0_protein.faa.gz";

    const proteinEngineCache = {
        gffText: null,
        cdsRecords: null,
        gffLoaded: false,
        cdsLoaded: false
    };

    async function gunzipResource(url) {

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(
                `Unable to load annotation resource: ${url} (${response.status})`
            );
        }

        const buffer = await response.arrayBuffer();

        if (typeof DecompressionStream === "undefined") {
            throw new Error(
                "This browser does not support gzip decompression."
            );
        }

        const stream = new Blob([buffer])
            .stream()
            .pipeThrough(new DecompressionStream("gzip"));

        return await new Response(stream).text();
    }

    async function loadA4Gff() {

        if (proteinEngineCache.gffLoaded) {
            return proteinEngineCache.gffText;
        }

        proteinEngineCache.gffText =
            await gunzipResource(A4_GFF);

        proteinEngineCache.gffLoaded = true;

        return proteinEngineCache.gffText;
    }

    function parseAttributes(attributes) {

        const result = {};

        for (const item of attributes.split(";")) {

            if (!item) {
                continue;
            }

            const index = item.indexOf("=");

            if (index === -1) {
                continue;
            }

            const key = item.slice(0, index);
            const value = item.slice(index + 1);

            result[key] = value;
        }

        return result;
    }

    function parseGffRecords(
        gffText,
        chromosome,
        start,
        end
    ) {

        const genes = [];
        const transcripts = new Map();
        const cdsByTranscript = new Map();
        const exonsByTranscript = new Map();

        const lines = gffText.split(/\r?\n/);

        for (const line of lines) {

            if (!line || line.startsWith("#")) {
                continue;
            }

            const c = line.split("\t");

            if (c.length < 9) {
                continue;
            }

            if (c[0] !== chromosome) {
                continue;
            }

            const feature = c[2];
            const featureStart = Number(c[3]);
            const featureEnd = Number(c[4]);

            if (
                !Number.isInteger(featureStart) ||
                !Number.isInteger(featureEnd)
            ) {
                continue;
            }

            if (
                featureEnd < start ||
                featureStart > end
            ) {
                continue;
            }

            const attrs = parseAttributes(c[8]);

            if (feature === "gene") {

                genes.push({
                    id: attrs.ID || "",
                    gene: attrs.gene || attrs.Name || "",
                    start: featureStart,
                    end: featureEnd,
                    strand: c[6]
                });

                continue;
            }

            if (
                feature === "mRNA" ||
                feature === "transcript"
            ) {

                const id = attrs.ID || "";

                if (!id) {
                    continue;
                }

                transcripts.set(id, {
                    id,
                    parent: attrs.Parent || "",
                    gene: attrs.gene || "",
                    start: featureStart,
                    end: featureEnd,
                    strand: c[6],
                    proteinId: attrs.protein_id || ""
                });

                continue;
            }

            if (feature === "exon") {

                const parent = attrs.Parent || "";

                if (!parent) {
                    continue;
                }

                if (!exonsByTranscript.has(parent)) {
                    exonsByTranscript.set(parent, []);
                }

                exonsByTranscript.get(parent).push({
                    start: featureStart,
                    end: featureEnd,
                    strand: c[6]
                });

                continue;
            }

            if (feature !== "CDS") {
                continue;
            }

            const parent = attrs.Parent || "";

            if (!parent) {
                continue;
            }

            if (!cdsByTranscript.has(parent)) {
                cdsByTranscript.set(parent, []);
            }

            cdsByTranscript.get(parent).push({
                start: featureStart,
                end: featureEnd,
                strand: c[6],
                phase: c[7],
                proteinId: attrs.protein_id || "",
                gene: attrs.gene || "",
                product: attrs.product || ""
            });
        }

        return {
            genes,
            transcripts,
            cdsByTranscript,
            exonsByTranscript
        };
    }

    function findGeneForPosition(
        records,
        chromosome,
        pos
    ) {

        for (const gene of records.genes) {

            if (
                gene.start <= pos &&
                pos <= gene.end
            ) {
                return gene;
            }
        }

        return null;
    }

    function findTranscriptsForPosition(
        records,
        pos
    ) {

        const result = [];

        for (const transcript of records.transcripts.values()) {

            if (
                transcript.start <= pos &&
                pos <= transcript.end
            ) {
                result.push(transcript);
            }
        }

        return result;
    }

    function findCdsHits(
        records,
        pos
    ) {

        const hits = [];

        for (
            const [
                transcriptId,
                cdsSegments
            ] of records.cdsByTranscript.entries()
        ) {

            for (const cds of cdsSegments) {

                if (
                    cds.start <= pos &&
                    pos <= cds.end
                ) {

                    const transcript =
                        records.transcripts.get(transcriptId);

                    hits.push({
                        transcriptId,
                        transcript,
                        cdsSegments,
                        hit: cds
                    });

                    break;
                }
            }
        }

        return hits;
    }

    function findExonHits(
        records,
        pos
    ) {

        const result = [];

        for (
            const [
                transcriptId,
                exons
            ] of records.exonsByTranscript.entries()
        ) {

            for (const exon of exons) {

                if (
                    exon.start <= pos &&
                    pos <= exon.end
                ) {

                    result.push(transcriptId);
                    break;
                }
            }
        }

        return result;
    }

    function findTranscriptProteinId(
        transcript,
        cdsSegments
    ) {

        if (
            transcript &&
            transcript.proteinId
        ) {
            return transcript.proteinId;
        }

        for (const cds of cdsSegments) {

            if (cds.proteinId) {
                return cds.proteinId;
            }
        }

        return "";
    }

    async function loadA4CdsRecords() {

        if (proteinEngineCache.cdsLoaded) {
            return proteinEngineCache.cdsRecords;
        }

        const text =
            await gunzipResource(A4_CDS);

        const records = new Map();

        let header = "";
        let sequence = [];

        function saveRecord() {

            if (!header) {
                return;
            }

            const proteinMatch =
                header.match(/\[protein_id=([^\]]+)\]/);

            const geneMatch =
                header.match(/\[gene=([^\]]+)\]/);

            const locationMatch =
                header.match(/\[location=([^\]]+)\]/);

            if (!proteinMatch) {
                return;
            }

            const proteinId = proteinMatch[1];

            records.set(
                proteinId,
                {
                    proteinId,
                    gene: geneMatch
                        ? geneMatch[1]
                        : "",
                    location: locationMatch
                        ? locationMatch[1]
                        : "",
                    header,
                    sequence: sequence.join("").toUpperCase()
                }
            );
        }

        for (const line of text.split(/\r?\n/)) {

            if (line.startsWith(">")) {

                saveRecord();

                header = line;
                sequence = [];

            } else if (line) {

                sequence.push(line.trim());
            }
        }

        saveRecord();

        proteinEngineCache.cdsRecords = records;
        proteinEngineCache.cdsLoaded = true;

        return records;
    }

    const geneticCode = {
        TTT:"F", TTC:"F", TTA:"L", TTG:"L",
        TCT:"S", TCC:"S", TCA:"S", TCG:"S",
        TAT:"Y", TAC:"Y", TAA:"*", TAG:"*",
        TGT:"C", TGC:"C", TGA:"*", TGG:"W",

        CTT:"L", CTC:"L", CTA:"L", CTG:"L",
        CCT:"P", CCC:"P", CCA:"P", CCG:"P",
        CAT:"H", CAC:"H", CAA:"Q", CAG:"Q",
        CGT:"R", CGC:"R", CGA:"R", CGG:"R",

        ATT:"I", ATC:"I", ATA:"I", ATG:"M",
        ACT:"T", ACC:"T", ACA:"T", ACG:"T",
        AAT:"N", AAC:"N", AAA:"K", AAG:"K",
        AGT:"S", AGC:"S", AGA:"R", AGG:"R",

        GTT:"V", GTC:"V", GTA:"V", GTG:"V",
        GCT:"A", GCC:"A", GCA:"A", GCG:"A",
        GAT:"D", GAC:"D", GAA:"E", GAG:"E",
        GGT:"G", GGC:"G", GGA:"G", GGG:"G"
    };

    const complement = {
        A: "T",
        T: "A",
        C: "G",
        G: "C"
    };

    function codingAlleles(
        ref,
        alt,
        strand
    ) {

        if (strand === "-") {

            return {
                ref: complement[ref],
                alt: complement[alt]
            };
        }

        return {
            ref,
            alt
        };
    }

    function buildCdsCoordinateMap(
        cdsSegments,
        strand
    ) {

        const ordered = [...cdsSegments];

        if (strand === "+") {

            ordered.sort(
                (a, b) => a.start - b.start
            );

        } else {

            ordered.sort(
                (a, b) => b.start - a.start
            );
        }

        let offset = 0;

        return ordered.map(
            segment => {

                const mapped = {
                    ...segment,
                    cdsOffsetStart: offset,
                    cdsOffsetEnd:
                        offset +
                        (segment.end - segment.start)
                };

                offset +=
                    segment.end -
                    segment.start +
                    1;

                return mapped;
            }
        );
    }

    function genomicToCdsOffset(
        cdsSegments,
        strand,
        pos
    ) {

        const map =
            buildCdsCoordinateMap(
                cdsSegments,
                strand
            );

        for (const segment of map) {

            if (
                segment.start <= pos &&
                pos <= segment.end
            ) {

                if (strand === "+") {

                    return (
                        segment.cdsOffsetStart +
                        (pos - segment.start)
                    );

                }

                return (
                    segment.cdsOffsetStart +
                    (segment.end - pos)
                );
            }
        }

        return -1;
    }

    function consequenceFromAminoAcids(
        refAa,
        altAa,
        refCodon,
        altCodon
    ) {

        if (
            refAa === "X" ||
            altAa === "X"
        ) {
            return "complex_variant";
        }

        if (refAa === altAa) {
            return "synonymous";
        }

        if (altAa === "*") {
            return "stop_gained";
        }

        if (refAa === "*") {
            return "stop_lost";
        }

        if (
            refCodon === "ATG" &&
            altCodon !== "ATG"
        ) {
            return "start_lost";
        }

        return "missense";
    }

    function annotateVariantAgainstTranscript(
        variant,
        hit,
        cdsRecords
    ) {

        const transcript =
            hit.transcript;

        const cdsSegments =
            hit.cdsSegments;

        const strand =
            hit.hit.strand;

        const proteinId =
            findTranscriptProteinId(
                transcript,
                cdsSegments
            );

        if (!proteinId) {
            return {
                ...variant,
                gene:
                    transcript
                        ? transcript.gene
                        : hit.hit.gene || "",
                transcriptId:
                    hit.transcriptId,
                proteinId: "",
                consequence: "coding_annotation_unavailable"
            };
        }

        const cdsRecord =
            cdsRecords.get(proteinId);

        if (!cdsRecord) {
            return {
                ...variant,
                gene:
                    transcript
                        ? transcript.gene
                        : hit.hit.gene || "",
                transcriptId:
                    hit.transcriptId,
                proteinId,
                consequence: "CDS_sequence_not_found"
            };
        }

        const offset =
            genomicToCdsOffset(
                cdsSegments,
                strand,
                variant.pos
            );

        if (offset < 0) {
            return {
                ...variant,
                gene:
                    transcript
                        ? transcript.gene
                        : hit.hit.gene || "",
                transcriptId:
                    hit.transcriptId,
                proteinId,
                consequence: "CDS_coordinate_error"
            };
        }

        if (
            offset >= cdsRecord.sequence.length
        ) {
            return {
                ...variant,
                gene:
                    transcript
                        ? transcript.gene
                        : hit.hit.gene || "",
                transcriptId:
                    hit.transcriptId,
                proteinId,
                consequence: "CDS_coordinate_out_of_range"
            };
        }

        const alleles =
            codingAlleles(
                variant.ref,
                variant.alt,
                strand
            );

        const referenceBase =
            cdsRecord.sequence[offset];

        /*
         * Validate the actual VCF reference allele against
         * the CDS reference sequence.
         */
        if (
            referenceBase !== alleles.ref
        ) {
            return {
                ...variant,
                gene:
                    transcript
                        ? transcript.gene
                        : hit.hit.gene || "",
                transcriptId:
                    hit.transcriptId,
                proteinId,
                consequence: "reference_mismatch",
                cdsPosition: offset + 1,
                cdsReferenceBase: referenceBase,
                expectedReferenceBase: alleles.ref
            };
        }

        /*
         * This engine deliberately restricts the protein
         * calculation to simple biallelic SNPs.
         */
        if (
            variant.ref.length !== 1 ||
            variant.alt.length !== 1 ||
            !complement[variant.ref] ||
            !complement[variant.alt]
        ) {

            return {
                ...variant,
                gene:
                    transcript
                        ? transcript.gene
                        : hit.hit.gene || "",
                transcriptId:
                    hit.transcriptId,
                proteinId,
                consequence: "complex_variant",
                cdsPosition: offset + 1
            };
        }

        const codonStart =
            Math.floor(offset / 3) * 3;

        const refCodon =
            cdsRecord.sequence.slice(
                codonStart,
                codonStart + 3
            );

        if (refCodon.length !== 3) {

            return {
                ...variant,
                gene:
                    transcript
                        ? transcript.gene
                        : hit.hit.gene || "",
                transcriptId:
                    hit.transcriptId,
                proteinId,
                consequence: "incomplete_codon",
                cdsPosition: offset + 1
            };
        }

        const altCodon =
            refCodon.split("");

        altCodon[offset % 3] =
            alleles.alt;

        const altCodonString =
            altCodon.join("");

        const refAa =
            geneticCode[refCodon] || "X";

        const altAa =
            geneticCode[altCodonString] || "X";

        const consequence =
            consequenceFromAminoAcids(
                refAa,
                altAa,
                refCodon,
                altCodonString
            );

        const aaPosition =
            Math.floor(offset / 3) + 1;

        return {
            ...variant,
            gene:
                transcript
                    ? transcript.gene
                    : hit.hit.gene || "",
            transcriptId:
                hit.transcriptId,
            proteinId,
            cdsPosition: offset + 1,
            aaPosition,
            refCodon,
            altCodon: altCodonString,
            refAa,
            altAa,
            proteinChange:
                `${refAa}${aaPosition}${altAa}`,
            consequence
        };
    }

    async function annotateProteinEffects(
        chromosome,
        start,
        end
    ) {

        const body =
            $("proteinTableBody");

        body.innerHTML = "";

        $("proteinSection")
            .classList
            .remove("hidden");

        state.proteinResults = [];

        /*
         * Only A4 currently has a validated matching
         * GFF/CDS annotation resource in this module.
         */
        if (state.genome !== "a4") {

            body.innerHTML = `
                <tr>
                    <td colspan="11">
                        Protein annotation is currently available
                        for Wm82.a4 / GCF_000004515.6 only.
                        The selected genome build is preserved,
                        but no mismatched annotation is applied.
                    </td>
                </tr>
            `;

            return;
        }

        showStatus(
            "Loading A4 gene/CDS annotation...",
            ""
        );

        const gffText =
            await loadA4Gff();

        const records =
            parseGffRecords(
                gffText,
                chromosome,
                start,
                end
            );

        showStatus(
            "Loading A4 CDS sequences...",
            ""
        );

        const cdsRecords =
            await loadA4CdsRecords();

        const results = [];

        for (
            const variant of state.variants
        ) {

            /*
             * Simple SNP only for protein calculation.
             * Indels and complex/multiallelic variants
             * remain visible but are not translated.
             */
            const cleanSnp =
                variant.ref.length === 1 &&
                variant.alt.length === 1 &&
                /^[ACGT]$/i.test(variant.ref) &&
                /^[ACGT]$/i.test(variant.alt);

            const hits =
                findCdsHits(
                    records,
                    variant.pos
                );

            if (hits.length) {

                for (const hit of hits) {

                    results.push(
                        annotateVariantAgainstTranscript(
                            variant,
                            hit,
                            cdsRecords
                        )
                    );
                }

                continue;
            }

            /*
             * No CDS overlap.
             * Determine whether the position is in a gene,
             * exon, or outside annotated genes.
             */
            const gene =
                findGeneForPosition(
                    records,
                    chromosome,
                    variant.pos
                );

            const exonHits =
                findExonHits(
                    records,
                    variant.pos
                );

            let consequence = "intergenic";

            if (gene) {

                if (exonHits.length) {
                    consequence = "UTR";
                } else {
                    consequence = "intronic";
                }
            }

            results.push({
                ...variant,
                gene: gene
                    ? gene.gene
                    : "",
                transcriptId:
                    exonHits.length
                        ? exonHits[0]
                        : "",
                proteinId: "",
                consequence,
                cdsPosition: "",
                aaPosition: "",
                refCodon: "",
                altCodon: "",
                refAa: "",
                altAa: "",
                proteinChange: ""
            });
        }

        state.proteinResults = results;

        renderProteinResults(results);

        const codingCount =
            results.filter(
                r =>
                    r.consequence === "synonymous" ||
                    r.consequence === "missense" ||
                    r.consequence === "stop_gained" ||
                    r.consequence === "stop_lost" ||
                    r.consequence === "start_lost"
            ).length;

        showStatus(
            `Protein annotation complete. ${codingCount} coding consequence(s) identified.`,
            ""
        );
    }

    function renderProteinResults(
        results
    ) {

        const body =
            $("proteinTableBody");

        if (!results.length) {

            body.innerHTML = `
                <tr>
                    <td colspan="11">
                        No variants were found in the requested region.
                    </td>
                </tr>
            `;

            return;
        }

        body.innerHTML =
            results.map(
                r => `
                <tr>
                    <td>${escapeHtml(String(r.chrom || ""))}</td>
                    <td>${escapeHtml(String(r.pos || ""))}</td>
                    <td>${escapeHtml(String(r.ref || ""))}</td>
                    <td>${escapeHtml(String(r.alt || ""))}</td>
                    <td>${escapeHtml(String(r.gene || "—"))}</td>
                    <td>${escapeHtml(String(r.transcriptId || "—"))}</td>
                    <td>${escapeHtml(String(r.proteinId || "—"))}</td>
                    <td>${escapeHtml(String(r.consequence || "—"))}</td>
                    <td>${escapeHtml(String(r.refCodon || "—"))}</td>
                    <td>${escapeHtml(String(r.altCodon || "—"))}</td>
                    <td>${escapeHtml(
                        String(r.proteinChange || "—")
                    )}</td>
                </tr>
            `
            )
            .join("");
    }

    async function analyze() {

        hideStatus();

        try {

            const params = validateInputs();

            state.file = params.file;
            state.genome = params.genome;

            showStatus(
                "Uploading genotype file and analyzing the requested region...",
                ""
            );

            const formData = new FormData();

            formData.append(
                "vcf",
                params.file
            );

            formData.append(
                "genome",
                params.genome
            );

            formData.append(
                "chrom",
                params.chromosome
            );

            formData.append(
                "start",
                String(params.start)
            );

            formData.append(
                "end",
                String(params.end)
            );

            const response = await fetch(
                "/api/gbs/analyze",
                {
                    method: "POST",
                    body: formData
                }
            );

            let result;

            try {
                result = await response.json();
            } catch {
                throw new Error(
                    "The GBS analysis server returned an invalid response."
                );
            }

            if (!response.ok) {
                throw new Error(
                    result.error ||
                    "GBS analysis server returned an error."
                );
            }

            if (!result.samples || !result.samples.length) {
                throw new Error(
                    "No accession/sample columns were found in the VCF."
                );
            }

            state.samples = result.samples;
            state.variants = (result.variants || []).map((variant) => ({
                ...variant,
                transcriptId: variant.transcript || variant.transcriptId || ""
            }));
            state.filteredVariants = [...state.variants];

            renderSummary({
                chromosome: params.chromosome,
                start: params.start,
                end: params.end,
                genome: params.genome,
                file: params.file
            });

            renderVariantTable();
            renderAccessionTable();

            state.proteinResults =
                state.variants.filter(
                    variant =>
                        variant.gene ||
                        variant.transcript ||
                        variant.proteinId ||
                        variant.consequence
                );

            $("proteinSection").classList.remove("hidden");
            renderProteinResults(state.proteinResults);

            showStatus(
                `Analysis complete. Found ${state.variants.length} variant(s) across ${state.samples.length} accession(s).`,
                "success"
            );

        } catch (error) {

            console.error(error);

            showStatus(
                error.message || "Analysis failed.",
                "error"
            );
        }
    }

    function clearAnalysis() {

        $("vcfFile").value = "";
        $("chromosome").value = "";
        $("startPosition").value = "";
        $("endPosition").value = "";
        $("flanking").value = "0";

        state.file = null;
        state.samples = [];
        state.variants = [];
        state.filteredVariants = [];

        $("summarySection").classList.add("hidden");
        $("variantSection").classList.add("hidden");
        $("accessionSection").classList.add("hidden");
        $("proteinSection").classList.add("hidden");

        $("variantTableBody").innerHTML = "";
        $("accessionTableBody").innerHTML = "";
        $("proteinTableBody").innerHTML = "";

        hideStatus();
    }

    function filterVariants() {

        const query =
            $("variantSearch").value
                .trim()
                .toLowerCase();

        if (!query) {
            state.filteredVariants = [...state.variants];
        } else {

            state.filteredVariants =
                state.variants.filter((variant) => {

                    const carriers =
                        variant.carriers
                            .map((x) => x.accession)
                            .join(" ");

                    const searchable = [
                        variant.chrom,
                        variant.pos,
                        variant.ref,
                        variant.alt,
                        carriers
                    ]
                        .join(" ")
                        .toLowerCase();

                    return searchable.includes(query);
                });
        }

        renderVariantTable();
        renderAccessionTable();
    }

    $("analyzeButton").addEventListener(
        "click",
        analyze
    );

    $("clearButton").addEventListener(
        "click",
        clearAnalysis
    );

    $("variantSearch").addEventListener(
        "input",
        filterVariants
    );


    const REFERENCE_BUILDS = {
        a4: {
            label: "A4 — Glycine max v4.0 (GCF_000004515.6)",
            assembly: "GCF_000004515.6",
            coordinateSystem: "GCF_000004515.6",
            annotationReady: true
        },
        a6: {
            label: "A6 — Wm82.gnm6",
            assembly: "Wm82.gnm6",
            coordinateSystem: "Wm82.gnm6",
            annotationReady: true
        }
    };

    function installReferenceSelector() {
        const existing = document.getElementById("genomeVersion");
        if (existing) return existing;

        const wrapper = document.createElement("div");
        wrapper.className = "control-group reference-control";
        wrapper.innerHTML = `
            <label for="genomeVersion">Reference Genome</label>
            <select id="genomeVersion" name="genomeVersion">
                <option value="a4" selected>A4 — Glycine max v4.0 (GCF_000004515.6)</option>
                <option value="a6">A6 — Wm82.gnm6</option>
            </select>
            <div class="control-help">
                Select the genome build that matches the coordinates and annotation of the uploaded VCF.
            </div>
            <div id="referenceBuildNote" class="reference-build-note"></div>
        `;

        const anchor =
            document.getElementById("vcfFile")?.closest(".control-group") ||
            document.getElementById("vcfFile")?.parentElement;

        if (anchor?.parentElement) {
            anchor.parentElement.insertBefore(wrapper, anchor.nextSibling);
        } else {
            document.body.insertBefore(wrapper, document.body.firstChild);
        }

        return wrapper.querySelector("#genomeVersion");
    }

    function updateReferenceBuild() {
        const select = document.getElementById("genomeVersion");
        if (!select) return;

        state.genome = select.value;
        const build = REFERENCE_BUILDS[state.genome];
        if (!build) return;

        let note = document.getElementById("referenceBuildNote");
        if (!note) {
            note = document.createElement("div");
            note.id = "referenceBuildNote";
            select.parentElement.appendChild(note);
        }

        if (state.genome === "a4") {
            note.innerHTML =
                "<strong>A4 selected:</strong> Glycine max v4.0 (GCF_000004515.6). " +
                "This matches the supplied GBS BAM alignment reference.";
        } else {
            note.innerHTML =
                "<strong>" + build.label + " selected.</strong> " +
                "The uploaded VCF must use this reference coordinate system. " +
                "Protein consequences will only use annotation matching the selected build.";
        }

        state.variants = [];
        state.filteredVariants = [];

        if (typeof renderSummary === "function") renderSummary();
        if (typeof renderVariantTable === "function") renderVariantTable([]);
        if (typeof renderAccessionTable === "function") renderAccessionTable([]);
        if (typeof renderProteinPlaceholder === "function") renderProteinPlaceholder();
    }

    document.addEventListener("DOMContentLoaded", () => {
        const select = installReferenceSelector();

        if (select) {
            select.addEventListener("change", updateReferenceBuild);
            updateReferenceBuild();
        }
    });

})();

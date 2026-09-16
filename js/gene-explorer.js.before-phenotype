const geneInput = document.getElementById("geneInput");
const searchButton = document.getElementById("geneSearchButton");
const message = document.getElementById("geneMessage");
const results = document.getElementById("geneResults");
const sequenceResults = document.getElementById("sequenceResults");

let geneIndex = null;
let chromosomeCache = {};


// ============================================================
// Load gene index
// ============================================================

async function loadGeneIndex() {

  if (geneIndex !== null) {
    return geneIndex;
  }

  const response = await fetch("data/a6/gene_index.json");

  if (!response.ok) {
    throw new Error("Unable to load A6 gene database.");
  }

  geneIndex = await response.json();

  return geneIndex;
}


// ============================================================
// FASTA formatting
// ============================================================

function formatFasta(sequence, width = 80) {

  const lines = [];

  for (let i = 0; i < sequence.length; i += width) {
    lines.push(sequence.slice(i, i + width));
  }

  return lines.join("\n");
}


// ============================================================
// Reverse complement
// ============================================================

function reverseComplement(sequence) {

  const complement = {
    A: "T",
    T: "A",
    G: "C",
    C: "G",
    N: "N",
    a: "t",
    t: "a",
    g: "c",
    c: "g",
    n: "n"
  };

  let output = "";

  for (let i = sequence.length - 1; i >= 0; i--) {
    output += complement[sequence[i]] || "N";
  }

  return output.toUpperCase();
}


// ============================================================
// Load A6 gene sequence database
//
// Each chromosome has a compressed JSON database containing
// genomic DNA for all genes on that chromosome.
//
// Example:
// data/a6/sequences/Gm01.json.gz
// ============================================================

async function loadChromosomeGeneData(chromosome) {

  if (chromosomeCache[chromosome]) {
    return chromosomeCache[chromosome];
  }

  const url =
    `data/a6/sequences/${chromosome}.json.gz`;

  message.textContent =
    `Loading ${chromosome} gene sequences...`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Unable to load genomic sequence database for ${chromosome}.`
    );
  }

  if (!("DecompressionStream" in window)) {
    throw new Error(
      "This browser does not support gzip decompression."
    );
  }

  const compressed =
    await response.arrayBuffer();

  const stream =
    new Blob([compressed])
      .stream()
      .pipeThrough(
        new DecompressionStream("gzip")
      );

  const text =
    await new Response(stream).text();

  const data =
    JSON.parse(text);

  chromosomeCache[chromosome] = data;

  return data;
}


// ============================================================
// Get genomic DNA for a gene
// ============================================================

async function getGenomicSequence(gene) {

  const chromosome =
    gene.chromosome;

  const chromosomeData =
    await loadChromosomeGeneData(chromosome);

  const geneData =
    chromosomeData[gene.gene_id];

  if (!geneData) {
    throw new Error(
      `Genomic DNA not found for ${gene.gene_id}.`
    );
  }

  const sequence =
    geneData.genomic_dna;

  if (!sequence) {
    throw new Error(
      `Genomic DNA sequence is unavailable for ${gene.gene_id}.`
    );
  }

  const expectedLength =
    gene.end - gene.start + 1;

  if (sequence.length !== expectedLength) {
    throw new Error(
      `Genomic DNA length mismatch for ${gene.gene_id}. ` +
      `Expected ${expectedLength.toLocaleString()} bp, ` +
      `found ${sequence.length.toLocaleString()} bp.`
    );
  }

  return sequence.toUpperCase();
}


// ============================================================
// Sequence card
// ============================================================

function createSequenceCards(type, sequences, unit) {

  if (!sequences || Object.keys(sequences).length === 0) {
    return;
  }

  for (const [isoform, sequence] of Object.entries(sequences)) {

    const card = document.createElement("div");

    card.className = "sequence-card";

    const header = document.createElement("div");

    header.className = "sequence-header";

    const title = document.createElement("div");

    title.innerHTML = `
      <h3>${type}</h3>
      <div class="sequence-meta">
        ${isoform} · ${sequence.length.toLocaleString()} ${unit}
      </div>
    `;

    const copyButton = document.createElement("button");

    copyButton.className = "copy-sequence";
    copyButton.textContent = "Copy";

    copyButton.addEventListener("click", async () => {

      await navigator.clipboard.writeText(sequence);

      copyButton.textContent = "Copied!";

      setTimeout(() => {
        copyButton.textContent = "Copy";
      }, 1200);

    });

    header.appendChild(title);
    header.appendChild(copyButton);

    const sequenceBox = document.createElement("pre");

    sequenceBox.className = "sequence-box";

    sequenceBox.textContent =
      formatFasta(sequence, 80);

    card.appendChild(header);
    card.appendChild(sequenceBox);

    sequenceResults.appendChild(card);
  }
}


// ============================================================
// Genomic DNA card
// ============================================================

function createGenomicCard(gene, sequence) {

  const card = document.createElement("div");

  card.className =
    "sequence-card genomic-card";

  const header = document.createElement("div");

  header.className = "sequence-header";

  const title = document.createElement("div");

  title.innerHTML = `
    <h3>Genomic DNA</h3>
    <div class="sequence-meta">
      Wm82.a6.v1 · ${gene.chromosome}:
      ${gene.start.toLocaleString()} –
      ${gene.end.toLocaleString()}
      · ${sequence.length.toLocaleString()} bp
      · strand ${gene.strand}
    </div>
  `;

  const buttons = document.createElement("div");

  buttons.className = "sequence-buttons";

  const copyButton = document.createElement("button");

  copyButton.className = "copy-sequence";
  copyButton.textContent = "Copy FASTA";

  const fasta =
    `>${gene.gene_id}|${gene.chromosome}:${gene.start}-${gene.end}|Wm82.a6.v1\n` +
    formatFasta(sequence, 80);

  copyButton.addEventListener("click", async () => {

    await navigator.clipboard.writeText(fasta);

    copyButton.textContent = "Copied!";

    setTimeout(() => {
      copyButton.textContent = "Copy FASTA";
    }, 1200);

  });

  const downloadButton =
    document.createElement("button");

  downloadButton.className = "copy-sequence";
  downloadButton.textContent = "Download FASTA";

  downloadButton.addEventListener("click", () => {

    const blob =
      new Blob([fasta], {
        type: "text/plain"
      });

    const url =
      URL.createObjectURL(blob);

    const link =
      document.createElement("a");

    link.href = url;

    link.download =
      `${gene.gene_id}_genomic.fasta`;

    document.body.appendChild(link);

    link.click();

    link.remove();

    URL.revokeObjectURL(url);

  });

  buttons.appendChild(copyButton);
  buttons.appendChild(downloadButton);

  header.appendChild(title);
  header.appendChild(buttons);

  const region = document.createElement("div");

  region.className = "genomic-region";

  region.innerHTML = `
    <strong>Reference genomic region</strong><br>
    ${gene.chromosome}:${gene.start.toLocaleString()}-${gene.end.toLocaleString()}
    (${sequence.length.toLocaleString()} bp)
  `;

  const sequenceBox =
    document.createElement("pre");

  sequenceBox.className =
    "sequence-box genomic-sequence-box";

  sequenceBox.textContent =
    `>${gene.gene_id}|${gene.chromosome}:${gene.start}-${gene.end}|Wm82.a6.v1\n` +
    formatFasta(sequence, 80);

  card.appendChild(header);
  card.appendChild(region);
  card.appendChild(sequenceBox);

  sequenceResults.appendChild(card);
}


// ============================================================
// Search
// ============================================================

async function searchGene() {

  const geneId =
    geneInput.value.trim();

  message.textContent = "";

  results.hidden = true;

  sequenceResults.innerHTML = "";

  if (!geneId) {

    message.textContent =
      "Please enter a Gene ID.";

    return;
  }

  try {

    searchButton.disabled = true;

    searchButton.textContent =
      "Searching...";

    const index =
      await loadGeneIndex();

    const gene =
      index[geneId];

    if (!gene) {

      message.textContent =
        "Gene ID not found in the Wm82.a6.v1 database.";

      return;
    }


    // --------------------------------------------------------
    // Load chromosome-level sequence data
    // --------------------------------------------------------

    const chromosome =
      gene.chromosome;

    const chromosomeData =
      await loadChromosomeGeneData(chromosome);

    const data =
      chromosomeData[geneId];

    if (!data) {

      throw new Error(
        `Sequence data for ${geneId} were not found in ${chromosome}.`
      );

    }


    // --------------------------------------------------------
    // Gene information
    // --------------------------------------------------------

    document.getElementById("resultGene").textContent =
      data.gene_id;

    document.getElementById("resultGenome").textContent =
      data.genome;

    document.getElementById("resultChromosome").textContent =
      data.chromosome;

    document.getElementById("resultPosition").textContent =
      `${data.start.toLocaleString()} – ${data.end.toLocaleString()}`;

    document.getElementById("resultStrand").textContent =
      data.strand;


    // --------------------------------------------------------
    // mRNA / CDS / protein
    // --------------------------------------------------------

    createSequenceCards(
      "mRNA",
      data.mrna,
      "nt"
    );

    createSequenceCards(
      "CDS",
      data.cds,
      "nt"
    );

    createSequenceCards(
      "Protein",
      data.protein,
      "aa"
    );


    // --------------------------------------------------------
    // Genomic DNA
    // --------------------------------------------------------

    message.textContent =
      `Extracting genomic DNA from ${data.chromosome}...`;

    const genomicSequence =
      await getGenomicSequence(data);

    createGenomicCard(
      data,
      genomicSequence
    );


    message.textContent =
      `Gene ${geneId} loaded successfully.`;

    results.hidden = false;

  }

  catch (error) {

    console.error(error);

    message.textContent =
      error.message ||
      "An error occurred while searching.";

  }

  finally {

    searchButton.disabled = false;

    searchButton.textContent =
      "Search Gene";

  }

}


// ============================================================
// Events
// ============================================================

searchButton.addEventListener(
  "click",
  searchGene
);

geneInput.addEventListener(
  "keydown",
  event => {

    if (event.key === "Enter") {
      searchGene();
    }

  }
);

import gzip
import json
import re
from pathlib import Path

ROOT = Path(__file__).parent
INDEX_FILE = ROOT / "gene_index.json"
SEQ_DIR = ROOT / "sequences"

MRNA_FILE = ROOT / "glyma.Wm82.gnm6.ann1.PKSW.mrna.fna.gz"
CDS_FILE = ROOT / "glyma.Wm82.gnm6.ann1.PKSW.cds.fna.gz"
PROTEIN_FILE = ROOT / "glyma.Wm82.gnm6.ann1.PKSW.protein.faa.gz"

CHROMOSOMES = [f"Gm{i:02d}" for i in range(1, 21)]

print("=" * 70)
print("BUILDING COMPLETE Wm82.a6 SEQUENCE DATABASE")
print("=" * 70)

# ------------------------------------------------------------
# Load gene index
# ------------------------------------------------------------

with open(INDEX_FILE) as f:
    gene_index = json.load(f)

print(f"\nGenes in index: {len(gene_index):,}")

# ------------------------------------------------------------
# Load existing genomic DNA database
# ------------------------------------------------------------

database = {}

for chrom in CHROMOSOMES:

    filename = SEQ_DIR / f"{chrom}.json.gz"

    if not filename.exists():
        raise FileNotFoundError(filename)

    with gzip.open(filename, "rt", encoding="utf-8") as f:
        database[chrom] = json.load(f)

    print(
        f"{chrom}: "
        f"{len(database[chrom]):,} genes loaded"
    )


# ------------------------------------------------------------
# Extract gene ID from FASTA header
#
# Actual header:
#
# glyma.Wm82.gnm6.ann1.Glyma.07G273800.2
#
# Gene ID:
#
# Glyma.07G273800
#
# Isoform:
#
# Glyma.07G273800.2
# ------------------------------------------------------------

def parse_fasta_id(header):

    # Remove everything before Glyma.
    match = re.search(
        r"(Glyma\.\d+G\d+)(?:\.(\d+))?$",
        header
    )

    if not match:
        return None, None

    gene_id = match.group(1)
    isoform_number = match.group(2)

    if isoform_number:
        isoform_id = f"{gene_id}.{isoform_number}"
    else:
        isoform_id = gene_id

    return gene_id, isoform_id


# ------------------------------------------------------------
# FASTA reader
# ------------------------------------------------------------

def read_fasta(filename):

    header = None
    sequence = []

    with gzip.open(filename, "rt", encoding="utf-8") as f:

        for line in f:

            line = line.strip()

            if not line:
                continue

            if line.startswith(">"):

                if header is not None:
                    yield header, "".join(sequence)

                header = line[1:].split()[0]
                sequence = []

            else:
                sequence.append(line)

        if header is not None:
            yield header, "".join(sequence)


# ------------------------------------------------------------
# Process one FASTA database
# ------------------------------------------------------------

def process_fasta(filename, sequence_type):

    print("\n" + "-" * 70)
    print(f"Processing {sequence_type.upper()}")
    print(filename.name)
    print("-" * 70)

    total = 0
    matched = 0
    unmatched = 0
    genes_seen = set()

    for header, sequence in read_fasta(filename):

        total += 1

        gene_id, isoform_id = parse_fasta_id(header)

        if gene_id is None:

            unmatched += 1

            if unmatched <= 5:
                print(
                    "UNMATCHED HEADER:",
                    header
                )

            continue

        if gene_id not in gene_index:

            unmatched += 1

            if unmatched <= 5:
                print(
                    "NOT IN GENE INDEX:",
                    gene_id,
                    header
                )

            continue

        chrom = gene_index[gene_id]["chromosome"]

        if gene_id not in database[chrom]:

            database[chrom][gene_id] = {
                "gene_id": gene_id,
                "chromosome": chrom,
                "start": gene_index[gene_id]["start"],
                "end": gene_index[gene_id]["end"],
                "strand": gene_index[gene_id]["strand"]
            }

        entry = database[chrom][gene_id]

        if sequence_type not in entry:
            entry[sequence_type] = {}

        entry[sequence_type][isoform_id] = sequence

        matched += 1
        genes_seen.add(gene_id)

    print(f"FASTA records:       {total:,}")
    print(f"Matched records:     {matched:,}")
    print(f"Genes represented:   {len(genes_seen):,}")
    print(f"Unmatched records:   {unmatched:,}")

    return total, matched, unmatched


# ------------------------------------------------------------
# Process mRNA
# ------------------------------------------------------------

mrna_total, mrna_matched, mrna_unmatched = process_fasta(
    MRNA_FILE,
    "mrna"
)


# ------------------------------------------------------------
# Process CDS
# ------------------------------------------------------------

cds_total, cds_matched, cds_unmatched = process_fasta(
    CDS_FILE,
    "cds"
)


# ------------------------------------------------------------
# Process protein
# ------------------------------------------------------------

protein_total, protein_matched, protein_unmatched = process_fasta(
    PROTEIN_FILE,
    "protein"
)


# ------------------------------------------------------------
# Write chromosome databases
# ------------------------------------------------------------

print("\n" + "=" * 70)
print("WRITING COMPLETE CHROMOSOME DATABASES")
print("=" * 70)

total_genes = 0
genes_with_genomic = 0
genes_with_mrna = 0
genes_with_cds = 0
genes_with_protein = 0

total_mrna_isoforms = 0
total_cds_isoforms = 0
total_protein_isoforms = 0

for chrom in CHROMOSOMES:

    data = database[chrom]

    # Sort genes by genomic position
    data = dict(
        sorted(
            data.items(),
            key=lambda x: x[1]["start"]
        )
    )

    output = SEQ_DIR / f"{chrom}.json.gz"

    with gzip.open(
        output,
        "wt",
        encoding="utf-8"
    ) as f:

        json.dump(
            data,
            f,
            separators=(",", ":")
        )

    chrom_genomic = 0
    chrom_mrna = 0
    chrom_cds = 0
    chrom_protein = 0

    for gene in data.values():

        if gene.get("genomic_dna"):
            chrom_genomic += 1

        if gene.get("mrna"):
            chrom_mrna += 1
            total_mrna_isoforms += len(gene["mrna"])

        if gene.get("cds"):
            chrom_cds += 1
            total_cds_isoforms += len(gene["cds"])

        if gene.get("protein"):
            chrom_protein += 1
            total_protein_isoforms += len(gene["protein"])

    total_genes += len(data)
    genes_with_genomic += chrom_genomic
    genes_with_mrna += chrom_mrna
    genes_with_cds += chrom_cds
    genes_with_protein += chrom_protein

    size_mb = output.stat().st_size / (1024 * 1024)

    print(
        f"{chrom}: "
        f"{len(data):,} genes | "
        f"mRNA genes {chrom_mrna:,} | "
        f"CDS genes {chrom_cds:,} | "
        f"protein genes {chrom_protein:,} | "
        f"{size_mb:.1f} MB"
    )


# ------------------------------------------------------------
# Final report
# ------------------------------------------------------------

print("\n" + "=" * 70)
print("FINAL DATABASE SUMMARY")
print("=" * 70)

print(f"Genes:                 {total_genes:,}")
print(f"Genes with genomic DNA:{genes_with_genomic:,}")
print(f"Genes with mRNA:       {genes_with_mrna:,}")
print(f"Genes with CDS:        {genes_with_cds:,}")
print(f"Genes with protein:    {genes_with_protein:,}")

print()
print(f"mRNA isoforms:         {total_mrna_isoforms:,}")
print(f"CDS isoforms:          {total_cds_isoforms:,}")
print(f"Protein isoforms:      {total_protein_isoforms:,}")

print()
print(f"mRNA matched:          {mrna_matched:,} / {mrna_total:,}")
print(f"CDS matched:           {cds_matched:,} / {cds_total:,}")
print(f"Protein matched:       {protein_matched:,} / {protein_total:,}")

print("=" * 70)
print("DATABASE BUILD COMPLETE")
print("=" * 70)

#!/usr/bin/env python3

import argparse
import gzip
import json
import os
import re
import subprocess
import sys


REFERENCE_CONFIG = {
    "a4": {
        "label": "A4",
        "reference": "GCF_000004515.6",
        "gff": (
            "/app/gbs-backend/references/a4/"
            "GCF_000004515.6_Glycine_max_v4.0_genomic.gff.gz"
        ),
        "cds": (
            "/app/gbs-backend/references/a4/"
            "GCF_000004515.6_Glycine_max_v4.0_cds_from_genomic.fna.gz"
        ),
        "annotation_available": True,
    },
    "a6": {
        "label": "A6",
        "reference": "Wm82.gnm6",
        "gff": (
            "/app/gbs-backend/references/a6/"
            "glyma.Wm82.gnm6.ann1.PKSW.gene_models_main.gff3.gz"
        ),
        "cds": (
            "/app/gbs-backend/references/a6/"
            "glyma.Wm82.gnm6.ann1.PKSW.cds.fna.gz"
        ),
        "annotation_available": True,
    },
}


def get_reference_config(genome):
    genome = genome.lower()

    if genome not in REFERENCE_CONFIG:
        raise ValueError(
            f"Unsupported genome build: {genome}. "
            "Supported builds are A4 and A6."
        )

    return REFERENCE_CONFIG[genome]


GENETIC_CODE = {
    "TTT":"F","TTC":"F","TTA":"L","TTG":"L",
    "TCT":"S","TCC":"S","TCA":"S","TCG":"S",
    "TAT":"Y","TAC":"Y","TAA":"*","TAG":"*",
    "TGT":"C","TGC":"C","TGA":"*","TGG":"W",
    "CTT":"L","CTC":"L","CTA":"L","CTG":"L",
    "CCT":"P","CCC":"P","CCA":"P","CCG":"P",
    "CAT":"H","CAC":"H","CAA":"Q","CAG":"Q",
    "CGT":"R","CGC":"R","CGA":"R","CGG":"R",
    "ATT":"I","ATC":"I","ATA":"I","ATG":"M",
    "ACT":"T","ACC":"T","ACA":"T","ACG":"T",
    "AAT":"N","AAC":"N","AAA":"K","AAG":"K",
    "AGT":"S","AGC":"S","AGA":"R","AGG":"R",
    "GTT":"V","GTC":"V","GTA":"V","GTG":"V",
    "GCT":"A","GCC":"A","GCA":"A","GCG":"A",
    "GAT":"D","GAC":"D","GAA":"E","GAG":"E",
    "GGT":"G","GGC":"G","GGA":"G","GGG":"G",
}


def parse_attributes(text):
    result = {}

    for item in text.rstrip(";").split(";"):
        if "=" not in item:
            continue

        key, value = item.split("=", 1)
        result[key] = value

    return result


def reverse_complement(seq):
    table = str.maketrans(
        "ACGTNacgtn",
        "TGCANtgcan"
    )
    return seq.translate(table)[::-1]


def load_gff(chrom, start, end, gff_path):

    genes = []
    transcripts = []
    cds_records = []

    if not gff_path:
        return genes, transcripts, cds_records

    # First identify genes/transcripts overlapping the requested
    # genomic region. CDS records are collected later based on
    # their Parent transcript, because protein reconstruction
    # requires all CDS segments of the transcript.
    relevant_transcripts = set()

    with gzip.open(gff_path, "rt") as handle:

        for line in handle:

            if line.startswith("#"):
                continue

            fields = line.rstrip("\n").split("\t")

            if len(fields) != 9:
                continue

            (
                seqid,
                source,
                feature,
                fstart,
                fend,
                score,
                strand,
                phase,
                attributes
            ) = fields

            if seqid != chrom:
                continue

            fstart = int(fstart)
            fend = int(fend)

            if fend < start or fstart > end:
                continue

            record = {
                "feature": feature,
                "start": fstart,
                "end": fend,
                "strand": strand,
                "phase": phase,
                "attributes": parse_attributes(attributes)
            }

            if feature == "gene":

                genes.append(record)

            elif feature in {
                "mRNA",
                "transcript",
                "lnc_RNA",
                "ncRNA"
            }:

                transcripts.append(record)

                tid = record["attributes"].get("ID")

                if tid:
                    relevant_transcripts.add(tid)

    # Second pass: collect ALL CDS segments belonging to the
    # transcripts that overlap the requested region.
    if relevant_transcripts:

        with gzip.open(gff_path, "rt") as handle:

            for line in handle:

                if line.startswith("#"):
                    continue

                fields = line.rstrip("\n").split("\t")

                if len(fields) != 9:
                    continue

                (
                    seqid,
                    source,
                    feature,
                    fstart,
                    fend,
                    score,
                    strand,
                    phase,
                    attributes
                ) = fields

                if seqid != chrom or feature != "CDS":
                    continue

                attrs = parse_attributes(attributes)

                parents = set(
                    attrs.get("Parent", "").split(",")
                )

                if not parents.intersection(
                    relevant_transcripts
                ):
                    continue

                cds_records.append({
                    "feature": feature,
                    "start": int(fstart),
                    "end": int(fend),
                    "strand": strand,
                    "phase": phase,
                    "attributes": attrs
                })

    return genes, transcripts, cds_records


def load_cds_sequences(cds_path):

    sequences = {}
    current_id = None
    parts = []

    if not cds_path:
        return sequences

    with gzip.open(cds_path, "rt") as handle:

        for line in handle:

            line = line.rstrip("\n")

            if line.startswith(">"):

                if current_id:
                    sequences[current_id] = "".join(parts)

                parts = []

                match = re.search(
                    r"\[protein_id=([^\]]+)\]",
                    line
                )

                if match:
                    current_id = match.group(1)
                else:
                    # A6 CDS FASTA headers use the transcript/
                    # protein-style identifier directly:
                    # >glyma.Wm82.gnm6.ann1.Glyma.01G000100.2
                    current_id = line[1:].split()[0]

            elif current_id:
                parts.append(line.strip())

        if current_id:
            sequences[current_id] = "".join(parts)

    return sequences


def extract_region(vcf, chrom, start, end):

    region = f"{chrom}:{start}-{end}"

    command = [
        "bcftools",
        "view",
        "-r",
        region,
        "-Ov",
        vcf
    ]

    try:

        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=True
        )

    except FileNotFoundError:
        raise SystemExit(
            "bcftools is not installed or not in PATH."
        )

    except subprocess.CalledProcessError as exc:

        sys.stderr.write(exc.stderr)

        raise SystemExit(
            f"bcftools failed with exit code "
            f"{exc.returncode}"
        )

    return region, result.stdout


def parse_gt(sample_value, format_keys):

    values = sample_value.split(":")

    for i, key in enumerate(format_keys):

        if key == "GT":
            return (
                values[i]
                if i < len(values)
                else "./."
            )

    return "./."


def alt_count(gt):

    if not gt or "." in gt:
        return None

    gt = gt.replace("|", "/")
    alleles = gt.split("/")

    if len(alleles) != 2:
        return None

    try:
        return int(alleles[0]) + int(alleles[1])
    except ValueError:
        return None


def get_carrier_summary(samples, sample_values, format_keys):

    carriers = []
    called = 0
    alt_alleles = 0
    total_alleles = 0

    for sample, sample_value in zip(
        samples,
        sample_values
    ):

        gt = parse_gt(
            sample_value,
            format_keys
        )

        count = alt_count(gt)

        if count is None:
            continue

        called += 1
        total_alleles += 2
        alt_alleles += count

        if count > 0:

            carriers.append({
                "accession": sample,
                "genotype": gt,
                "altAlleles": count
            })

    af = (
        alt_alleles / total_alleles
        if total_alleles
        else None
    )

    carrier_count = len(carriers)

    if carrier_count == 1:
        rarity = "singleton"
    elif carrier_count <= 5:
        rarity = "rare_carrier"
    else:
        rarity = "common_or_nonrare"

    return {
        "calledGenotypes": called,
        "alternateAlleles": alt_alleles,
        "totalAlleles": total_alleles,
        "alleleFrequency": af,
        "carrierCount": carrier_count,
        "rarityClass": rarity,
        "carriers": carriers
    }


def protein_effect(
    chrom,
    pos,
    ref,
    alt,
    cds_sequences,
    gff_path
):

    genes, transcripts, cds_records = load_gff(
        chrom,
        pos,
        pos,
        gff_path
    )

    for transcript in transcripts:

        tid = transcript["attributes"].get("ID")

        if not tid:
            continue

        transcript_cds = [
            x for x in cds_records
            if tid in x["attributes"]
                .get("Parent", "")
                .split(",")
        ]

        if not transcript_cds:
            continue

        strand = transcript["strand"]

        if strand == "+":

            ordered = sorted(
                transcript_cds,
                key=lambda x: x["start"]
            )

        else:

            ordered = sorted(
                transcript_cds,
                key=lambda x: x["start"],
                reverse=True
            )

        offset = 0
        genomic_offset = None

        for cds in ordered:

            if cds["start"] <= pos <= cds["end"]:

                if strand == "+":

                    genomic_offset = (
                        offset +
                        pos -
                        cds["start"]
                    )

                else:

                    genomic_offset = (
                        offset +
                        cds["end"] -
                        pos
                    )

                break

            offset += (
                cds["end"] -
                cds["start"] +
                1
            )

        if genomic_offset is None:
            continue

        protein_id = None

        for cds in transcript_cds:

            protein_id = cds["attributes"].get(
                "protein_id"
            )

            if protein_id:
                break

        # A6 CDS annotations do not carry a protein_id
        # attribute. Their CDS FASTA uses the transcript
        # identifier directly.
        if not protein_id:
            protein_id = tid

        sequence = cds_sequences.get(
            protein_id
        )

        if not sequence:
            continue

        if not sequence:
            continue

        if len(ref) != 1 or len(alt) != 1:

            return {
                "gene": transcript["attributes"]
                    .get("Parent"),
                "transcript": tid,
                "proteinId": protein_id,
                "consequence": "complex_variant",
                "refCodon": None,
                "altCodon": None,
                "proteinChange": None
            }

        if strand == "-":

            cds_ref = reverse_complement(ref.upper())
            cds_alt = reverse_complement(alt.upper())

        else:

            cds_ref = ref.upper()
            cds_alt = alt.upper()

        if genomic_offset >= len(sequence):
            continue

        expected_ref = sequence[
            genomic_offset
        ].upper()

        if expected_ref != cds_ref:
            continue

        codon_start = (
            genomic_offset // 3
        ) * 3

        ref_codon = sequence[
            codon_start:codon_start + 3
        ].upper()

        if len(ref_codon) != 3:
            continue

        codon = list(ref_codon)

        codon[
            genomic_offset % 3
        ] = cds_alt

        alt_codon = "".join(codon)

        ref_aa = GENETIC_CODE.get(
            ref_codon,
            "?"
        )

        alt_aa = GENETIC_CODE.get(
            alt_codon,
            "?"
        )

        if ref_aa == alt_aa:
            consequence = "synonymous"

        elif ref_aa != "*" and alt_aa == "*":
            consequence = "stop_gained"

        elif ref_aa == "*" and alt_aa != "*":
            consequence = "stop_lost"

        elif (
            codon_start == 0
            and ref_aa == "M"
            and alt_aa != "M"
        ):
            consequence = "start_lost"

        else:
            consequence = "missense"

        gene = transcript["attributes"].get(
            "Parent"
        )

        if gene and gene.startswith("gene-"):
            gene_display = gene[5:]
        else:
            gene_display = gene

        return {
            "gene": gene_display,
            "geneId": gene,
            "transcript": tid,
            "proteinId": protein_id,
            "consequence": consequence,
            "refCodon": ref_codon,
            "altCodon": alt_codon,
            "proteinChange": (
                f"{ref_aa}>{alt_aa}"
            )
        }

    return {
        "gene": None,
        "geneId": None,
        "transcript": None,
        "proteinId": None,
        "consequence": "non-coding",
        "refCodon": None,
        "altCodon": None,
        "proteinChange": None
    }


def main():

    parser = argparse.ArgumentParser(
        description=(
            "Extract GBS variants from a region "
            "and calculate carrier and protein effects."
        )
    )

    parser.add_argument(
        "--vcf",
        required=True
    )

    parser.add_argument(
        "--chrom",
        required=True
    )

    parser.add_argument(
        "--start",
        required=True,
        type=int
    )

    parser.add_argument(
        "--end",
        required=True,
        type=int
    )

    parser.add_argument(
        "--genome",
        required=False,
        default="a4",
        choices=["a4", "a6"]
    )

    args = parser.parse_args()

    reference_config = get_reference_config(args.genome)

    annotation_available = reference_config["annotation_available"]

    gff_path = reference_config["gff"]
    cds_path = reference_config["cds"]

    if annotation_available:
        if not gff_path or not os.path.exists(gff_path):
            raise SystemExit(
                f"{args.genome.upper()} annotation GFF was not found: "
                f"{gff_path}"
            )

        if not cds_path or not os.path.exists(cds_path):
            raise SystemExit(
                f"{args.genome.upper()} CDS FASTA was not found: "
                f"{cds_path}"
            )

    if not os.path.exists(args.vcf):
        raise SystemExit(
            f"VCF not found: {args.vcf}"
        )

    if args.start < 1:
        raise SystemExit(
            "Start position must be >= 1."
        )

    if args.end < args.start:
        raise SystemExit(
            "End position must be >= start position."
        )

    region, vcf_text = extract_region(
        args.vcf,
        args.chrom,
        args.start,
        args.end
    )

    cds_sequences = (
        load_cds_sequences(cds_path)
        if annotation_available
        else {}
    )

    samples = []
    variants = []

    for line in vcf_text.splitlines():

        if line.startswith("#CHROM"):

            columns = line.split("\t")
            samples = columns[9:]
            continue

        if line.startswith("#"):
            continue

        columns = line.split("\t")

        if len(columns) < 10:
            continue

        chrom = columns[0]
        pos = int(columns[1])
        ref = columns[3]
        alt = columns[4]

        format_keys = columns[8].split(":")

        carrier_data = get_carrier_summary(
            samples,
            columns[9:],
            format_keys
        )

        if not annotation_available:

            protein_data = {
                "gene": None,
                "geneId": None,
                "transcript": None,
                "proteinId": None,
                "consequence": "annotation_unavailable",
                "refCodon": None,
                "altCodon": None,
                "proteinChange": None
            }

        elif (
            len(ref) == 1
            and len(alt) == 1
            and ref.upper() in {"A", "C", "G", "T"}
            and alt.upper() in {"A", "C", "G", "T"}
        ):

            protein_data = protein_effect(
                chrom,
                pos,
                ref,
                alt,
                cds_sequences,
                gff_path
            )

        else:

            protein_data = {
                "gene": None,
                "geneId": None,
                "transcript": None,
                "proteinId": None,
                "consequence": "complex_variant",
                "refCodon": None,
                "altCodon": None,
                "proteinChange": None
            }

        variants.append({
            "chrom": chrom,
            "pos": pos,
            "id": columns[2],
            "ref": ref,
            "alt": alt,
            **carrier_data,
            **protein_data
        })

    output = {
        "genome": reference_config["label"],
        "reference": reference_config["reference"],
        "annotationAvailable": annotation_available,
        "region": region,
        "sampleCount": len(samples),
        "variantCount": len(variants),
        "samples": samples,
        "variants": variants
    }

    print(
        json.dumps(
            output,
            indent=2
        )
    )


if __name__ == "__main__":
    main()

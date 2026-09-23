#!/usr/bin/env python3

import argparse
import gzip
import json
import os
import re
import subprocess
import sys


A4_GFF = (
    "data/gbs/references/a4/"
    "GCF_000004515.6_Glycine_max_v4.0_genomic.gff.gz"
)

A4_CDS = (
    "data/gbs/references/a4/"
    "GCF_000004515.6_Glycine_max_v4.0_cds_from_genomic.fna.gz"
)


GENETIC_CODE = {
    "TTT": "F", "TTC": "F",
    "TTA": "L", "TTG": "L",
    "TCT": "S", "TCC": "S",
    "TCA": "S", "TCG": "S",
    "TAT": "Y", "TAC": "Y",
    "TAA": "*", "TAG": "*",
    "TGT": "C", "TGC": "C",
    "TGA": "*", "TGG": "W",

    "CTT": "L", "CTC": "L",
    "CTA": "L", "CTG": "L",
    "CCT": "P", "CCC": "P",
    "CCA": "P", "CCG": "P",
    "CAT": "H", "CAC": "H",
    "CAA": "Q", "CAG": "Q",
    "CGT": "R", "CGC": "R",
    "CGA": "R", "CGG": "R",

    "ATT": "I", "ATC": "I",
    "ATA": "I", "ATG": "M",
    "ACT": "T", "ACC": "T",
    "ACA": "T", "ACG": "T",
    "AAT": "N", "AAC": "N",
    "AAA": "K", "AAG": "K",
    "AGT": "S", "AGC": "S",
    "AGA": "R", "AGG": "R",

    "GTT": "V", "GTC": "V",
    "GTA": "V", "GTG": "V",
    "GCT": "A", "GCC": "A",
    "GCA": "A", "GCG": "A",
    "GAT": "D", "GAC": "D",
    "GAA": "E", "GAG": "E",
    "GGT": "G", "GGC": "G",
    "GGA": "G", "GGG": "G",
}


def parse_attributes(text):
    result = {}

    for item in text.rstrip(";").split(";"):
        if "=" not in item:
            continue

        key, value = item.split("=", 1)
        result[key] = value

    return result


def reverse_complement(sequence):
    table = str.maketrans(
        "ACGTNacgtn",
        "TGCANtgcan"
    )

    return sequence.translate(table)[::-1]


def load_gff_region(chrom, start, end):

    genes = []
    transcripts = []
    cds_records = []

    with gzip.open(A4_GFF, "rt") as handle:

        for line in handle:

            if not line or line.startswith("#"):
                continue

            fields = line.rstrip("\n").split("\t")

            if len(fields) != 9:
                continue

            seqid, source, feature, fstart, fend, score, strand, phase, attributes = fields

            if seqid != chrom:
                continue

            fstart = int(fstart)
            fend = int(fend)

            if fend < start or fstart > end:
                continue

            attrs = parse_attributes(attributes)

            record = {
                "seqid": seqid,
                "feature": feature,
                "start": fstart,
                "end": fend,
                "strand": strand,
                "phase": phase,
                "attributes": attrs,
            }

            if feature == "gene":
                genes.append(record)

            elif feature in {
                "mRNA",
                "transcript",
                "lnc_RNA",
                "ncRNA",
            }:
                transcripts.append(record)

            elif feature == "CDS":
                cds_records.append(record)

    return genes, transcripts, cds_records


def extract_protein_id(cds_records, transcript_id):

    for cds in cds_records:

        parent = cds["attributes"].get("Parent", "")

        parents = parent.split(",")

        if transcript_id in parents:

            protein_id = cds["attributes"].get("protein_id")

            if protein_id:
                return protein_id

    return None


def load_cds_sequences():

    sequences = {}
    current_id = None
    current_parts = []

    with gzip.open(A4_CDS, "rt") as handle:

        for line in handle:

            line = line.rstrip("\n")

            if line.startswith(">"):

                if current_id:

                    sequences[current_id] = "".join(
                        current_parts
                    )

                current_parts = []

                match = re.search(
                    r"\[protein_id=([^\]]+)\]",
                    line
                )

                if match:
                    current_id = match.group(1)
                else:
                    current_id = None

            else:

                if current_id:
                    current_parts.append(line.strip())

        if current_id:
            sequences[current_id] = "".join(
                current_parts
            )

    return sequences


def find_transcript_for_variant(
    pos,
    genes,
    transcripts,
    cds_records
):

    candidates = []

    for transcript in transcripts:

        if not (
            transcript["start"]
            <= pos
            <= transcript["end"]
        ):
            continue

        tid = transcript["attributes"].get("ID")

        if not tid:
            continue

        transcript_cds = [
            cds
            for cds in cds_records
            if tid in cds["attributes"].get(
                "Parent", ""
            ).split(",")
        ]

        if transcript_cds:
            candidates.append(
                (transcript, transcript_cds)
            )

    return candidates


def cds_offset_for_position(
    pos,
    cds_records,
    strand
):

    if strand == "+":

        ordered = sorted(
            cds_records,
            key=lambda x: x["start"]
        )

        offset = 0

        for cds in ordered:

            if cds["start"] <= pos <= cds["end"]:

                return (
                    offset
                    + (pos - cds["start"])
                )

            offset += (
                cds["end"]
                - cds["start"]
                + 1
            )

    else:

        ordered = sorted(
            cds_records,
            key=lambda x: x["start"],
            reverse=True
        )

        offset = 0

        for cds in ordered:

            if cds["start"] <= pos <= cds["end"]:

                return (
                    offset
                    + (cds["end"] - pos)
                )

            offset += (
                cds["end"]
                - cds["start"]
                + 1
            )

    return None


def annotate_variant(
    chrom,
    pos,
    ref,
    alt,
    cds_sequences
):

    genes, transcripts, cds_records = load_gff_region(
        chrom,
        pos,
        pos
    )

    candidates = find_transcript_for_variant(
        pos,
        genes,
        transcripts,
        cds_records
    )

    if not candidates:

        return {
            "gene": None,
            "transcript": None,
            "proteinId": None,
            "consequence": "non-coding",
            "refCodon": None,
            "altCodon": None,
            "proteinChange": None,
        }

    for transcript, transcript_cds in candidates:

        strand = transcript["strand"]

        protein_id = extract_protein_id(
            transcript_cds,
            transcript["attributes"].get("ID")
        )

        if not protein_id:
            continue

        cds_sequence = cds_sequences.get(
            protein_id
        )

        if not cds_sequence:
            continue

        offset = cds_offset_for_position(
            pos,
            transcript_cds,
            strand
        )

        if offset is None:
            continue

        if len(ref) != 1 or len(alt) != 1:
            consequence = "complex_variant"

            return {
                "gene": transcript["attributes"].get(
                    "Parent"
                ),
                "transcript": transcript["attributes"].get(
                    "ID"
                ),
                "proteinId": protein_id,
                "consequence": consequence,
                "refCodon": None,
                "altCodon": None,
                "proteinChange": None,
            }

        genomic_ref = ref.upper()
        genomic_alt = alt.upper()

        if strand == "-":

            cds_ref = reverse_complement(
                genomic_ref
            )

            cds_alt = reverse_complement(
                genomic_alt
            )

        else:

            cds_ref = genomic_ref
            cds_alt = genomic_alt

        cds_index = offset

        if cds_index >= len(cds_sequence):

            continue

        expected_ref = cds_sequence[
            cds_index
        ].upper()

        if expected_ref != cds_ref:

            continue

        codon_start = (
            cds_index // 3
        ) * 3

        ref_codon = cds_sequence[
            codon_start:codon_start + 3
        ].upper()

        if len(ref_codon) != 3:
            continue

        codon_list = list(ref_codon)

        codon_list[
            cds_index % 3
        ] = cds_alt

        alt_codon = "".join(codon_list)

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

        gene_id = transcript["attributes"].get(
            "Parent"
        )

        return {
            "gene": gene_id,
            "transcript": transcript["attributes"].get(
                "ID"
            ),
            "proteinId": protein_id,
            "consequence": consequence,
            "refCodon": ref_codon,
            "altCodon": alt_codon,
            "proteinChange": (
                f"{ref_aa}>{alt_aa}"
            ),
        }

    return {
        "gene": None,
        "transcript": None,
        "proteinId": None,
        "consequence": "unresolved",
        "refCodon": None,
        "altCodon": None,
        "proteinChange": None,
    }


def extract_region(
    vcf,
    chrom,
    start,
    end
):

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
            "bcftools is not available."
        )

    except subprocess.CalledProcessError as exc:

        sys.stderr.write(exc.stderr)

        raise SystemExit(
            f"bcftools failed with exit code "
            f"{exc.returncode}"
        )

    return result.stdout


def main():

    parser = argparse.ArgumentParser()

    parser.add_argument("--vcf", required=True)
    parser.add_argument("--chrom", required=True)
    parser.add_argument("--start", required=True, type=int)
    parser.add_argument("--end", required=True, type=int)

    args = parser.parse_args()

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

    vcf_text = extract_region(
        args.vcf,
        args.chrom,
        args.start,
        args.end
    )

    cds_sequences = load_cds_sequences()

    variants = []

    for line in vcf_text.splitlines():

        if line.startswith("#"):
            continue

        columns = line.split("\t")

        if len(columns) < 5:
            continue

        chrom = columns[0]
        pos = int(columns[1])
        ref = columns[3]
        alt = columns[4]

        if (
            len(ref) != 1
            or len(alt) != 1
            or alt in {".", "N"}
            or ref in {".", "N"}
        ):
            consequence = {
                "gene": None,
                "transcript": None,
                "proteinId": None,
                "consequence": "complex_variant",
                "refCodon": None,
                "altCodon": None,
                "proteinChange": None,
            }

        else:

            consequence = annotate_variant(
                chrom,
                pos,
                ref,
                alt,
                cds_sequences
            )

        variants.append({
            "chrom": chrom,
            "pos": pos,
            "ref": ref,
            "alt": alt,
            **consequence,
        })

    output = {
        "region": (
            f"{args.chrom}:"
            f"{args.start}-"
            f"{args.end}"
        ),
        "variantCount": len(variants),
        "variants": variants,
    }

    print(
        json.dumps(
            output,
            indent=2
        )
    )


if __name__ == "__main__":
    main()

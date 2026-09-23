#!/usr/bin/env python3

import argparse
import json
import os
import subprocess
import sys


def parse_gt(sample_value, format_keys):

    values = sample_value.split(":")
    data = {}

    for i, key in enumerate(format_keys):
        data[key] = values[i] if i < len(values) else "."

    return data.get("GT", "./.")


def genotype_alt_count(gt):

    if not gt or "." in gt:
        return None

    gt = gt.replace("|", "/")
    alleles = gt.split("/")

    if len(alleles) != 2:
        return None

    try:
        a1 = int(alleles[0])
        a2 = int(alleles[1])
    except ValueError:
        return None

    return a1 + a2


def main():

    parser = argparse.ArgumentParser()

    parser.add_argument("--vcf", required=True)
    parser.add_argument("--chrom", required=True)
    parser.add_argument("--start", required=True, type=int)
    parser.add_argument("--end", required=True, type=int)

    args = parser.parse_args()

    if not os.path.exists(args.vcf):
        raise SystemExit(f"VCF not found: {args.vcf}")

    region = f"{args.chrom}:{args.start}-{args.end}"

    command = [
        "bcftools",
        "view",
        "-r",
        region,
        "-Ov",
        args.vcf
    ]

    try:

        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=True
        )

    except FileNotFoundError:
        raise SystemExit("bcftools is not available.")

    except subprocess.CalledProcessError as exc:

        sys.stderr.write(exc.stderr)

        raise SystemExit(
            f"bcftools failed with exit code {exc.returncode}"
        )

    samples = []
    results = []

    for line in result.stdout.splitlines():

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
        variant_id = columns[2]
        ref = columns[3]
        alt = columns[4]
        format_keys = columns[8].split(":")

        carriers = []
        called_genotypes = 0
        alternate_alleles = 0
        total_alleles = 0

        for sample, sample_value in zip(
            samples,
            columns[9:]
        ):

            gt = parse_gt(
                sample_value,
                format_keys
            )

            alt_count = genotype_alt_count(gt)

            if alt_count is None:
                continue

            called_genotypes += 1
            total_alleles += 2
            alternate_alleles += alt_count

            if alt_count > 0:

                carriers.append({
                    "accession": sample,
                    "genotype": gt,
                    "altAlleles": alt_count
                })

        if total_alleles:

            af = (
                alternate_alleles /
                total_alleles
            )

        else:

            af = None

        carrier_count = len(carriers)

        if carrier_count == 1:
            rarity = "singleton"
        elif carrier_count <= 5:
            rarity = "rare_carrier"
        else:
            rarity = "common_or_nonrare"

        results.append({
            "chrom": chrom,
            "pos": pos,
            "id": variant_id,
            "ref": ref,
            "alt": alt,
            "calledGenotypes": called_genotypes,
            "alternateAlleles": alternate_alleles,
            "totalAlleles": total_alleles,
            "alleleFrequency": af,
            "carrierCount": carrier_count,
            "rarityClass": rarity,
            "carriers": carriers
        })

    output = {
        "region": region,
        "sampleCount": len(samples),
        "variantCount": len(results),
        "variants": results
    }

    print(
        json.dumps(
            output,
            indent=2
        )
    )


if __name__ == "__main__":
    main()

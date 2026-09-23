#!/usr/bin/env python3

import argparse
import json
import os
import subprocess
import sys
import tempfile


def main():

    parser = argparse.ArgumentParser(
        description="Extract a genomic region from a VCF using bcftools."
    )

    parser.add_argument("--vcf", required=True)
    parser.add_argument("--chrom", required=True)
    parser.add_argument("--start", required=True, type=int)
    parser.add_argument("--end", required=True, type=int)

    args = parser.parse_args()

    if not os.path.exists(args.vcf):
        raise SystemExit(f"VCF not found: {args.vcf}")

    if args.start < 1:
        raise SystemExit("Start position must be >= 1.")

    if args.end < args.start:
        raise SystemExit("End position must be >= start position.")

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
        raise SystemExit(
            "bcftools is not installed or is not available in PATH."
        )

    except subprocess.CalledProcessError as exc:

        sys.stderr.write(exc.stderr)

        raise SystemExit(
            f"bcftools region extraction failed with exit code {exc.returncode}."
        )

    variants = []

    samples = []

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
        ref = columns[3]
        alt = columns[4]

        variants.append({
            "chrom": chrom,
            "pos": pos,
            "id": columns[2],
            "ref": ref,
            "alt": alt,
            "qual": columns[5],
            "filter": columns[6],
            "info": columns[7],
            "format": columns[8],
            "genotypes": columns[9:]
        })

    output = {
        "region": region,
        "sampleCount": len(samples),
        "variantCount": len(variants),
        "samples": samples,
        "variants": variants
    }

    print(json.dumps(output))


if __name__ == "__main__":
    main()

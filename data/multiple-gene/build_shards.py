import json
from pathlib import Path
from collections import defaultdict

BASE = Path(__file__).resolve().parents[2]

SOURCE = BASE / "data/multiple-gene/evidence_compact.json"
OUTDIR = BASE / "data/multiple-gene/evidence"

print("Loading compact evidence...")
with open(SOURCE, "r", encoding="utf-8") as f:
    data = json.load(f)

shards = defaultdict(dict)

for gene, item in data["genes"].items():
    chromosome = item.get("c")

    if chromosome:
        shards[chromosome][gene] = item

for chromosome in sorted(shards):
    outfile = OUTDIR / f"{chromosome}.json"

    payload = {
        "reference": data["reference"],
        "chromosome": chromosome,
        "genes": shards[chromosome]
    }

    with open(outfile, "w", encoding="utf-8") as f:
        json.dump(
            payload,
            f,
            separators=(",", ":"),
            ensure_ascii=False
        )

    print(
        chromosome,
        "genes:",
        len(shards[chromosome]),
        "size:",
        round(outfile.stat().st_size / (1024 * 1024), 2),
        "MB"
    )

print("\nDONE")
print("Chromosome shards:", len(shards))

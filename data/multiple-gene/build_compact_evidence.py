import json
from pathlib import Path

BASE = Path(__file__).resolve().parents[2]

SOURCE = BASE / "data/multiple-gene/evidence_index.json"
OUT = BASE / "data/multiple-gene/evidence_compact.json"

print("Loading full evidence index...")

with open(SOURCE, "r", encoding="utf-8") as f:
    data = json.load(f)

genes_out = {}

for gene, item in data["genes"].items():

    annotation = item.get("annotation", {})

    genes_out[gene] = {
        "c": item.get("chromosome"),
        "s": item.get("start"),
        "e": item.get("end"),
        "d": annotation.get("description"),
        "go": item.get("go_terms", []),
        "pf": annotation.get("pfam", []),
        "ko": annotation.get("ko", []),
        "ip": annotation.get("interpro", []),
        "dm": annotation.get("domains", []),
        "tx": item.get("tissue_expression"),
        "rh": item.get("root_hair_expression"),
    }

output = {
    "reference": data["reference"],
    "tissue_conditions": data["expression_sets"]["tissue"],
    "root_hair_conditions": data["expression_sets"]["root_hair"],
    "genes": genes_out,
}

print("Writing compact evidence index...")

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(
        output,
        f,
        separators=(",", ":"),
        ensure_ascii=False
    )

print("DONE")
print("Genes:", len(genes_out))
print("Output:", OUT)
print("Size: %.2f MB" % (OUT.stat().st_size / (1024 * 1024)))

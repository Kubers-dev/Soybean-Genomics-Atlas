import json
import gzip
from pathlib import Path

BASE = Path(__file__).resolve().parents[2]

GENE_INDEX = BASE / "data/a6/gene_index.json"
ANNOTATION = BASE / "data/a6/annotation/candidate_annotation.json.gz"
GO = BASE / "data/a6/annotation/go_associations.json.gz"

TISSUE = BASE / "data/expression_atlas/study2_tissue_expression_rnaseq.json"
ROOT_HAIR = BASE / "data/expression_atlas/study1_root_hair_expression_rnaseq.json"

OUT = BASE / "data/multiple-gene/evidence_index.json"

print("Loading Wm82.a6 gene index...")
with open(GENE_INDEX, "r", encoding="utf-8") as f:
    gene_index = json.load(f)

print("Genes:", len(gene_index))

print("Loading functional annotation...")
with gzip.open(ANNOTATION, "rt", encoding="utf-8") as f:
    annotation = json.load(f)

print("Annotation records:", len(annotation))

print("Loading GO associations...")
with gzip.open(GO, "rt", encoding="utf-8") as f:
    go_data = json.load(f)

gene_to_go = go_data.get("gene_to_terms", {})

print("GO-associated genes:", len(gene_to_go))

print("Loading tissue expression...")
with open(TISSUE, "r", encoding="utf-8") as f:
    tissue_data = json.load(f)

print("Tissue records:", len(tissue_data.get("records", [])))
print("Tissue conditions:", tissue_data.get("conditions", []))

print("Loading root-hair expression...")
with open(ROOT_HAIR, "r", encoding="utf-8") as f:
    root_data = json.load(f)

print("Root-hair records:", len(root_data.get("records", [])))
print("Root-hair conditions:", root_data.get("conditions", []))


def normalize_gene(gene):
    if not gene:
        return None

    gene = str(gene).strip()

    # Remove common Wm82.a6 expression prefix
    prefix = "glyma.Wm82.gnm6.ann1."
    if gene.lower().startswith(prefix.lower()):
        gene = gene[len(prefix):]

    # Convert old non-dotted Glyma IDs when possible
    upper = gene.upper()

    if upper.startswith("GLYMA") and "." not in gene:
        # GLYMA01G000100 -> Glyma.01G000100
        if len(gene) >= 13:
            chrom = gene[5:7]
            number = gene[8:]
            gene = f"Glyma.{chrom}G{number}"

    return gene


def build_expression_lookup(records):
    lookup = {}

    for rec in records:
        a6 = rec.get("a6")

        if not a6:
            continue

        gene = normalize_gene(a6)

        if not gene:
            continue

        lookup[gene] = {
            "tpm": rec.get("tpm", {}),
            "log2tpm": rec.get("log2tpm", {}),
            "zscore": rec.get("zscore", {}),
        }

    return lookup


tissue_lookup = build_expression_lookup(tissue_data.get("records", []))
root_lookup = build_expression_lookup(root_data.get("records", []))

print("Mapped tissue A6 genes:", len(tissue_lookup))
print("Mapped root-hair A6 genes:", len(root_lookup))


def clean_annotation(gene):
    item = annotation.get(gene)

    if not item:
        return {
            "description": None,
            "go": [],
            "pfam": [],
            "panther": [],
            "ko": [],
            "kog": [],
            "ec": [],
            "interpro": [],
            "domains": [],
        }

    def clean_list(value):
        if value is None:
            return []

        if isinstance(value, list):
            return value[:100]

        return [value]

    return {
        "description": item.get("description"),
        "go": clean_list(item.get("go")),
        "pfam": clean_list(item.get("pfam")),
        "panther": clean_list(item.get("panther")),
        "ko": clean_list(item.get("ko")),
        "kog": clean_list(item.get("kog")),
        "ec": clean_list(item.get("ec")),
        "interpro": clean_list(item.get("interpro")),
        "domains": clean_list(item.get("domains")),
    }


genes = {}

for gene, info in gene_index.items():

    tissue = tissue_lookup.get(gene)
    root = root_lookup.get(gene)

    genes[gene] = {
        "gene_id": gene,
        "chromosome": info.get("chromosome"),
        "start": info.get("start"),
        "end": info.get("end"),
        "strand": info.get("strand"),

        "annotation": clean_annotation(gene),

        "go_terms": gene_to_go.get(gene, []),

        "tissue_expression": tissue,
        "root_hair_expression": root,
    }


output = {
    "reference": "Wm82.a6",
    "description": "Evidence index for Multiple Gene Candidate Network analysis.",
    "sources": {
        "gene_index": "data/a6/gene_index.json",
        "functional_annotation": "data/a6/annotation/candidate_annotation.json.gz",
        "go_associations": "data/a6/annotation/go_associations.json.gz",
        "tissue_expression": "data/expression_atlas/study2_tissue_expression_rnaseq.json",
        "root_hair_expression": "data/expression_atlas/study1_root_hair_expression_rnaseq.json",
    },
    "expression_sets": {
        "tissue": tissue_data.get("conditions", []),
        "root_hair": root_data.get("conditions", []),
    },
    "genes": genes,
}

print("Writing:", OUT)

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(output, f, separators=(",", ":"))

print("DONE")
print("Output size:", OUT.stat().st_size / (1024 * 1024), "MB")

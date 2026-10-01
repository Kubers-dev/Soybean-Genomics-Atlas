#!/usr/bin/env python3

import gzip
import json
import urllib.request
from collections import defaultdict
from datetime import datetime
from pathlib import Path

ANNOTATION = Path(
    "data/a6/annotation/candidate_annotation.json.gz"
)

OUTPUT = Path(
    "data/multiple-gene/kegg_pathways.json"
)


def fetch(url):
    print(f"Downloading: {url}")
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Soybean-Genomics-Atlas/1.0"}
    )

    with urllib.request.urlopen(req, timeout=120) as response:
        return response.read().decode("utf-8")


print("=" * 80)
print("BUILDING KEGG PATHWAY INDEX")
print("=" * 80)

with gzip.open(ANNOTATION, "rt", encoding="utf-8") as handle:
    annotation = json.load(handle)

print("A6 annotation genes:", len(annotation))


# ------------------------------------------------------------------
# Gene -> KO
# ------------------------------------------------------------------

gene_to_ko = {}

for gene, record in annotation.items():

    kos = record.get("ko", [])

    if isinstance(kos, str):
        kos = [kos]

    normalized = set()

    for ko in kos:
        ko = str(ko).strip()

        if ko.startswith("ko:"):
            ko = ko[3:]

        if not ko.startswith("K"):
            continue

        if len(ko) == 6:
            normalized.add(ko)

    if normalized:
        gene_to_ko[gene] = sorted(normalized)


print("Genes with KO annotation:", len(gene_to_ko))


# ------------------------------------------------------------------
# KO -> reference KEGG pathways
# ------------------------------------------------------------------

ko_pathway_text = fetch(
    "https://rest.kegg.jp/link/pathway/ko"
)

ko_to_pathways = defaultdict(set)

for line in ko_pathway_text.splitlines():

    parts = line.strip().split("\t")

    if len(parts) != 2:
        continue

    ko_id = parts[0].split(":")[-1]
    pathway_id = parts[1].split(":")[-1]

    if not ko_id.startswith("K"):
        continue

    # Keep reference KEGG pathway maps.
    # These are KO-based and therefore compatible with
    # the KO annotations in the Wm82.a6 annotation set.
    if pathway_id.startswith("map"):
        ko_to_pathways[ko_id].add(pathway_id)


print(
    "KO entries with pathway mappings:",
    len(ko_to_pathways)
)


# ------------------------------------------------------------------
# Pathway names
# ------------------------------------------------------------------

pathway_text = fetch(
    "https://rest.kegg.jp/list/pathway"
)

pathway_names = {}

for line in pathway_text.splitlines():

    parts = line.strip().split("\t", 1)

    if len(parts) != 2:
        continue

    pathway_id = parts[0].split(":")[-1]

    if pathway_id.startswith("map"):
        pathway_names[pathway_id] = parts[1].strip()


print("Reference pathways:", len(pathway_names))


# ------------------------------------------------------------------
# Build pathway -> Wm82.a6 genes
# ------------------------------------------------------------------

pathway_genes = defaultdict(set)
pathway_kos = defaultdict(set)

for gene, kos in gene_to_ko.items():

    for ko in kos:

        for pathway in ko_to_pathways.get(ko, []):

            pathway_genes[pathway].add(gene)
            pathway_kos[pathway].add(ko)


# Remove extremely small pathway sets.
# Enrichment with a pathway containing only one background
# gene is generally not informative.
pathways = {}

for pathway_id, genes in pathway_genes.items():

    if len(genes) < 3:
        continue

    pathways[pathway_id] = {
        "id": pathway_id,
        "name": pathway_names.get(
            pathway_id,
            pathway_id
        ),
        "genes": sorted(genes),
        "kos": sorted(pathway_kos[pathway_id])
    }


background_genes = sorted(
    {
        gene
        for pathway in pathways.values()
        for gene in pathway["genes"]
    }
)


output = {
    "source": "KEGG REST API",
    "organism": "Glycine max",
    "pathway_type": "Reference KEGG pathways mapped through KO",
    "generated_at": datetime.utcnow().isoformat() + "Z",
    "background_definition": (
        "Wm82.a6 genes with KO annotations that map "
        "to reference KEGG pathways."
    ),
    "background_gene_count": len(background_genes),
    "pathway_count": len(pathways),
    "background_genes": background_genes,
    "pathways": pathways
}


OUTPUT.parent.mkdir(
    parents=True,
    exist_ok=True
)

with open(
    OUTPUT,
    "w",
    encoding="utf-8"
) as handle:

    json.dump(
        output,
        handle,
        separators=(",", ":")
    )


print()
print("=" * 80)
print("KEGG PATHWAY INDEX COMPLETE")
print("=" * 80)
print("Output:", OUTPUT)
print("Background genes:", len(background_genes))
print("Pathways:", len(pathways))
print("=" * 80)

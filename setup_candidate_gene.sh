#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

echo "=== Soybean Genomics Atlas: Candidate Gene (Wm82.a6.v1) ==="

# The existing GWAS Analysis and Online GWAS implementations are not edited by this script.
if [ -f index.html ]; then
  cp -n index.html index.html.before-candidate-gene 2>/dev/null || true
fi

mkdir -p css js data/a6

# Copy the new standalone module if this setup package is used from the repository root.
cp candidate-gene.html candidate-gene.html.tmp
mv candidate-gene.html.tmp candidate-gene.html
cp js/candidate-gene.js js/candidate-gene.js.tmp
mv js/candidate-gene.js.tmp js/candidate-gene.js
cp css/candidate-gene.css css/candidate-gene.css.tmp
mv css/candidate-gene.css.tmp css/candidate-gene.css

# Add the navigation item exactly once.
python3 - <<'PY'
from pathlib import Path
p = Path("index.html")
s = p.read_text()
link = '<a href="candidate-gene.html">Candidate Gene</a>'
if 'href="candidate-gene.html"' not in s:
    marker = '<a href="online-gwas.html">Online GWAS</a>'
    if marker in s:
        s = s.replace(marker, marker + "\n\n    " + link, 1)
    else:
        marker2 = '</nav>'
        if marker2 not in s:
            raise SystemExit("Could not find the main navigation in index.html")
        s = s.replace(marker2, "    " + link + "\n  " + marker2, 1)
    p.write_text(s)
    print("Added Candidate Gene to index.html")
else:
    print("Candidate Gene navigation already exists")
PY

# Try to locate an existing Wm82.gnm6.ann1 gene-model GFF/GFF3/BED file.
ANNOT=""
for f in \
  data/a6/annotation/*gene_models_main.gff3 \
  data/a6/annotation/*gene_models_main.gff3.gz \
  data/a6/*gene_models_main.gff3 \
  data/a6/*gene_models_main.gff3.gz \
  annotation/a6/*gene_models_main.gff3 \
  annotation/a6/*gene_models_main.gff3.gz \
  data/a6/genes.gff3 \
  data/a6/genes.gff3.gz \
  data/a6/genes.gff \
  data/a6/genes.bed \
  data/a6/genes.tsv; do
  if [ -f "$f" ]; then ANNOT="$f"; break; fi
done

if [ -z "$ANNOT" ]; then
  echo
  echo "No local Wm82.a6.v1 gene annotation was found."
  echo "Download the official Wm82.gnm6.ann1.PKSW gene-model file from SoyBase:"
  echo "https://data.soybase.org/Glycine/max/annotations/Wm82.gnm6.ann1.PKSW/glyma.Wm82.gnm6.ann1.PKSW.gene_models_main.gff3.gz"
  echo
  echo "Then place it at:"
  echo "data/a6/glyma.Wm82.gnm6.ann1.PKSW.gene_models_main.gff3.gz"
  echo "and run:"
  echo "python3 build_candidate_gene_index.py"
  exit 0
fi

echo "Found annotation: $ANNOT"

python3 - "$ANNOT" <<'PY'
import gzip, json, re, sys
from pathlib import Path

src = Path(sys.argv[1])
out = Path("data/a6/candidate-gene-annotation.json")

def opener(p):
    return gzip.open(p, "rt") if str(p).endswith(".gz") else open(p, "r")

def attr(attrs, *keys):
    d = {}
    for part in attrs.split(";"):
        if "=" in part:
            k,v = part.split("=",1)
            d[k.strip()] = v.strip().strip('"')
    for k in keys:
        if d.get(k):
            return d[k]
    return ""

records = []
with opener(src) as fh:
    for line in fh:
        if not line.strip() or line.startswith("#"):
            continue
        f = line.rstrip("\n").split("\t")
        if len(f) < 9:
            continue
        seqid, source, typ, start, end, score, strand, phase, attrs = f
        if typ.lower() != "gene":
            continue
        m = re.search(r'(\d{1,2})$', seqid)
        if not m:
            m = re.search(r'(\d{1,2})$', seqid.replace("Chr","").replace("chr",""))
        if not m:
            continue
        chrn = int(m.group(1))
        if not 1 <= chrn <= 20:
            continue
        gene_id = attr(attrs, "ID", "gene_id", "locus_tag", "Name")
        gene_name = attr(attrs, "Name", "gene_name", "gene")
        if gene_id.startswith("gene:"):
            gene_id = gene_id[5:]
        records.append({
            "id": gene_id,
            "chr": str(chrn),
            "start": int(start),
            "end": int(end),
            "strand": strand,
            "name": gene_name if gene_name != gene_id else ""
        })

records.sort(key=lambda x:(int(x["chr"]), x["start"], x["end"]))
out.write_text(json.dumps(records, separators=(",",":")))
print(f"Wrote {len(records):,} genes to {out}")
PY

echo
echo "Candidate Gene tab setup complete."
echo "Open candidate-gene.html locally to test."
echo "Do NOT modify the existing GWAS Analysis or Online GWAS files."

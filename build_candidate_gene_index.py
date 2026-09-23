#!/usr/bin/env python3
"""Build the compact browser index for Wm82.a6.v1 candidate-gene search.

Usage:
  python3 build_candidate_gene_index.py path/to/gene_models_main.gff3.gz

If no argument is supplied, the script searches common repository locations.
"""
import gzip, json, re, sys
from pathlib import Path

root = Path(__file__).resolve().parent
candidates = [
    root/"data/a6/glyma.Wm82.gnm6.ann1.PKSW.gene_models_main.gff3.gz",
    root/"data/a6/glyma.Wm82.gnm6.ann1.PKSW.gene_models_main.gff3",
    root/"data/a6/annotation/glyma.Wm82.gnm6.ann1.PKSW.gene_models_main.gff3.gz",
    root/"data/a6/annotation/glyma.Wm82.gnm6.ann1.PKSW.gene_models_main.gff3",
]
src = Path(sys.argv[1]) if len(sys.argv) > 1 else next((p for p in candidates if p.exists()), None)
if not src or not src.exists():
    raise SystemExit("Annotation file not found. Supply the Wm82.gnm6.ann1 gene_models_main.gff3(.gz) path.")

def op(p):
    return gzip.open(p, "rt") if str(p).endswith(".gz") else open(p)

def attrs(s):
    d={}
    for x in s.split(";"):
        if "=" in x:
            k,v=x.split("=",1)
            d[k]=v.strip('"')
    return d

out=[]
with op(src) as fh:
    for line in fh:
        if not line.strip() or line.startswith("#"): continue
        f=line.rstrip("\n").split("\t")
        if len(f)!=9 or f[2].lower()!="gene": continue
        seqid,_,_,start,end,_,strand,_,a=f
        m=re.search(r'(\d{1,2})$', seqid.replace("Chr","").replace("chr",""))
        if not m: continue
        c=int(m.group(1))
        if not 1<=c<=20: continue
        d=attrs(a)
        gid=d.get("ID") or d.get("gene_id") or d.get("locus_tag") or d.get("Name") or ""
        gid=gid.removeprefix("gene:")
        out.append({"id":gid,"chr":str(c),"start":int(start),"end":int(end),
                    "strand":strand,"name":d.get("Name") or d.get("gene_name") or ""})
out.sort(key=lambda x:(int(x["chr"]),x["start"],x["end"]))
dest=root/"data/a6/candidate-gene-annotation.json"
dest.parent.mkdir(parents=True,exist_ok=True)
dest.write_text(json.dumps(out,separators=(",",":")))
print(f"{len(out):,} genes written to {dest}")

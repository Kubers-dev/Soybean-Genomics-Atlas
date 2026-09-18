#!/usr/bin/env python3
"""
Local bridge for the static Soybean Genomics Atlas GWAS tab.
Browser -> Python multipart upload -> R/rMVP -> XLSX/TSV/plots.
Run from the repository root.
"""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import cgi, json, os, shutil, subprocess, tempfile, urllib.parse

ROOT = Path(__file__).resolve().parent
R_SCRIPT = ROOT / "gwas_backend.R"
PORT = 8765

class H(BaseHTTPRequestHandler):
    def send_json(self, obj, code=200):
        b=json.dumps(obj).encode()
        self.send_response(code); self.send_header("Content-Type","application/json")
        self.send_header("Access-Control-Allow-Origin","*"); self.send_header("Content-Length",str(len(b))); self.end_headers(); self.wfile.write(b)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin","*")
        self.send_header("Access-Control-Allow-Methods","POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers","Content-Type")
        self.end_headers()

    def do_POST(self):
        if self.path != "/run-gwas":
            return self.send_json({"error":"Not found"},404)
        try:
            form=cgi.FieldStorage(fp=self.rfile, headers=self.headers,
                                  environ={"REQUEST_METHOD":"POST","CONTENT_TYPE":self.headers.get("Content-Type","")})
            required=["phenotype","genotype","map","traits","models","structure","threshold"]
            missing=[x for x in required if x not in form]
            if missing: return self.send_json({"error":"Missing: "+", ".join(missing)},400)
            traits=[x for x in form.getfirst("traits").split(",") if x]
            models=[x for x in form.getfirst("models").split(",") if x]
            if len(traits)>8: return self.send_json({"error":"Maximum 8 traits per GWAS run."},400)
            threshold=form.getfirst("threshold")
            with tempfile.TemporaryDirectory(prefix="soybean_gwas_") as td:
                td=Path(td)
                for key, name in [("phenotype","phenotype.txt"),("genotype","genotype.txt"),("map","map.txt")]:
                    item=form[key]
                    with open(td/name,"wb") as f: shutil.copyfileobj(item.file,f)
                out=td/"results"; out.mkdir()
                cmd=["Rscript",str(R_SCRIPT),str(td/"phenotype.txt"),str(td/"genotype.txt"),str(td/"map.txt"),
                     str(out),",".join(traits),",".join(models),form.getfirst("structure"),threshold]
                p=subprocess.run(cmd,capture_output=True,text=True,timeout=7200)
                if p.returncode!=0:
                    return self.send_json({"error":p.stderr[-12000:] or p.stdout[-12000:]},500)
                xlsx=out/"GWAS_results.xlsx"
                if not xlsx.exists(): return self.send_json({"error":"rMVP did not create GWAS_results.xlsx","log":p.stdout[-4000:]},500)
                # Return workbook as base64 so the browser can download it without exposing filesystem paths.
                import base64
                payload=base64.b64encode(xlsx.read_bytes()).decode()
                meta=json.loads(p.stdout.strip().splitlines()[-1])
                meta["xlsx_base64"]=payload
                return self.send_json(meta)
        except Exception as e:
            return self.send_json({"error":repr(e)},500)

if __name__=="__main__":
    print(f"GWAS backend listening on http://127.0.0.1:{PORT}")
    ThreadingHTTPServer(("127.0.0.1",PORT),H).serve_forever()

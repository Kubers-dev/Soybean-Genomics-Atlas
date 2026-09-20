#!/usr/bin/env python3

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from email.parser import BytesParser
from email.policy import default
import json
import mimetypes
import os
import re
import shutil
import subprocess
import tempfile
import time
import uuid

ROOT = Path(__file__).resolve().parent
MASTER_R = ROOT / "GWAS_R_EDITOR.R"
RUNS_DIR = ROOT / "gwas_runs"
PORT = 8765
TIMEOUT_SECONDS = 7200

RUNS_DIR.mkdir(parents=True, exist_ok=True)


def r_quote(path):
    return json.dumps(str(Path(path).resolve()))


def prepare_r_code(code, phenotype_path, genotype_path, output_dir):
    """
    Preserve the supplied R code and replace only the three path assignments.
    No GWAS calculations are performed here.
    """
    replacements = {
        "PHENOTYPE_FILE": phenotype_path,
        "GENOTYPE_FILE": genotype_path,
        "OUTPUT_DIR": output_dir,
    }

    lines = code.splitlines()

    for i, line in enumerate(lines):
        for variable, value in replacements.items():
            if re.match(r"^\s*" + re.escape(variable) + r"\s*<-", line):
                lines[i] = f'{variable} <- {r_quote(value)}'

    return "\n".join(lines) + "\n"


class GWASHandler(BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        print("[GWAS]", fmt % args)

    def send_json(self, obj, status=200):
        payload = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def send_text(self, text, content_type="text/plain; charset=utf-8", status=200):
        payload = text.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed = self.path.split("?", 1)[0]

        if parsed == "/editor-code":
            if not MASTER_R.exists():
                return self.send_json({"error": "GWAS_R_EDITOR.R not found."}, 404)

            return self.send_text(
                MASTER_R.read_text(encoding="utf-8"),
                "text/plain; charset=utf-8"
            )

        if parsed == "/health":
            return self.send_json({
                "status": "ok",
                "r_script": MASTER_R.exists(),
                "rscript": shutil.which("Rscript") is not None
            })

        if parsed.startswith("/result/"):
            return self.serve_result(parsed[len("/result/"):])

        return self.send_json({"error": "Not found"}, 404)

    def serve_result(self, target):
        parts = target.split("/", 1)

        if len(parts) != 2:
            return self.send_json({"error": "Invalid result path."}, 400)

        run_id, relative = parts

        if not re.fullmatch(r"[A-Za-z0-9_-]+", run_id):
            return self.send_json({"error": "Invalid run ID."}, 400)

        run_dir = (RUNS_DIR / run_id).resolve()
        file_path = (run_dir / relative).resolve()

        if run_dir not in file_path.parents:
            return self.send_json({"error": "Invalid result path."}, 400)

        if not file_path.is_file():
            return self.send_json({"error": "Result file not found."}, 404)

        mime, _ = mimetypes.guess_type(str(file_path))
        mime = mime or "application/octet-stream"

        data = file_path.read_bytes()

        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Disposition",
                         f'attachment; filename="{file_path.name}"')
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        if self.path != "/run-r":
            return self.send_json({"error": "Not found"}, 404)

        started = time.time()
        run_id = uuid.uuid4().hex[:12]
        run_dir = RUNS_DIR / run_id
        input_dir = run_dir / "input"
        output_dir = run_dir / "results"

        try:
            content_type = self.headers.get("Content-Type", "")
            if "multipart/form-data" not in content_type:
                return self.send_json(
                    {"error": "Expected multipart/form-data."}, 400
                )

            length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(length)

            message = BytesParser(policy=default).parsebytes(
                b"Content-Type: " + content_type.encode() +
                b"\r\n\r\n" + body
            )

            fields = {}

            for part in message.iter_parts():
                name = part.get_param("name", header="Content-Disposition")
                if not name:
                    continue

                filename = part.get_filename()
                data = part.get_payload(decode=True) or b""

                fields[name] = {
                    "filename": filename,
                    "data": data
                }

            required = ["phenotype", "genotype", "code"]
            missing = [x for x in required if x not in fields]

            if missing:
                return self.send_json(
                    {"error": "Missing: " + ", ".join(missing)}, 400
                )

            input_dir.mkdir(parents=True, exist_ok=True)
            output_dir.mkdir(parents=True, exist_ok=True)

            phenotype_name = fields["phenotype"]["filename"] or "phenotype.xlsx"
            genotype_name = fields["genotype"]["filename"] or "genotype.hmp.txt"

            phenotype_path = input_dir / Path(phenotype_name).name
            genotype_path = input_dir / Path(genotype_name).name
            execution_r = input_dir / "GWAS_R_EXECUTION.R"

            phenotype_path.write_bytes(fields["phenotype"]["data"])
            genotype_path.write_bytes(fields["genotype"]["data"])

            submitted_code = fields["code"]["data"].decode(
                "utf-8", errors="replace"
            )

            execution_code = prepare_r_code(
                submitted_code,
                phenotype_path,
                genotype_path,
                output_dir
            )

            execution_r.write_text(
                execution_code,
                encoding="utf-8"
            )

            print(f"[GWAS] Run {run_id}")
            print(f"[GWAS] Phenotype: {phenotype_path}")
            print(f"[GWAS] Genotype:  {genotype_path}")
            print(f"[GWAS] Output:    {output_dir}")

            process = subprocess.run(
                [
                    "Rscript",
                    "--vanilla",
                    str(execution_r)
                ],
                cwd=str(output_dir),
                capture_output=True,
                text=True,
                timeout=TIMEOUT_SECONDS
            )

            elapsed = time.time() - started

            stdout_path = run_dir / "stdout.log"
            stderr_path = run_dir / "stderr.log"

            stdout_path.write_text(
                process.stdout or "",
                encoding="utf-8",
                errors="replace"
            )

            stderr_path.write_text(
                process.stderr or "",
                encoding="utf-8",
                errors="replace"
            )

            files = []

            if output_dir.exists():
                for p in sorted(output_dir.rglob("*")):
                    if p.is_file():
                        files.append({
                            "name": p.name,
                            "path": str(p.relative_to(output_dir)),
                            "url": f"/result/{run_id}/results/{p.relative_to(output_dir).as_posix()}",
                            "size": p.stat().st_size
                        })

            result = {
                "status": "ok" if process.returncode == 0 else "error",
                "run_id": run_id,
                "exit_code": process.returncode,
                "runtime_seconds": round(elapsed, 3),
                "files": files,
                "stdout": process.stdout or "",
                "stderr": process.stderr or ""
            }

            return self.send_json(
                result,
                200 if process.returncode == 0 else 500
            )

        except subprocess.TimeoutExpired:
            return self.send_json({
                "status": "error",
                "run_id": run_id,
                "error": f"R execution exceeded {TIMEOUT_SECONDS} seconds."
            }, 500)

        except Exception as e:
            return self.send_json({
                "status": "error",
                "run_id": run_id,
                "error": repr(e)
            }, 500)


if __name__ == "__main__":
    print(f"Soybean Genomics Atlas GWAS R bridge")
    print(f"R script: {MASTER_R}")
    print(f"Runs:     {RUNS_DIR}")
    print(f"Listening: http://127.0.0.1:{PORT}")
    ThreadingHTTPServer(("127.0.0.1", PORT), GWASHandler).serve_forever()

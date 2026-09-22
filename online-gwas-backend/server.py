import os
import re
import shutil
import subprocess
import tempfile
import time
import uuid
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

app = Flask(__name__)

BASE_DIR = Path(__file__).resolve().parent
MASTER_R = BASE_DIR / "GWAS_R_EDITOR.R"

MAX_FILE_SIZE = 500 * 1024 * 1024
RUN_TIMEOUT = 3600


@app.get("/health")
def health():
    rscript = shutil.which("Rscript")

    return jsonify({
        "status": "ok",
        "rscript": bool(rscript),
        "master_r_script": MASTER_R.exists(),
        "r_version": subprocess.run(
            ["Rscript", "--version"],
            capture_output=True,
            text=True
        ).stderr.strip()
    })


def replace_assignment(code, variable, value):
    pattern = rf'(?m)^{re.escape(variable)}\s*<-\s*.*$'
    replacement = f'{variable} <- {value!r}'

    new_code, count = re.subn(pattern, replacement, code)

    if count != 1:
        raise RuntimeError(
            f"Expected exactly one {variable} assignment, found {count}."
        )

    return new_code


@app.post("/run")
def run_gwas():

    if not MASTER_R.exists():
        return jsonify({
            "status": "error",
            "error": "GWAS_R_EDITOR.R is missing from the backend."
        }), 500

    phenotype = request.files.get("phenotype")
    genotype = request.files.get("genotype")

    if phenotype is None or genotype is None:
        return jsonify({
            "status": "error",
            "error": "Both phenotype and genotype files are required."
        }), 400

    run_id = uuid.uuid4().hex
    run_dir = Path(tempfile.mkdtemp(prefix=f"online_gwas_{run_id}_"))

    phenotype_path = run_dir / Path(phenotype.filename).name
    genotype_path = run_dir / Path(genotype.filename).name
    output_dir = run_dir / "results"
    output_dir.mkdir()

    try:
        phenotype.save(phenotype_path)
        genotype.save(genotype_path)

        if phenotype_path.stat().st_size > MAX_FILE_SIZE:
            raise RuntimeError("Phenotype file exceeds the 500 MB limit.")

        if genotype_path.stat().st_size > MAX_FILE_SIZE:
            raise RuntimeError("Genotype file exceeds the 500 MB limit.")

        code = MASTER_R.read_text()

        code = replace_assignment(
            code,
            "PHENOTYPE_FILE",
            str(phenotype_path)
        )

        code = replace_assignment(
            code,
            "GENOTYPE_FILE",
            str(genotype_path)
        )

        code = replace_assignment(
            code,
            "OUTPUT_DIR",
            str(output_dir)
        )

        execution_script = run_dir / "execution.R"
        execution_script.write_text(code)

        start = time.time()

        completed = subprocess.run(
            ["Rscript", "--vanilla", str(execution_script)],
            cwd=run_dir,
            capture_output=True,
            text=True,
            timeout=RUN_TIMEOUT
        )

        runtime = round(time.time() - start, 2)

        files = []

        for path in output_dir.rglob("*"):
            if path.is_file():
                files.append({
                    "name": path.name,
                    "relative_path": str(path.relative_to(output_dir))
                })

        return jsonify({
            "status": "ok" if completed.returncode == 0 else "error",
            "run_id": run_id,
            "exit_code": completed.returncode,
            "runtime_seconds": runtime,
            "files": files,
            "stdout": completed.stdout,
            "stderr": completed.stderr
        })

    except subprocess.TimeoutExpired as exc:
        return jsonify({
            "status": "error",
            "run_id": run_id,
            "error": "GWAS exceeded the 60-minute execution limit.",
            "stdout": exc.stdout or "",
            "stderr": exc.stderr or ""
        }), 504

    except Exception as exc:
        return jsonify({
            "status": "error",
            "run_id": run_id,
            "error": str(exc)
        }), 500


@app.get("/")
def root():
    return jsonify({
        "service": "Soybean Genomics Atlas Online GWAS",
        "status": "running"
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "10000"))

    app.run(
        host="0.0.0.0",
        port=port
    )

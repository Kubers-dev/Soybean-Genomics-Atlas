import csv
import json
import os
import re
import shutil
import subprocess
import time
import uuid
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS


BASE = Path(__file__).resolve().parent
RUNS = BASE / "runs"
RUNS.mkdir(exist_ok=True)

R_SCRIPT = BASE / "GWAS_R_ONLINE.R"

ALLOWED_MODELS = {
    "GLM",
    "MLM",
    "FarmCPU",
}

app = Flask(__name__)
CORS(app)


@app.get("/health")
@app.get("/api/gwas/health")
def health():
    return jsonify(
        status="ok",
        r_script=R_SCRIPT.exists(),
        rscript=shutil.which("Rscript") is not None,
    )


def parse_summary(output_dir):
    summary_file = output_dir / "online_summary.tsv"

    traits = []

    if summary_file.exists():
        with summary_file.open(
            "r",
            encoding="utf-8",
            errors="replace",
        ) as fh:
            reader = csv.DictReader(
                fh,
                delimiter="\t",
            )

            for row in reader:
                traits.append(
                    {
                        "trait": row.get("Trait", ""),
                        "n": int(float(row["N"]))
                        if row.get("N")
                        else None,
                        "markers": int(float(row["Markers"]))
                        if row.get("Markers")
                        else None,
                        "models": [
                            x.strip()
                            for x in row.get("Models", "").split(",")
                            if x.strip()
                        ],
                        "status": row.get("Status", ""),
                        "runtime_seconds": float(
                            row["Runtime_seconds"]
                        )
                        if row.get("Runtime_seconds")
                        else None,
                        "error": row.get("Error", ""),
                    }
                )

    runtime_seconds = None

    runtime_file = output_dir / "runtime_summary.txt"

    if runtime_file.exists():
        text = runtime_file.read_text(
            encoding="utf-8",
            errors="replace",
        )

        match = re.search(
            r"Runtime_seconds:\s*([0-9.]+)",
            text,
        )

        if match:
            runtime_seconds = float(match.group(1))

    return {
        "traits": traits,
        "runtime_seconds": runtime_seconds,
    }


@app.post("/api/gwas/run")
def run_gwas():

    phenotype_file = request.files.get("phenotype")
    genotype_file = request.files.get("genotype")

    if not phenotype_file or not genotype_file:
        return jsonify(
            error="Both phenotype and genotype files are required."
        ), 400

    try:
        models = json.loads(
            request.form.get(
                "models",
                '["GLM","MLM","FarmCPU"]',
            )
        )
    except Exception:
        return jsonify(
            error="Invalid models selection."
        ), 400

    if not isinstance(models, list):
        return jsonify(
            error="Models must be a JSON array."
        ), 400

    models = [
        str(x)
        for x in models
        if str(x) in ALLOWED_MODELS
    ]

    if not models:
        return jsonify(
            error="Select at least one supported GWAS model."
        ), 400

    run_id = uuid.uuid4().hex[:12]

    root = RUNS / run_id
    input_dir = root / "input"
    output_dir = root / "results"

    input_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    output_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    phenotype_path = (
        input_dir
        / Path(
            phenotype_file.filename
            or "phenotype.xlsx"
        ).name
    )

    genotype_path = (
        input_dir
        / Path(
            genotype_file.filename
            or "genotype.hmp.txt"
        ).name
    )

    phenotype_file.save(phenotype_path)
    genotype_file.save(genotype_path)

    command = [
        "Rscript",
        "--vanilla",
        str(R_SCRIPT),
        str(phenotype_path),
        str(genotype_path),
        str(output_dir),
        ",".join(models),
    ]

    start = time.time()

    try:

        completed = subprocess.run(
            command,
            cwd=root,
            capture_output=True,
            text=True,
            timeout=1800,
        )

    except subprocess.TimeoutExpired:

        return jsonify(
            error="GWAS exceeded the 30-minute limit.",
            run_id=run_id,
        ), 504

    wall_runtime = round(
        time.time() - start,
        2,
    )

    (root / "stdout.log").write_text(
        completed.stdout or "",
        encoding="utf-8",
    )

    (root / "stderr.log").write_text(
        completed.stderr or "",
        encoding="utf-8",
    )

    if completed.returncode != 0:

        return jsonify(
            error="R/rMVP execution failed.",
            run_id=run_id,
            stderr=(completed.stderr or "")[-8000:],
        ), 500

    summary = parse_summary(output_dir)

    files = []

    for file_path in output_dir.rglob("*"):

        if not file_path.is_file():
            continue

        relative = file_path.relative_to(
            output_dir
        ).as_posix()

        files.append(
            {
                "name": file_path.name,
                "path": relative,
                "url": (
                    f"/api/gwas/result/"
                    f"{run_id}/{relative}"
                ),
            }
        )

    return jsonify(
        status="ok",
        run_id=run_id,
        models=models,
        runtime_seconds=(
            summary["runtime_seconds"]
            if summary["runtime_seconds"] is not None
            else wall_runtime
        ),
        wall_runtime_seconds=wall_runtime,
        traits=summary["traits"],
        individuals=(
            summary["traits"][0]["n"]
            if summary["traits"]
            else None
        ),
        markers=(
            summary["traits"][0]["markers"]
            if summary["traits"]
            else None
        ),
        files=files,
    )


@app.get("/api/gwas/result/<rid>/<path:name>")
def result(rid, name):

    result_dir = RUNS / rid / "results"

    requested = result_dir / name

    if not requested.exists():
        return jsonify(
            error="Result file not found."
        ), 404

    return send_from_directory(
        result_dir,
        name,
        as_attachment=True,
    )


if __name__ == "__main__":

    app.run(
        host="0.0.0.0",
        port=int(
            os.environ.get(
                "PORT",
                "8000",
            )
        ),
    )

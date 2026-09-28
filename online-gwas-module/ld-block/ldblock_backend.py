from __future__ import annotations

import os
import re
import shutil
import subprocess
import uuid
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS


# ============================================================
# Soybean Genomics Atlas
# Online GWAS - LD Block backend
#
# Uses:
#   LDBlockShow
#   ShowLDSVG
#   rsvg-convert
#
# This backend is isolated from the existing GWAS Analysis
# implementation.
# ============================================================

APP_DIR = Path(__file__).resolve().parent

RUNS_DIR = APP_DIR / "runs"
RUNS_DIR.mkdir(parents=True, exist_ok=True)

LDBLOCK_BIN = Path(
    "/mnt/g/soybean_atlas/tools/bin/LDBlockShow"
)

SHOWLD_BIN = Path(
    "/mnt/g/soybean_atlas/tools/bin/ShowLDSVG"
)

RSVG_BIN = Path("/usr/bin/rsvg-convert")


app = Flask(__name__)
CORS(app)


REGION_RE = re.compile(
    r"^[^:\s]+:[0-9]+-[0-9]+$"
)

SAFE_NAME_RE = re.compile(
    r"[^A-Za-z0-9._-]+"
)


# ============================================================
# Utilities
# ============================================================

def safe_filename(name: str, fallback: str) -> str:
    clean = SAFE_NAME_RE.sub(
        "_",
        Path(name).name
    ).strip("._")

    return clean or fallback


def save_upload(
    field: str,
    out_dir: Path,
    required: bool = False
):
    f = request.files.get(field)

    if not f or not f.filename:
        if required:
            raise ValueError(
                f"Missing required file: {field}"
            )
        return None

    name = safe_filename(
        f.filename,
        field
    )

    path = out_dir / name

    f.save(path)

    return path


def dependency_status():

    return {
        "LDBlockShow": (
            str(LDBLOCK_BIN)
            if LDBLOCK_BIN.exists()
            and os.access(LDBLOCK_BIN, os.X_OK)
            else None
        ),

        "ShowLDSVG": (
            str(SHOWLD_BIN)
            if SHOWLD_BIN.exists()
            and os.access(SHOWLD_BIN, os.X_OK)
            else None
        ),

        "rsvg-convert": (
            str(RSVG_BIN)
            if RSVG_BIN.exists()
            and os.access(RSVG_BIN, os.X_OK)
            else None
        ),

        "ready": (
            LDBLOCK_BIN.exists()
            and os.access(LDBLOCK_BIN, os.X_OK)
            and SHOWLD_BIN.exists()
            and os.access(SHOWLD_BIN, os.X_OK)
            and RSVG_BIN.exists()
            and os.access(RSVG_BIN, os.X_OK)
        ),
    }


def run_command(
    cmd,
    log_path: Path
):

    with log_path.open(
        "a",
        encoding="utf-8"
    ) as fh:

        fh.write(
            "\n$ "
            + " ".join(map(str, cmd))
            + "\n\n"
        )

        proc = subprocess.run(
            cmd,
            stdout=fh,
            stderr=subprocess.STDOUT,
            text=True
        )

    return proc.returncode


# ============================================================
# Dependency check
# ============================================================

@app.get("/api/ldblock/check")
def check():

    return jsonify(
        dependency_status()
    )


# ============================================================
# LD Block analysis
# ============================================================

@app.post("/api/ldblock/run")
def run_ldblock():

    deps = dependency_status()

    if not deps["ready"]:

        return jsonify({
            "ok": False,
            "error": (
                "LDBlockShow, ShowLDSVG, "
                "or rsvg-convert is unavailable."
            ),
            "dependencies": deps,
        }), 400


    # --------------------------------------------------------
    # Region
    # --------------------------------------------------------

    region = (
        request.form.get("region")
        or ""
    ).strip()


    if not REGION_RE.fullmatch(region):

        return jsonify({
            "ok": False,
            "error": (
                "Region must use the format "
                "chr:start-end, for example "
                "chr11:24142640-24142760."
            )
        }), 400


    try:

        start = int(
            region
            .rsplit(":", 1)[1]
            .split("-", 1)[0]
        )

        end = int(
            region
            .rsplit(":", 1)[1]
            .split("-", 1)[1]
        )

        if start >= end:
            raise ValueError

    except ValueError:

        return jsonify({
            "ok": False,
            "error": (
                "Region start must be smaller "
                "than region end."
            )
        }), 400


    # --------------------------------------------------------
    # Create run directory
    # --------------------------------------------------------

    run_id = uuid.uuid4().hex[:12]

    out_dir = (
        RUNS_DIR
        / run_id
    )

    out_dir.mkdir(
        parents=True,
        exist_ok=True
    )


    log = (
        out_dir
        / "ldblock.log"
    )


    try:

        vcf = save_upload(
            "vcf",
            out_dir,
            required=True
        )

        gwas = save_upload(
            "gwas",
            out_dir,
            required=False
        )

        gff = save_upload(
            "gff",
            out_dir,
            required=False
        )

    except ValueError as e:

        shutil.rmtree(
            out_dir,
            ignore_errors=True
        )

        return jsonify({
            "ok": False,
            "error": str(e)
        }), 400


    # --------------------------------------------------------
    # Parameters supported by this LDBlockShow build
    # --------------------------------------------------------

    selevar = (
        request.form.get("selevar")
        or "2"
    ).strip()

    maf = (
        request.form.get("maf")
        or "0.05"
    ).strip()

    miss = (
        request.form.get("miss")
        or "0.25"
    ).strip()

    show_num = (
        request.form.get("show_num")
        == "1"
    )

    gwas_cutline = (
        request.form.get("gwas_cutline")
        or ""
    ).strip()


    prefix = (
        out_dir
        / "ldblock"
    )


    # --------------------------------------------------------
    # LDBlockShow
    #
    # IMPORTANT:
    # This build supports -SeleVar, -MAF and -Miss.
    # It does NOT expose -BlockType or -BlockCut.
    #
    # Do NOT use -OutPng/-OutPdf here because the bundled
    # Java/Batik converter is incompatible with modern Java.
    # --------------------------------------------------------

    cmd = [
        str(LDBLOCK_BIN),

        "-InVCF",
        str(vcf),

        "-OutPut",
        str(prefix),

        "-Region",
        region,

        "-SeleVar",
        selevar,

        "-MAF",
        maf,

        "-Miss",
        miss,
    ]


    if gwas:

        cmd += [
            "-InGWAS",
            str(gwas)
        ]


    if gff:

        cmd += [
            "-InGFF",
            str(gff)
        ]


    # --------------------------------------------------------
    # Run LDBlockShow
    # --------------------------------------------------------

    returncode = run_command(
        cmd,
        log
    )


    # --------------------------------------------------------
    # LDBlockShow can still generate the important LD files
    # even when its optional block-detection stage crashes.
    #
    # Therefore inspect actual outputs instead of treating
    # every non-zero exit as a total analysis failure.
    # --------------------------------------------------------

    triangle = (
        prefix.parent
        / "ldblock.TriangleV.gz"
    )

    site = (
        prefix.parent
        / "ldblock.site.gz"
    )


    if not triangle.exists() or not site.exists():

        return jsonify({
            "ok": False,
            "run_id": run_id,
            "error": (
                "LDBlockShow did not generate "
                "the required LD result files. "
                "See the run log."
            ),
            "log": (
                f"/api/ldblock/file/"
                f"{run_id}/ldblock.log"
            ),
        }), 500


    # --------------------------------------------------------
    # ShowLDSVG
    # --------------------------------------------------------

    svg_path = (
        out_dir
        / "ldblock.svg"
    )


    svg_cmd = [
        str(SHOWLD_BIN),

        "-InPreFix",
        str(prefix),

        "-OutPut",
        str(svg_path),
    ]


    if gwas:

        svg_cmd += [
            "-InGWAS",
            str(gwas)
        ]


        if gwas_cutline:

            svg_cmd += [
                "-Cutline",
                gwas_cutline
            ]


    if gff:

        svg_cmd += [
            "-InGFF",
            str(gff)
        ]


    if show_num:

        svg_cmd += [
            "-ShowNum"
        ]


    svg_returncode = run_command(
        svg_cmd,
        log
    )


    # --------------------------------------------------------
    # If ShowLDSVG didn't use the requested output path,
    # locate the native SVG generated by LDBlockShow.
    # --------------------------------------------------------

    if not svg_path.exists():

        native_svg = (
            prefix.parent
            / "ldblock.svg"
        )

        if native_svg.exists():

            svg_path = native_svg


    if not svg_path.exists():

        return jsonify({
            "ok": False,
            "run_id": run_id,
            "error": (
                "ShowLDSVG did not generate "
                "an SVG result. See the run log."
            ),
            "log": (
                f"/api/ldblock/file/"
                f"{run_id}/ldblock.log"
            ),
        }), 500


    # --------------------------------------------------------
    # Modern SVG → PNG conversion
    # --------------------------------------------------------

    png_path = (
        out_dir
        / "ldblock.png"
    )


    png_returncode = run_command(
        [
            str(RSVG_BIN),
            "-o",
            str(png_path),
            str(svg_path),
        ],
        log
    )


    if (
        png_returncode != 0
        or not png_path.exists()
    ):

        png_path = None


    # --------------------------------------------------------
    # Build result file list
    # --------------------------------------------------------

    result_files = {}


    for p in sorted(
        out_dir.iterdir()
    ):

        if not p.is_file():
            continue

        if p.name == "ldblock.log":
            continue

        suffix = (
            p.suffix
            .lstrip(".")
        )

        if suffix:

            result_files[
                suffix
            ] = (
                f"/api/ldblock/file/"
                f"{run_id}/{p.name}"
            )

        else:

            result_files[
                p.name
            ] = (
                f"/api/ldblock/file/"
                f"{run_id}/{p.name}"
            )


    # Explicit PNG result
    if png_path and png_path.exists():

        result_files["png"] = (
            f"/api/ldblock/file/"
            f"{run_id}/{png_path.name}"
        )


    # Explicit SVG result
    result_files["svg"] = (
        f"/api/ldblock/file/"
        f"{run_id}/{svg_path.name}"
    )


    # --------------------------------------------------------
    # Response
    # --------------------------------------------------------

    return jsonify({

        "ok": True,

        "run_id": run_id,

        "region": region,

        "result": result_files,

        "preview": (
            f"/api/ldblock/file/"
            f"{run_id}/{svg_path.name}"
        ),

        "log": (
            f"/api/ldblock/file/"
            f"{run_id}/ldblock.log"
        ),

        "warnings": {

            "ldblock_returncode":
                returncode,

            "showldsvg_returncode":
                svg_returncode,

            "png_returncode":
                png_returncode
                if png_path
                else None
        }

    })


# ============================================================
# Serve result files
# ============================================================

@app.get(
    "/api/ldblock/file/<run_id>/<path:name>"
)
def file_result(
    run_id,
    name
):

    safe_dir = (
        RUNS_DIR
        / run_id
    )


    if not safe_dir.is_dir():

        return jsonify({
            "error": "Run not found"
        }), 404


    return send_from_directory(
        safe_dir,
        name,
        as_attachment=False
    )


# ============================================================
# Main
# ============================================================

if __name__ == "__main__":

    port = int(
        os.environ.get(
            "PORT",
            "8766"
        )
    )

    app.run(
        host="127.0.0.1",
        port=port,
        debug=False
    )

#!/usr/bin/env python3

from email.parser import BytesParser
import json
import os
import subprocess
import tempfile
from http.server import BaseHTTPRequestHandler, HTTPServer


HOST = "0.0.0.0"
PORT = int(os.environ.get("PORT", "8788"))

ANALYSIS_SCRIPT = os.path.join(
    os.path.dirname(__file__),
    "gbs_combined_analysis.py"
)


class Handler(BaseHTTPRequestHandler):

    def send_json(self, status, payload):

        body = json.dumps(payload).encode("utf-8")

        self.send_response(status)

        self.send_header(
            "Content-Type",
            "application/json"
        )

        self.send_header(
            "Access-Control-Allow-Origin",
            "*"
        )

        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type"
        )

        self.send_header(
            "Access-Control-Allow-Methods",
            "POST, OPTIONS"
        )

        self.end_headers()

        self.wfile.write(body)


    def do_OPTIONS(self):

        self.send_response(204)

        self.send_header(
            "Access-Control-Allow-Origin",
            "*"
        )

        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type"
        )

        self.send_header(
            "Access-Control-Allow-Methods",
            "POST, OPTIONS"
        )

        self.end_headers()


    def do_GET(self):

        if self.path == "/health":

            self.send_json(
                200,
                {
                    "status": "ok",
                    "service": "GBS Variant Analysis",
                    "analysis": True
                }
            )

            return

        self.send_json(
            404,
            {
                "error": "Endpoint not found."
            }
        )


    def do_POST(self):

        if self.path != "/analyze":

            self.send_json(
                404,
                {
                    "error": "Endpoint not found."
                }
            )

            return

        temp_vcf = None

        try:

            content_type = self.headers.get(
                "Content-Type",
                ""
            )

            if not content_type.startswith(
                "multipart/form-data"
            ):

                raise ValueError(
                    "Expected multipart/form-data."
                )

            content_length = int(
                self.headers.get(
                    "Content-Length",
                    "0"
                )
            )

            if content_length <= 0:

                raise ValueError(
                    "Empty request."
                )

            body = self.rfile.read(
                content_length
            )

            mime_body = (
                b"Content-Type: "
                + content_type.encode("utf-8")
                + b"\r\n"
                + b"MIME-Version: 1.0\\r\\n"
                + b"\r\n"
                + body
            )

            message = BytesParser().parsebytes(mime_body)

            fields = {}
            uploaded_file = None
            uploaded_filename = None

            import re

            for part in message.walk():
                if part.is_multipart():
                    continue

                disposition = part.get("Content-Disposition", "")
                if not disposition:
                    continue

                name_match = re.search(
                    r'(?:^|;)\s*name="([^"]+)"',
                    disposition
                )

                filename_match = re.search(
                    r'(?:^|;)\s*filename="([^"]*)"',
                    disposition
                )

                field_name = (
                    name_match.group(1)
                    if name_match
                    else None
                )

                filename = (
                    filename_match.group(1)
                    if filename_match
                    else None
                )

                data = part.get_payload(decode=True)

                if data is None:
                    data = b""

                if filename is not None:
                    uploaded_file = data
                    uploaded_filename = filename
                elif field_name:
                    fields[field_name] = data.decode(
                        "utf-8",
                        errors="replace"
                    ).strip()

            if uploaded_file is None:

                raise ValueError(
                    "No VCF file was uploaded."
                )

            chrom = fields.get("chrom")

            start = fields.get("start")

            end = fields.get("end")

            genome = fields.get(
                "genome",
                "a4"
            )

            if not chrom:

                raise ValueError(
                    "Chromosome/contig is required."
                )

            if start is None or end is None:

                raise ValueError(
                    "Start and end positions are required."
                )

            genome = genome.lower()

            if genome not in {"a4", "a6"}:

                raise ValueError(
                    "Unsupported genome build. "
                    "Please select A4 or A6."
                )

            start = int(start)
            end = int(end)

            if start < 1:

                raise ValueError(
                    "Start position must be >= 1."
                )

            if end < start:

                raise ValueError(
                    "End position must be >= start."
                )

            if not uploaded_filename.lower().endswith(
                (
                    ".vcf",
                    ".vcf.gz"
                )
            ):

                raise ValueError(
                    "Please upload a VCF or VCF.GZ file."
                )

            is_gzipped_vcf = uploaded_filename.lower().endswith(
                ".vcf.gz"
            )

            with tempfile.NamedTemporaryFile(
                suffix=".vcf.gz"
                if is_gzipped_vcf
                else ".vcf",
                delete=False
            ) as temp:

                temp.write(uploaded_file)
                temp_vcf = temp.name

            # Browser uploads do not include the VCF index.
            # Create a temporary tabix index for compressed VCFs.
            if is_gzipped_vcf:

                index_result = subprocess.run(
                    [
                        "bcftools",
                        "index",
                        "-t",
                        temp_vcf
                    ],
                    capture_output=True,
                    text=True
                )

                if index_result.returncode != 0:

                    self.send_json(
                        500,
                        {
                            "error": (
                                index_result.stderr.strip()
                                or "Failed to index uploaded VCF."
                            )
                        }
                    )

                    return

            command = [
                "python3",
                ANALYSIS_SCRIPT,
                "--vcf",
                temp_vcf,
                "--chrom",
                chrom,
                "--start",
                str(start),
                "--end",
                str(end),
                "--genome",
                genome
            ]

            result = subprocess.run(
                command,
                capture_output=True,
                text=True
            )

            if result.returncode != 0:

                self.send_json(
                    500,
                    {
                        "error": (
                            result.stderr.strip()
                            or "GBS analysis failed."
                        )
                    }
                )

                return

            try:

                output = json.loads(
                    result.stdout
                )

            except json.JSONDecodeError:

                self.send_json(
                    500,
                    {
                        "error":
                            "Analysis returned invalid JSON."
                    }
                )

                return

            self.send_json(
                200,
                output
            )

        except Exception as exc:

            self.send_json(
                400,
                {
                    "error": str(exc)
                }
            )

        finally:

            if temp_vcf and os.path.exists(
                temp_vcf
            ):

                try:
                    os.remove(temp_vcf)
                except OSError:
                    pass


if __name__ == "__main__":

    print(
        f"GBS API running at "
        f"http://{HOST}:{PORT}"
    )

    HTTPServer(
        (HOST, PORT),
        Handler
    ).serve_forever()

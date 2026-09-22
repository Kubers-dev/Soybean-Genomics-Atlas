FROM rocker/r-ver:4.3.3

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    build-essential \
    libcurl4-openssl-dev \
    libssl-dev \
    libxml2-dev \
    libfontconfig1-dev \
    libfreetype6-dev \
    libpng-dev \
    libtiff5-dev \
    libjpeg-dev \
    libharfbuzz-dev \
    libfribidi-dev \
    && rm -rf /var/lib/apt/lists/*

RUN R -e 'install.packages(c("rMVP", "readxl", "data.table", "bigmemory"), repos="https://cloud.r-project.org")'

RUN pip3 install --no-cache-dir flask gunicorn

WORKDIR /app

COPY online-gwas-backend/GWAS_R_EDITOR.R /app/GWAS_R_EDITOR.R
COPY online-gwas-backend/server.py /app/server.py

EXPOSE 10000

CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT:-10000} --workers 1 --timeout 3600 server:app"]

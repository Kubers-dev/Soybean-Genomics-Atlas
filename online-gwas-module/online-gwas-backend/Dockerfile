FROM rocker/r-ver:4.4.2
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip libcurl4-openssl-dev libssl-dev libxml2-dev libfontconfig1-dev libfreetype6-dev libpng-dev libtiff5-dev libjpeg-dev make g++ && rm -rf /var/lib/apt/lists/*
RUN R -q -e "install.packages(c('remotes','readxl','data.table','bigmemory'), repos='https://cloud.r-project.org')"
RUN R -q -e "remotes::install_github('xiaolei-lab/rMVP@78fc9e636439c3b5171ee05d0460e3ad4df3129a')"
WORKDIR /app
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt
COPY app.py GWAS_R_ONLINE.R ./
RUN mkdir -p runs
ENV PORT=8000
EXPOSE 8000
CMD ["python3","app.py"]

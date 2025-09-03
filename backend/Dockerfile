# ---------- Stage 1: build pdffigures2 ----------
FROM eclipse-temurin:17-jdk-jammy AS pdffigures2-build
WORKDIR /opt

# tools for fetching/building
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl git gzip ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# install coursier and use it to install sbt into /usr/local/bin
RUN curl -fLo /usr/local/bin/cs https://git.io/coursier-cli \
 && chmod +x /usr/local/bin/cs \
 && /usr/local/bin/cs install --only-prebuilt=true --install-dir /usr/local/bin sbt \
 && sbt --version

# clone and assemble
RUN git clone --depth 1 https://github.com/allenai/pdffigures2.git
WORKDIR /opt/pdffigures2
# disable tests in assembly and build the fat jar
RUN sbt -Dsbt.log.noformat=true 'set test in assembly := {}' clean assembly

# ---------- Stage 2: app ----------
FROM python:3.11-slim AS app
WORKDIR /app

# system packages for parsing + JRE for running the jar
RUN apt-get update && apt-get install -y --no-install-recommends \
      libmagic1 poppler-utils ghostscript ca-certificates openjdk-21-jre-headless \
    && rm -rf /var/lib/apt/lists/*

# copy the assembled jar (scala version can vary; use wildcard)
COPY --from=pdffigures2-build /opt/pdffigures2/target/scala-*/pdffigures2-assembly*.jar /opt/pdffigures2/pdffigures2-assembly.jar

# thin wrapper on PATH so our code can call "pdffigures2"
RUN printf '%s\n' '#!/usr/bin/env bash' \
  'exec java -Xms512m -Xmx2g -Dsun.java2d.cmm=sun.java2d.cmm.kcms.KcmsServiceProvider -jar /opt/pdffigures2/pdffigures2-assembly.jar "$@"' \
  > /usr/local/bin/pdffigures2 && chmod +x /usr/local/bin/pdffigures2

# make the location discoverable (aligns with your config.py default)
ENV PDFFIGURES2_BIN=/usr/local/bin/pdffigures2

# python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# app code
COPY app ./app

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

# CUDA 12.4 runtime (pairs with torch 2.7.1 / vLLM 0.10.1)
FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    VLLM_USE_V1=1 \
    DATA_ROOT=/workspace \
    MODEL_PATH=/workspace/model \
    HF_HOME=/workspace/hf \
    TRANSFORMERS_CACHE=/workspace/hf \
    HF_HUB_CACHE=/workspace/hf \
    VLLM_DOWNLOAD_DIR=/workspace \
    MODEL_ID=jbaghiro/gpt-oss-20b-merged-fp16 \
    HOST=0.0.0.0 \
    PORT=8000

# System deps
RUN apt-get update && apt-get install -y \
      python3 python3-pip git curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Python deps
COPY requirements.txt /tmp/requirements.txt
RUN python3 -m pip install --upgrade pip && \
    pip install -r /tmp/requirements.txt

# App files
WORKDIR /app
COPY server.py /app/server.py
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# You don't need a public port for serverless, but exposing is harmless
EXPOSE 8000

# Healthcheck hits vLLM (internal)
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=5 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/health" || exit 1

CMD ["/entrypoint.sh"]

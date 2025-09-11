# entrypoint.sh
#!/usr/bin/env bash
set -euo pipefail

export HF_TOKEN="${HF_TOKEN:-${HUGGING_FACE_HUB_TOKEN:-}}"
export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-8000}"

MODEL_PATH="${MODEL_PATH:-/workspace/model}"
HF_HOME="${HF_HOME:-/workspace/hf}"
DATA_ROOT="${DATA_ROOT:-/workspace}"

mkdir -p "${MODEL_PATH}" "${HF_HOME}" "${DATA_ROOT}"

echo "=========="
echo "== CUDA =="
echo "=========="
nvidia-smi || true
echo "CUDA_VISIBLE_DEVICES=${CUDA_VISIBLE_DEVICES-<unset>}"
echo

# Probe CUDA and bail if no GPU
set +e
python3 - <<'PY'
import torch, sys
print(f"torch.cuda.is_available(): {torch.cuda.is_available()}")
print(f"torch.cuda.device_count(): {torch.cuda.device_count()}")
sys.exit(0 if torch.cuda.is_available() and torch.cuda.device_count()>0 else 1)
PY
rc=$?
set -e
if [ "$rc" -ne 0 ]; then
  echo "[fatal] No CUDA GPUs visible to the container."
  exit 42
fi

# Ensure model exists (HF snapshot)
have_cfg=false
shopt -s nullglob
if [ -f "${MODEL_PATH}/config.json" ] || [ -f "${MODEL_PATH}/params.json" ]; then
  have_cfg=true
else
  ggufs=( "${MODEL_PATH}"/*.gguf )
  if [ ${#ggufs[@]} -gt 0 ]; then have_cfg=true; fi
fi

if [ "${have_cfg}" != "true" ]; then
  echo "[boot] No model in ${MODEL_PATH}; downloading ${MODEL_ID} ..."
  python3 - <<'PY'
from huggingface_hub import snapshot_download
import os
mid  = os.environ["MODEL_ID"]
dest = os.environ["MODEL_PATH"]
tok  = os.environ.get("HF_TOKEN") or None
allow = ["*.json","*.safetensors","*.txt","tokenizer*","*config*","*.model","*.vocab","*.tiktoken","*.py"]
snapshot_download(repo_id=mid, local_dir=dest, token=tok,
                  allow_patterns=allow, ignore_patterns=["*.ckpt","*.bin"])
print(f"[boot] Downloaded {mid} -> {dest}")
PY
else
  echo "[boot] Found existing model in ${MODEL_PATH}; skipping download."
fi

# Start vLLM in background (trust remote code for custom arch)
echo "[boot] Starting vLLM on ${HOST}:${PORT} with model=${MODEL_PATH}"
LOG=/workspace/vllm.log
python3 -m vllm.entrypoints.openai.api_server \
  --host "${HOST}" --port "${PORT}" \
  --model "${MODEL_PATH}" \
  --trust-remote-code \
  --dtype bfloat16 \
  --max-model-len 131072 \
  --gpu-memory-utilization 0.90 >"${LOG}" 2>&1 &
VLLM_PID=$!
echo "[boot] vLLM pid=${VLLM_PID}; logs -> ${LOG}"

# Wait for health
echo "[boot] Waiting for vLLM health..."
for i in {1..90}; do
  if curl -fsS "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
    echo "[boot] vLLM is healthy."
    break
  fi
  if ! kill -0 "${VLLM_PID}" 2>/dev/null; then
    echo "[fatal] vLLM exited during startup. Recent log:"
    tail -n 200 "${LOG}" || true
    exit 43
  fi
  sleep 2
done

if ! curl -fsS "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
  echo "[fatal] vLLM did not become healthy in time. Recent log:"
  tail -n 200 "${LOG}" || true
  exit 44
fi

# Hand off to RunPod serverless handler
echo "[boot] Launching RunPod serverless handler..."
exec python3 /app/server.py

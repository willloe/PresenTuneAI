# Docker Inference Server

This directory contains a Docker-based inference server for the PresenTuneAI model, designed for production deployment.

## Contents

- `Dockerfile` - Container definition with CUDA 12.4 runtime
- `server.py` - FastAPI/RunPod server for slide generation
- `entrypoint.sh` - Container startup script
- `requirements.txt` - Python dependencies

## How to Run

### Build Docker Image

```bash
docker build -t presentune-inference .
```

### Run Container

```bash
docker run -d \
  --gpus all \
  -p 8000:8000 \
  -e MODEL_ID=jbaghiro/gpt-oss-20b-merged-fp16 \
  -v /path/to/model:/workspace/model \
  presentune-inference
```

### Environment Variables

- `MODEL_PATH` - Path to the merged model (default: `/workspace/model`)
- `MODEL_ID` - HuggingFace model ID to download
- `PORT` - Server port (default: `8000`)
- `HOST` - Server host (default: `0.0.0.0`)
- `HTTP_TIMEOUT` - Request timeout in seconds (default: `300`)

### API Usage

Send POST request to generate slides:

```bash
curl -X POST http://localhost:8000/generate \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Your scientific paper content here...",
    "n_slides": 5
  }'
```

Response format:
```json
{
  "slide 1": {
    "text": {
      "title": "Introduction & Context",
      "bullets": ["First bullet point", "Second bullet point", ...]
    }
  },
  ...
}
```

## Requirements

- Docker with NVIDIA GPU support
- CUDA-compatible GPU
- At least 16GB GPU memory for the 20B model

## Health Check

The container includes a health check endpoint at `/health` that monitors vLLM server status.

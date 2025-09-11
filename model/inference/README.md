# Model Inference

This directory contains tools for running inference with the PresenTuneAI model to generate presentation slides from scientific papers.

## Contents

- `Merge_adapter.ipynb` - Jupyter notebook for merging LoRA adapters with the base model and serving with vLLM
- `Testing_Inference.ipynb` - Notebook for testing model inference capabilities
- `docker/` - Docker deployment setup for production inference

## How to Run

### Option 1: Docker Deployment (Production)

#### Build and Push Docker Image

1. **Build Docker Image:**
   ```bash
   sudo docker build -t jbaghiro/gpt-oss-vllm:0.9.3 .
   ```

2. **Push to Docker Hub:**
   ```bash
   sudo docker push jbaghiro/gpt-oss-vllm:0.9.3
   ```

#### Deploy on RunPod

3. **RunPod Serverless Deployment:**
   - Go to RunPod dashboard
   - Create new serverless endpoint with the Docker image: `jbaghiro/gpt-oss-vllm:0.9.3`
   - Select GPU configuration with 80GB GPU memory and 100GB storage 
   - The container will automatically download the model and start the inference server

See the `docker/` subdirectory for detailed Docker configuration and API usage.

### Option 2: Jupyter Notebooks (Development)

1. **Merge Adapter and Serve Model:**
   ```bash
   jupyter notebook Merge_adapter.ipynb
   ```
   - This notebook merges LoRA adapters with the base model (openai/gpt-oss-20b)
   - Serves the merged model using vLLM for fast inference
   - Configure model paths and settings in the notebook

2. **Test Inference:**
   ```bash
   jupyter notebook Testing_Inference.ipynb
   ```
   - Use this notebook to test the model's slide generation capabilities
   - Send sample scientific paper text and get presentation slides

## Requirements

- Python 3.8+
- PyTorch with CUDA support
- Key dependencies (see `../requirements.txt` for full list):
  - `transformers==4.55.4`
  - `torch==2.8.0`
  - `peft==0.17.0`
  - `accelerate==1.10.1`
  - `bitsandbytes==0.47.0`
  - `fastapi==0.112.1`
  - `huggingface-hub==0.34.4`
  - `safetensors==0.6.2`
- Jupyter notebook environment (for development option)
- CUDA-compatible GPU with sufficient memory

## Model Details

- Base model: `openai/gpt-oss-20b`
- Adapter: `jbaghiro/gpt-oss-20b-adapter`
- Output: JSON-formatted presentation slides with titles and bullet points

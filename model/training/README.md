# Model Training

This directory contains the training pipeline for the PresenTuneAI model, which learns to generate presentation slides from scientific papers.

## Contents

- `dataset/` - Dataset processing and preparation tools

## How to Run

The training process involves dataset preparation before model training:

1. **Prepare Dataset:**
   ```bash
   cd dataset/
   # Follow instructions in dataset/README.md
   ```

2. **Train Model:**
   - After dataset preparation, use your preferred training framework
   - The processed dataset will be in the format expected by the model
   - Consider using LoRA/QLoRA for efficient fine-tuning of large language models

## Workflow

1. **Data Extraction** - Extract slide and paper content from raw sources
2. **Data Alignment** - Align slides with corresponding paper sections
3. **Model Training** - Fine-tune the base model on the aligned dataset

## Requirements

- Python 3.8+
- Dataset processing dependencies (see `dataset/` subdirectory)
- Training framework (PyTorch, Transformers, PEFT for LoRA)
- Sufficient GPU memory for training large language models

## Output

The training process produces:
- Fine-tuned model weights or LoRA adapters
- Model ready for inference on slide generation tasks

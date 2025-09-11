# Model Training

This directory contains the training pipeline for the PresenTuneAI model, which learns to generate presentation slides from scientific papers.

## Contents

- `dataset/` - Dataset processing and preparation tools

## Datasets Used

The model was trained on a combination of two datasets:

1. **[GEM/SciDuet](https://huggingface.co/datasets/GEM/SciDuet)** - A publicly available dataset for document-to-slide generation
   - Contains pairs of scientific papers and corresponding slide decks from NLP/ML conferences
   - Includes 4.7k samples with training, validation, and test splits
   - Licensed under Apache 2.0

2. **Doc2PPT Dataset** - Additional proprietary dataset with extensive preprocessing
   - Raw data available at: https://drive.google.com/drive/folders/1s2zJ04WZYifZhotRCXpk4OGtCHWXuM0b
   - Contains processed paper-presentation pairs (33.81 GB raw data)
   - **Custom OCR Pipeline:**
     - Applied OCR to every image in the dataset to extract text content
     - Used GPT-OSS-20B via Groq API for intelligent OCR result cleaning and correction
     - Automated cleanup of OCR artifacts, formatting issues, and text recognition errors
   - Further processed using the alignment tools in `slide_paper_alignment/` and processing tools in `slide_paper_data_extraction/`

## Fine-Tuned Models

The training process has produced several model variants:

1. **[gpt-oss-20b-merged-fp16](https://huggingface.co/jbaghiro/gpt-oss-20b-merged-fp16)** 
   - Merged LoRA adapter with base model in FP16 format
   - Safetensors format for efficient loading

2. **[gpt-oss-20b-presentation](https://huggingface.co/jbaghiro/gpt-oss-20b-presentation)**
   - Specialized presentation generation model
   - MXFP4 quantized format (requires triton >= 3.4.0 and specific kernels)

3. **[gpt-oss-20b-adapter](https://huggingface.co/jbaghiro/gpt-oss-20b-adapter)**
   - LoRA adapter weights only
   - Can be merged with base model for inference
   - More storage efficient

## How to Run

The training process involves dataset preparation before model training:

1. **Prepare Dataset:**
   ```bash
   cd dataset/
   # Follow instructions in dataset/README.md for GEM/SciDuet processing
   # Use slide_paper_alignment/ tools for Doc2PPT dataset processing
   ```

2. **Train Model:**
   - After dataset preparation, use your preferred training framework
   - The processed dataset will be in the format expected by the model
   - LoRA/QLoRA was used for efficient fine-tuning of the 20B parameter base model

## Workflow

1. **Data Extraction** - Extract slide and paper content from raw sources (GEM/SciDuet + Doc2PPT)
2. **Data Alignment** - Align slides with corresponding paper sections using `slide_paper_alignment/`
3. **Model Training** - Fine-tune the base model (openai/gpt-oss-20b) on the combined aligned dataset

## Requirements
- PresenTuneAI/model/requirements.txt

## Output

The training process produces:
- Fine-tuned model weights or LoRA adapters
- Model ready for inference on slide generation tasks

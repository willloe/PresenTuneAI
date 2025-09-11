# Dataset Processing

This directory contains tools for processing and preparing the training dataset for PresenTuneAI. The pipeline extracts content from scientific papers and presentation slides, then aligns them for training.

## Contents

- `slide_paper_data_extraction/` - Extract and clean content from papers and slides
- `slide_paper_alignment/` - Align slides with corresponding paper sections

## How to Run

### Step 1: Data Extraction

```bash
cd slide_paper_data_extraction/
python app.py
```

This will:
- Extract text content from scientific papers
- Process presentation slides
- Clean and normalize the extracted data
- Apply deduplication and filtering

### Step 2: Data Alignment

```bash
cd slide_paper_alignment/
./run_align.sh
```

This will:
- Build search indexes for paper content
- Align slides with relevant paper sections
- Generate training pairs for the model
- Apply various alignment strategies and filtering

## Workflow

1. **Extraction Phase:**
   - Raw papers and slides → Clean, structured text
   - Remove metadata, citations, formatting artifacts
   - Apply quality filters and deduplication

2. **Alignment Phase:**
   - Match slide content with paper sections
   - Use semantic similarity and keyword matching
   - Generate high-quality training examples

## Requirements

- Python 3.8+
- Flask (for extraction web interface)
- Conda environment with `together_ft` 
- Text processing libraries (see individual subdirectory requirements)
- Sufficient storage for intermediate processing files

## Output

The processed dataset will be in a format suitable for training:
- Input: Scientific paper text sections
- Target: Corresponding presentation slide content
- Metadata: Alignment scores, source information

## Configuration

- Adjust extraction parameters in `slide_paper_data_extraction/app.py`
- Modify alignment settings in `slide_paper_alignment/run_align.sh`
- Grid search parameters can be tuned for optimal alignment quality

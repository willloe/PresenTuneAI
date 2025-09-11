# Slide-Paper Alignment

This directory contains tools for aligning presentation slides with corresponding sections of scientific papers. The alignment process creates high-quality training pairs for the PresenTuneAI model.

## Contents

- `run_align.sh` - Main alignment script with grid search capabilities
- `align_cross_section.py` - Core alignment algorithm implementation
- `B_build_index.py` - Build search indexes for paper content
- `build_per_idd_indexes.py` - Build per-document indexes for efficient retrieval

## How to Run

### Prerequisites

1. **Activate Conda Environment:**
   ```bash
   conda activate together_ft
   ```

2. **Set up paths** in `run_align.sh`:
   - `BASE` - Directory containing slides and papers
   - `OUT` - Output directory for results
   - `TMP` - Temporary directory for processing

### Run Alignment

```bash
./run_align.sh
```

This script will:
- Build search indexes for all papers
- Run grid search over alignment parameters
- Process slides in parallel (up to 12 jobs by default)
- Generate aligned slide-paper pairs

### Grid Search Parameters

The script optimizes these alignment parameters:
- `K_MIN/K_MAX` - Range of top-k candidates to consider (3-7)
- `LAMBDA_DIV` - Diversity weighting factor (0.3-0.7)
- `TOP_K_POOL` - Initial candidate pool size (80-160)
- `MIN_SENT_TOKENS` - Minimum sentence length (6 tokens)
- `MIN_BULLET_WORDS` - Minimum bullet point length (6 words)
- `MIN_BULLET_CHARS` - Minimum bullet point characters (24)
- `MAX_DIGIT_RATIO` - Maximum ratio of digits (0.4)
- `MIN_LETTER_RATIO` - Minimum ratio of letters (0.30)

### Input Format

Expected directory structure:
```
BASE/
├── slides/
│   ├── acl17.json
│   ├── acl18.json
│   └── ...
└── papers/
    ├── acl17.json
    ├── acl18.json
    └── ...
```

## How It Works

1. **Index Building:** Creates searchable indexes of paper content
2. **Candidate Retrieval:** Finds potentially relevant paper sections for each slide
3. **Alignment Scoring:** Ranks candidates using semantic similarity and diversity
4. **Quality Filtering:** Applies filters for content quality and length
5. **Output Generation:** Creates aligned training pairs

## Requirements

- PresenTuneAI/model/requirements.txt


## Output

The alignment process generates:
- Aligned slide-paper section pairs
- Alignment confidence scores
- Quality metrics for each pair
- Processed datasets ready for model training

## Configuration

Modify parameters in `run_align.sh`:
- `MAX_JOBS` - Number of parallel alignment processes
- Grid search ranges for fine-tuning alignment quality
- File paths and directory structure
- Quality thresholds and filtering criteria

# Slide-Paper Data Extraction

This directory contains a Flask web application for extracting and cleaning content from scientific papers and presentation slides. The extraction process prepares raw data for the alignment phase.

## Contents

- `app.py` - Flask web application with extraction, cleaning, and deduplication tools

## How to Run

### Start the Flask Application

```bash
python app.py
```

The application will start on `http://localhost:5000` (or the port specified in environment variables).

### Web Interface

The Flask app provides several endpoints for data processing:

1. **Text Extraction** - Extract content from papers and slides
2. **Content Cleaning** - Remove metadata, citations, and formatting artifacts  
3. **Deduplication** - Remove duplicate or near-duplicate content
4. **Quality Filtering** - Apply filters for content quality and relevance

### API Usage

The application exposes REST endpoints for programmatic access:
- Upload and process document files
- Apply various cleaning and filtering operations
- Download processed datasets

## Features

### LLM-Based Cleaning
- Uses configurable LLM models (default: `openai/gpt-oss-20b`)
- Fallback model support for reliability
- Concurrent processing with configurable limits
- Automatic retry logic with exponential backoff

### Content Processing
- Unicode normalization and text cleaning
- Metadata removal (journal names, DOIs, author info, dates)
- Citation and reference filtering
- Symbol and equation removal
- Quality scoring and filtering

### Deduplication
- Configurable similarity thresholds (default: 0.9)
- Efficient near-duplicate detection
- Preserves highest-quality versions

## Configuration

### Environment Variables

- `LLM_MODEL` - Primary LLM for cleaning (default: `openai/gpt-oss-20b`)
- `LLM_FALLBACK_MODEL` - Fallback LLM model (optional)
- `LLM_TIMEOUT_S` - LLM request timeout in seconds (default: 30)
- `LLM_RETRIES` - Number of retry attempts (default: 2)
- `LLM_CONCURRENCY` - Concurrent LLM requests (default: 6)
- `DEDUPE_THRESHOLD` - Deduplication similarity threshold (default: 0.9)

### Processing Parameters

Adjustable in the application:
- Text length thresholds
- Quality scoring criteria  
- Cleaning aggressiveness levels
- Output format specifications

## Requirements

- Python 3.8+
- Flask web framework
- Text processing libraries (requests, threading, concurrent.futures)
- Access to LLM API for content cleaning
- Sufficient memory for large document processing

## Input Format

Supports various input formats:
- Plain text files
- JSON structured data
- Batch processing of document collections

## Output

The extraction process generates:
- Clean, structured text content
- Removed metadata and artifacts
- Quality scores and filtering results
- Deduplicated document collections
- Data ready for the alignment phase

## Workflow

1. **Upload/Input** - Load raw papers and slides
2. **Extract** - Parse and extract text content
3. **Clean** - Apply LLM-based cleaning and normalization
4. **Filter** - Remove low-quality or irrelevant content
5. **Deduplicate** - Remove near-duplicate entries
6. **Export** - Save processed data for alignment phase

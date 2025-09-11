# Activate env once
eval "$(conda shell.bash hook)"; conda activate together_ft

BASE="/home/jbaghiro/presentune-dataset/datasets/SMAR/SMAR/Training/small_test_embedding"
OUT="$BASE/outputs"
TMP="/home/jbaghiro/presentune-dataset/datasets/SMAR/tmp_isolated"
export PYTHONPATH="/home/jbaghiro/presentune-dataset/datasets/SMAR":${PYTHONPATH-}

mkdir -p "$TMP"/{slides,papers}

# Grid search settings (tweak as needed)
MAX_JOBS=12
K_MIN=(3 4 5)
K_MAX=(5 6 7)
LAMBDA_DIV=(0.3 0.5 0.7)
TOP_K_POOL=(80 120 160)
MIN_SENT_TOKENS=(6)
MIN_BULLET_WORDS=(6)
MIN_BULLET_CHARS=(24)
MAX_DIGIT_RATIO=(0.4)
MIN_LETTER_RATIO=(0.30)
# Keep defaults for max_symbol_ratio and max_consec_nonletters

canon() {
  # replace '.' with 'p' for safe filenames
  echo "$1" | sed 's/\./p/g'
}

for f in "$BASE/slides/"*.json; do
  conf="$(basename "$f" .json)"
  [ -f "$BASE/papers/$conf.json" ] || continue
  [ "$conf" = "acl17" ] || continue

  # isolate this corpus
  rm -rf "$TMP/slides" "$TMP/papers"
  mkdir -p "$TMP/slides" "$TMP/papers"
  cp "$BASE/slides/$conf.json" "$TMP/slides/"
  cp "$BASE/papers/$conf.json" "$TMP/papers/"

  echo "[grid] conf=$conf (all idds in corpus)"

  # Ensure output root for grid
  GRID_OUT="$OUT/grid/$conf"
  mkdir -p "$GRID_OUT"

  for kmn in "${K_MIN[@]}"; do
    for kmx in "${K_MAX[@]}"; do
      # Ensure k_max >= k_min
      if [ "$kmx" -lt "$kmn" ]; then continue; fi
      for lam in "${LAMBDA_DIV[@]}"; do
        for pool in "${TOP_K_POOL[@]}"; do
          for msent in "${MIN_SENT_TOKENS[@]}"; do
            for bw in "${MIN_BULLET_WORDS[@]}"; do
              for bc in "${MIN_BULLET_CHARS[@]}"; do
                for dr in "${MAX_DIGIT_RATIO[@]}"; do
                  for lr in "${MIN_LETTER_RATIO[@]}"; do
                    # Concurrency guard
                    while [ "$(jobs -rp | wc -l)" -ge "$MAX_JOBS" ]; do
                      wait -n
                    done

                    tag="k${kmn}-${kmx}_lam$(canon "$lam")_pool${pool}_msent${msent}_bw${bw}_bc${bc}_dr$(canon "$dr")_lr$(canon "$lr")"
                    out_file="$GRID_OUT/${tag}.jsonl"

                    # Skip if output already exists
                    if [ -s "$out_file" ]; then
                      echo "[skip] already exists: $out_file"
                      continue
                    fi

                    echo "[launch] $tag -> $out_file"
                    python3 "$BASE/align_cross_section.py" \
                      --slides_dir "$TMP/slides" \
                      --faiss_root "$BASE/faiss_per_idd" \
                      --output "$out_file" \
                      --k_min "$kmn" --k_max "$kmx" \
                      --lambda_div "$lam" \
                      --top_k_pool "$pool" \
                      --min_sent_tokens "$msent" \
                      --min_bullet_words "$bw" \
                      --min_bullet_chars "$bc" \
                      --max_digit_ratio "$dr" \
                      --min_letter_ratio "$lr" &
                  done
                done
              done
            done
          done
        done
      done
    done
  done

  # Wait for remaining jobs for this conf
  wait
  echo "[grid] completed for conf=$conf -> $GRID_OUT"
done

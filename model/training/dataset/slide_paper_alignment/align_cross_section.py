#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Slide→paper alignment using EXISTING per-idd FAISS embeddings.
- No chunking or re-embedding of paper sentences.
- Strong bullet filtering (headers, garbled, too-numeric, too short).
- MMR selection (3–6 positives) + hard negatives.
- **Per-conference streaming output**: if --output points to a DIRECTORY (or has no .jsonl suffix),
  the script writes/APPENDS to files named:
      <output_dir>/bullet_evidence.<conf>.jsonl
  as each idd is processed (so you’ll see files grow continuously).
- If --output ends with ".jsonl", a single file is (over)written with all corpora.

Dir layout per idd under --faiss_root:
  <faiss_root>/<idd>/{faiss_index.bin, embeddings.npy, sentences.json, model.json}

Slides JSON:
  [{"conf": "...", "idd": <int>, "slides": [{slide_index, texts:[...]} , ...]}, ...]
"""

from __future__ import annotations
import argparse, json, math, re, random
from pathlib import Path
from typing import Dict, List, Tuple
import numpy as np

# ---------------- I/O helpers ----------------

def read_json_any(p: Path):
    with p.open("r", encoding="utf-8") as f:
        obj = json.load(f)
    return obj if isinstance(obj, list) else [obj]

def load_slides_and_confs(slides_dir: Path) -> Tuple[Dict[int, List[Dict]], Dict[int, str]]:
    """Return (slides_by_idd, conf_by_idd). Supports files containing objects or lists."""
    by_slides: Dict[int, List[Dict]] = {}
    by_conf: Dict[int, str] = {}
    for fp in sorted(slides_dir.glob("*.json")):
        for item in read_json_any(fp):
            try:
                idd = int(item.get("idd", -1))
            except Exception:
                idd = -1
            if idd < 0:
                continue
            conf = str(item.get("conf", "unknown")) if item.get("conf") else "unknown"
            by_conf[idd] = conf
            by_slides.setdefault(idd, []).extend(item.get("slides") or [])
    return by_slides, by_conf

# ---------------- Bullet extraction & filtering ----------------

SECTION_HEADERS = {
    "introduction","background","related work","methods","method","approach","model",
    "architecture","algorithm","experiments","results","evaluation","analysis",
    "discussion","conclusion","future work","summary","overview","motivation",
    "setup","dataset","data","metrics","limitations","ablation"
}
HEADER_PAT = [re.compile(r"^\s*(outline|agenda|contents)\s*$", re.I)]

def is_header_like(line: str) -> bool:
    l = (line or "").strip().lower()
    if not l:
        return False
    if l in SECTION_HEADERS:
        return True
    if any(p.match(line or "") for p in HEADER_PAT):
        return True
    ws = l.split()
    return len(ws) <= 3 and all(w in SECTION_HEADERS for w in ws)

def normalize_line(s: str) -> str:
    s = (s or "").replace("\u2022", " ").replace("•", " ")
    s = re.sub(r"\s+", " ", s).strip()
    return s

def is_garbled(s: str,
               min_words: int,
               min_chars: int,
               max_digit_ratio: float,
               min_letter_ratio: float,
               max_symbol_ratio: float,
               max_consec_nonletters: int) -> bool:
    """Detect garbage: short, too numeric, too symbolic, too few letters, long non-letter runs, etc."""
    if not s:
        return True
    s_norm = normalize_line(s)
    if not s_norm:
        return True

    # too short
    words = re.findall(r"\S+", s_norm)
    if len(words) < min_words or len(s_norm) < min_chars:
        return True

    letters = re.findall(r"[A-Za-z]", s_norm)
    digits  = re.findall(r"\d", s_norm)
    symbols = re.findall(r"[^A-Za-z0-9\s]", s_norm)
    total   = max(1, len(s_norm))

    letter_ratio = len(letters) / total
    digit_ratio  = len(digits) / total
    symbol_ratio = len(symbols) / total

    if len(digits) > len(letters):
        return True
    if digit_ratio > max_digit_ratio:
        return True
    if letter_ratio < min_letter_ratio:
        return True
    if symbol_ratio > max_symbol_ratio:
        return True
    if re.search(rf"[^A-Za-z]{{{max_consec_nonletters},}}", s_norm):
        return True
    if len(set(s_norm)) <= 3 and len(s_norm) >= min_chars:
        return True
    return False

def extract_bullets_from_slide(
    lines: List[str],
    min_words: int,
    min_chars: int,
    max_digit_ratio: float,
    min_letter_ratio: float,
    max_symbol_ratio: float,
    max_consec_nonletters: int
) -> List[str]:
    raw = [normalize_line(x) for x in (lines or [])]
    parts = [p for p in raw if p and not is_header_like(p)]
    parts = [
        p for p in parts
        if not is_garbled(
            p, min_words=min_words, min_chars=min_chars,
            max_digit_ratio=max_digit_ratio, min_letter_ratio=min_letter_ratio,
            max_symbol_ratio=max_symbol_ratio, max_consec_nonletters=max_consec_nonletters
        )
    ]

    # fallback to longest non-header if everything was filtered (but is not obviously garbage)
    if not parts and raw:
        longest = max([r for r in raw if not is_header_like(r)], key=len, default="")
        if longest and not is_garbled(longest, 1, 1, 1.0, 0.0, 1.0, 999):
            parts = [longest]

    # merge short leftovers
    out: List[str] = []
    carry = ""
    def push(s: str):
        nonlocal carry
        cur = (carry + " " + s).strip() if carry else s
        if len(cur.split()) < min_words or len(cur) < min_chars:
            carry = cur
        else:
            out.append(cur); carry = ""
    for p in parts:
        push(p)
    if carry:
        if out: out[-1] = (out[-1] + " " + carry).strip()
        else:   out.append(carry)

    # final guard
    final = [
        b for b in out
        if not is_garbled(
            b, min_words=min_words, min_chars=min_chars,
            max_digit_ratio=max_digit_ratio, min_letter_ratio=min_letter_ratio,
            max_symbol_ratio=max_symbol_ratio, max_consec_nonletters=max_consec_nonletters
        )
    ]
    return final

# ---------------- Prebuilt FAISS & encoders ----------------

def load_prebuilt_faiss_dir(faiss_dir: Path):
    import faiss  # type: ignore
    idx_path = faiss_dir / "faiss_index.bin"
    emb_path = faiss_dir / "embeddings.npy"
    sents_path = faiss_dir / "sentences.json"
    model_path = faiss_dir / "model.json"
    if not (idx_path.exists() and emb_path.exists() and sents_path.exists() and model_path.exists()):
        raise FileNotFoundError(f"Missing FAISS files in {faiss_dir}")
    index = faiss.read_index(str(idx_path))
    embeddings = np.load(str(emb_path)).astype(np.float32)
    n = np.linalg.norm(embeddings, axis=1, keepdims=True)
    n[n == 0] = 1.0
    embeddings = embeddings / n
    with sents_path.open("r", encoding="utf-8") as f:
        sentences = json.load(f)
    with model_path.open("r", encoding="utf-8") as f:
        model_info = json.load(f)
    backend = model_info.get("backend", "sbert")
    model_name = model_info.get("model", "sentence-transformers/all-MiniLM-L6-v2")
    encoder = build_query_encoder(backend, model_name)
    return index, embeddings, sentences, backend, model_name, encoder

def build_query_encoder(backend: str, model_name: str):
    if backend == "sbert":
        from sentence_transformers import SentenceTransformer  # type: ignore
        m = SentenceTransformer(model_name)
        def enc(texts: List[str]) -> np.ndarray:
            v = m.encode(texts, convert_to_numpy=True, normalize_embeddings=True, show_progress_bar=False)
            return v.astype(np.float32) if v.dtype != np.float32 else v
        return enc
    elif backend == "openai":
        from openai import OpenAI  # type: ignore
        client = OpenAI()
        def enc(texts: List[str]) -> np.ndarray:
            resp = client.embeddings.create(model=model_name, input=texts)
            X = np.array([d.embedding for d in resp.data], dtype=np.float32)
            n = np.linalg.norm(X, axis=1, keepdims=True); n[n==0]=1.0
            return X / n
        return enc
    else:
        raise ValueError(f"Unknown backend: {backend}")

# ---------------- Scoring & selection ----------------

def mmr(indices: List[int], q: np.ndarray, V: np.ndarray, k: int, lam: float) -> List[int]:
    n = V.shape[0]
    indices = [i for i in indices if 0 <= i < n]  # guard
    sel: List[int] = []
    rem = set(indices)
    q_sims = {i: float(np.dot(V[i], q)) for i in indices}
    while rem and len(sel) < k:
        best_i, best = None, -1e9
        for i in list(rem):
            if not sel:
                score = (1 - lam) * q_sims[i]
            else:
                max_sim = max(float(np.dot(V[i], V[j])) for j in sel)
                score = (1 - lam) * q_sims[i] - lam * max_sim
            if score > best:
                best, best_i = score, i
        if best_i is None:
            break
        sel.append(best_i); rem.remove(best_i)
    return sel

def len_bonus(text: str) -> float:
    w = len(re.findall(r"\S+", text or ""))
    return 1.0 + 0.1 * math.log(1 + w)

# ---------------- Core per idd ----------------

def process_idd(idd: int,
                slides: List[Dict],
                faiss_root: Path,
                k_min: int, k_max: int,
                lambda_div: float,
                top_k_pool: int,
                min_sent_tokens: int,
                min_bwords: int, min_bchars: int,
                max_digit_ratio: float,
                min_letter_ratio: float,
                max_symbol_ratio: float,
                max_consec_nonletters: int) -> List[str]:
    faiss_dir = faiss_root / str(idd)
    if not faiss_dir.exists():
        return []
    index, V, sent_meta, backend, model_name, encode_query = load_prebuilt_faiss_dir(faiss_dir)
    sent_texts = [s.get("text","") for s in sent_meta]

    # Filter trivial paper sentences; map original<->filtered
    keep = np.array([len((t or "").split()) >= min_sent_tokens for t in sent_texts])
    if not keep.any():
        return []
    Vf = V[keep]
    meta_idx = np.nonzero(keep)[0]        # filtered -> original
    orig2filt = {orig_i: j for j, orig_i in enumerate(meta_idx)}  # original -> filtered

    # Build bullets
    bullets: List[str] = []
    for sl in slides:
        bullets.extend(
            extract_bullets_from_slide(
                sl.get("texts") or [],
                min_words=min_bwords, min_chars=min_bchars,
                max_digit_ratio=max_digit_ratio, min_letter_ratio=min_letter_ratio,
                max_symbol_ratio=max_symbol_ratio, max_consec_nonletters=max_consec_nonletters
            )
        )
    if not bullets:
        return []

    lines_out: List[str] = []
    import faiss  # type: ignore
    for b in bullets:
        q = encode_query([b])[0]

        # 1) Retrieve from FAISS (original space), map to filtered
        D, I = index.search(q.reshape(1, -1), max(top_k_pool*2, k_max*10))
        full_hits = I[0].tolist()
        cand_filt = [orig2filt[i] for i in full_hits if i in orig2filt]
        cand_filt = cand_filt[:max(top_k_pool, k_max*6)]

        # 2) Fallback: brute force on filtered
        if not cand_filt:
            sims_all = Vf @ q
            cand_filt = np.argsort(-sims_all)[:max(top_k_pool, k_max*6)].tolist()

        # 3) Score + length bonus
        sims = Vf @ q
        scores = sims.copy()
        for j in range(len(scores)):
            orig_i = meta_idx[j]
            scores[j] *= len_bonus(sent_texts[orig_i])

        # 4) MMR
        bw = len(b.split())
        lam = lambda_div if bw >= 8 else min(0.9, max(lambda_div, 0.85))
        k = random.randint(k_min, k_max)
        picked = mmr(cand_filt, q, Vf, k=k, lam=lam)

        positives = [{
            "sid": sent_meta[meta_idx[i]].get("sid"),
            "section": sent_meta[meta_idx[i]].get("section"),
            "text": sent_texts[meta_idx[i]],
            "score": round(float(scores[i]), 4)
        } for i in picked]

        pos_set = set(picked)
        hard_pool = [i for i in cand_filt if i not in pos_set]
        hard_negatives = [{
            "sid": sent_meta[meta_idx[i]].get("sid"),
            "section": sent_meta[meta_idx[i]].get("section"),
            "text": sent_texts[meta_idx[i]],
            "score": round(float(scores[i]), 4)
        } for i in hard_pool[:max(1, len(positives))]]

        rec = {"idd": idd, "bullet": b, "positives": positives, "hard_negatives": hard_negatives}
        lines_out.append(json.dumps(rec, ensure_ascii=False))
    return lines_out

# ---------------- CLI ----------------

def main():
    ap = argparse.ArgumentParser(description="Align slides to papers using EXISTING per-idd FAISS embeddings. Supports per-conference streaming output.")
    ap.add_argument("--slides_dir", required=True, type=str)
    ap.add_argument("--faiss_root", required=True, type=str, help="Directory with per-idd FAISS subdirs")
    ap.add_argument("--output", required=True, type=str, help="Either a .jsonl file (single file) or a DIRECTORY for per-conference outputs")
    ap.add_argument("--k_min", type=int, default=3)
    ap.add_argument("--k_max", type=int, default=6)
    ap.add_argument("--lambda_div", type=float, default=0.5)
    ap.add_argument("--top_k_pool", type=int, default=100)
    ap.add_argument("--min_sent_tokens", type=int, default=6)

    # Bullet filtering thresholds
    ap.add_argument("--min_bullet_words", type=int, default=6)
    ap.add_argument("--min_bullet_chars", type=int, default=32)
    ap.add_argument("--max_digit_ratio", type=float, default=0.45)
    ap.add_argument("--min_letter_ratio", type=float, default=0.35)
    ap.add_argument("--max_symbol_ratio", type=float, default=0.35)
    ap.add_argument("--max_consec_nonletters", type=int, default=6)

    ap.add_argument("--idd", type=int, default=None)
    args = ap.parse_args()

    slides_by, conf_by = load_slides_and_confs(Path(args.slides_dir))
    idds = sorted(slides_by.keys())
    if args.idd is not None:
        idds = [i for i in idds if i == int(args.idd)]

    out_path = Path(args.output)
    per_conference = (out_path.suffix.lower() != ".jsonl")  # if not a .jsonl file, treat as directory for per-conf

    if per_conference:
        out_dir = out_path
        out_dir.mkdir(parents=True, exist_ok=True)
        # Stream per-idd into its conference file
        for cnt, idd in enumerate(idds, 1):
            conf = conf_by.get(idd, "unknown")
            conf_file = out_dir / f"bullet_evidence.{conf}.jsonl"
            lines = process_idd(
                idd=idd,
                slides=slides_by[idd],
                faiss_root=Path(args.faiss_root),
                k_min=max(1, args.k_min),
                k_max=max(args.k_min, args.k_max),
                lambda_div=min(1.0, max(0.0, args.lambda_div)),
                top_k_pool=max(10, args.top_k_pool),
                min_sent_tokens=max(1, args.min_sent_tokens),
                min_bwords=max(1, args.min_bullet_words),
                min_bchars=max(1, args.min_bullet_chars),
                max_digit_ratio=max(0.0, min(1.0, args.max_digit_ratio)),
                min_letter_ratio=max(0.0, min(1.0, args.min_letter_ratio)),
                max_symbol_ratio=max(0.0, min(1.0, args.max_symbol_ratio)),
                max_consec_nonletters=max(1, args.max_consec_nonletters),
            )
            # append results immediately (continuous write)
            with conf_file.open("a", encoding="utf-8") as f:
                for line in lines:
                    f.write(line + "\n")
            print(f"[align] idd={idd} (conf={conf}) -> {len(lines)} bullets -> {conf_file}")
    else:
        # Single-file mode: (over)write progressively (still streaming per idd)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        # Truncate first
        with out_path.open("w", encoding="utf-8"):
            pass
        for cnt, idd in enumerate(idds, 1):
            lines = process_idd(
                idd=idd,
                slides=slides_by[idd],
                faiss_root=Path(args.faiss_root),
                k_min=max(1, args.k_min),
                k_max=max(args.k_min, args.k_max),
                lambda_div=min(1.0, max(0.0, args.lambda_div)),
                top_k_pool=max(10, args.top_k_pool),
                min_sent_tokens=max(1, args.min_sent_tokens),
                min_bwords=max(1, args.min_bullet_words),
                min_bchars=max(1, args.min_bullet_chars),
                max_digit_ratio=max(0.0, min(1.0, args.max_digit_ratio)),
                min_letter_ratio=max(0.0, min(1.0, args.min_letter_ratio)),
                max_symbol_ratio=max(0.0, min(1.0, args.max_symbol_ratio)),
                max_consec_nonletters=max(1, args.max_consec_nonletters),
            )
            with out_path.open("a", encoding="utf-8") as f:
                for line in lines:
                    f.write(line + "\n")
            print(f"[align] idd={idd} -> {len(lines)} bullets -> {out_path}")

if __name__ == "__main__":
    main()

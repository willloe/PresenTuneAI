#!/usr/bin/env python3
# build_and_expand_hybrid.py
# Singles-only indexing & retrieval over sentences with semantic scores.
# Retrieval uses MMR diversification; adaptive expansion is used only for display/provenance.

import os, json, pickle, argparse, re, math, time, platform
from typing import List, Dict, Tuple, Any, Set
import numpy as np

from rank_bm25 import BM25Okapi
import faiss
from sklearn.metrics.pairwise import cosine_similarity

import nltk
from nltk.corpus import stopwords
from nltk.tokenize import sent_tokenize

from sentence_transformers import SentenceTransformer
import pkg_resources
try:
    from openai import OpenAI
except Exception:
    OpenAI = None

try:
    from beir.util import download_and_unzip
    from beir.datasets.data_loader import GenericDataLoader
except Exception:
    download_and_unzip = None
    GenericDataLoader = None

try:
    from tqdm import tqdm
except Exception:
    tqdm = lambda x, **k: x

# ---------- Helpers & cleanup ----------
WS = re.compile(r"\s+")
CAPTION_START_RE = re.compile(r"^(supplementary|supplemental|table|fig\.?|figure)\b", re.IGNORECASE)
LICENSE_RE = re.compile(r"(nat methods|author manuscript; available in pmc|users may view, print, copy|editorial_policies|license\.html#terms)", re.IGNORECASE)

def clean_text(s: str) -> str:
    return WS.sub(" ", (s or "").strip())

def is_boilerplate_or_caption(text: str) -> bool:
    t = (text or "").strip()
    if not t: return True
    if CAPTION_START_RE.match(t): return True
    if LICENSE_RE.search(t): return True
    return False

def ensure_nltk_resources():
    try: nltk.data.find("corpora/stopwords")
    except LookupError: nltk.download("stopwords", quiet=True)
    try: nltk.data.find("tokenizers/punkt")
    except LookupError: nltk.download("punkt", quiet=True)

def load_sentences(path: str) -> List[Dict[str, str]]:
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        print(f"[ERROR] Failed to read {path}: {e}")
        return []
    out = []
    for d in data:
        t = clean_text(d.get("text", ""))
        if not t:
            continue
        out.append({
            "sid": d.get("sid"),
            "section": d.get("section"),
            "text": t,
        })
    # Deterministic ordering
    out.sort(key=lambda x: (str(x.get("sid") or "")))
    return out

# ---------- BM25 ----------
def make_tokenizer(lang: str = "english"):
    ensure_nltk_resources()
    sw = set(stopwords.words(lang))
    def tok(s: str) -> List[str]:
        toks = clean_text(s).lower().split()
        return [t for t in toks if t not in sw]
    return tok

def build_bm25(sentences: List[Dict[str, str]], output_dir: str):
    tokenizer = make_tokenizer()
    tokenized_corpus = [tokenizer(d["text"]) for d in sentences]
    bm25 = BM25Okapi(tokenized_corpus)
    os.makedirs(output_dir, exist_ok=True)
    with open(os.path.join(output_dir, "bm25_model.pkl"), "wb") as f:
        pickle.dump({"bm25": bm25}, f)
    with open(os.path.join(output_dir, "sentences.json"), "w", encoding="utf-8") as f:
        json.dump(sentences, f, indent=2, ensure_ascii=False)
    print(f"[BM25] Saved to {output_dir}")

def load_bm25(bm25_dir: str):
    with open(os.path.join(bm25_dir, "bm25_model.pkl"), "rb") as f:
        pack = pickle.load(f)
    bm25: BM25Okapi = pack["bm25"]
    tokenizer = make_tokenizer()
    with open(os.path.join(bm25_dir, "sentences.json"), "r", encoding="utf-8") as f:
        sentences = json.load(f)
    return bm25, tokenizer, sentences

# ---------- Embeddings ----------
def embed_sbert(texts: List[str], model_name: str, batch_size: int = 128) -> np.ndarray:
    model = SentenceTransformer(model_name)
    embs = model.encode(texts, convert_to_numpy=True, show_progress_bar=True, batch_size=batch_size)
    return embs.astype("float32")

def embed_openai(texts: List[str], model_name: str, batch_size: int = 256) -> np.ndarray:
    if OpenAI is None:
        raise RuntimeError("OpenAI SDK not available. `pip install openai` and set OPENAI_API_KEY.")
    client = OpenAI()
    vecs = []
    for i in tqdm(range(0, len(texts), batch_size), desc="OpenAI embed"):
        batch = texts[i:i+batch_size]
        for attempt in range(4):
            try:
                resp = client.embeddings.create(model=model_name, input=batch)
                for j in range(len(batch)):
                    vecs.append(resp.data[j].embedding)
                break
            except Exception:
                if attempt == 3: raise
                time.sleep(1.5 * (attempt + 1))
    return np.array(vecs, dtype="float32")

# ---------- FAISS ----------
def build_faiss(sentences: List[Dict[str, str]], output_dir: str,
                emb_backend: str = "sbert", emb_model: str = "all-MiniLM-L6-v2",
                openai_batch_size: int = 256, batch_size: int = 128,
                faiss_factory: str = "Flat", use_gpu: bool = False):
    texts = [d["text"] for d in sentences]
    print(f"[FAISS] Encoding with backend={emb_backend}, model={emb_model} ...")
    if emb_backend == "openai":
        embs = embed_openai(texts, emb_model, batch_size=openai_batch_size)
    else:
        embs = embed_sbert(texts, emb_model, batch_size=batch_size)
    faiss.normalize_L2(embs)
    d = embs.shape[1]
    if faiss_factory and faiss_factory != "Flat":
        factory = faiss_factory
        # Auto-downsize IVF lists based on corpus size if needed
        try:
            m = re.match(r"IVF(\d+)(.*)", factory)
            if m is not None:
                nlist_req = int(m.group(1))
                suffix = m.group(2) or ",Flat"
                n_points = embs.shape[0]
                # Heuristic: nlist ≈ max(16, min(8192, n_points/40))
                rec_nlist = max(16, min(8192, max(1, n_points // 40)))
                if nlist_req > n_points:
                    print(f"[FAISS] Requested IVF{nlist_req} > num points {n_points}. Using IVF{rec_nlist}{suffix} instead.")
                    factory = f"IVF{rec_nlist}{suffix}"
        except Exception:
            pass
        index = faiss.index_factory(d, factory, faiss.METRIC_INNER_PRODUCT)
        if index.is_trained is False:
            print(f"[FAISS] Training index {factory} ...")
            try:
                index.train(embs)
            except Exception as e:
                print(f"[WARN] FAISS training failed for '{factory}': {e}. Falling back to Flat.")
                index = faiss.IndexFlatIP(d)
    else:
        index = faiss.IndexFlatIP(d)
    if use_gpu:
        try:
            res = faiss.StandardGpuResources()
            index = faiss.index_cpu_to_gpu(res, 0, index)
        except Exception as e:
            print(f"[WARN] GPU index init failed: {e}; continuing on CPU")
    index.add(embs)

    os.makedirs(output_dir, exist_ok=True)
    faiss.write_index(index, os.path.join(output_dir, "faiss_index.bin"))
    np.save(os.path.join(output_dir, "embeddings.npy"), embs)

    meta = {i: {"sid": sentences[i]["sid"], "section": sentences[i]["section"]} for i in range(len(sentences))}
    with open(os.path.join(output_dir, "metadata.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)
    with open(os.path.join(output_dir, "sentences.json"), "w", encoding="utf-8") as f:
        json.dump(sentences, f, indent=2, ensure_ascii=False)
    with open(os.path.join(output_dir, "model.json"), "w", encoding="utf-8") as f:
        meta = {
            "backend": emb_backend,
            "model": emb_model,
            "sentence_transformers": (pkg_resources.get_distribution("sentence-transformers").version if emb_backend == "sbert" else None),
            "faiss": getattr(faiss, "__version__", "unknown"),
            "python": platform.python_version(),
            "faiss_factory": faiss_factory,
        }
        json.dump(meta, f, indent=2)
    print(f"[FAISS] Saved to {output_dir}")

def load_faiss(faiss_dir: str):
    index = faiss.read_index(os.path.join(faiss_dir, "faiss_index.bin"))
    embeddings = np.load(os.path.join(faiss_dir, "embeddings.npy"))
    norms = np.linalg.norm(embeddings, axis=1)
    if not np.all((norms > 0.99) & (norms < 1.01)):
        print("[WARN] embeddings not L2 normalized; normalizing now")
        faiss.normalize_L2(embeddings)
    with open(os.path.join(faiss_dir, "metadata.json"), "r", encoding="utf-8") as f:
        meta = json.load(f)
    with open(os.path.join(faiss_dir, "sentences.json"), "r", encoding="utf-8") as f:
        sentences = json.load(f)
    with open(os.path.join(faiss_dir, "model.json"), "r", encoding="utf-8") as f:
        model_info = json.load(f)
    backend = model_info.get("backend", "sbert")
    model_name = model_info.get("model")
    if backend == "sbert":
        enc = SentenceTransformer(model_name)
    elif backend == "openai":
        if OpenAI is None:
            raise RuntimeError("OpenAI SDK not available. `pip install openai` and set OPENAI_API_KEY.")
        enc = OpenAI()
    else:
        raise ValueError(f"Unknown backend: {backend}")
    return index, embeddings, meta, sentences, backend, model_name, enc

def encode_query(query: str, backend: str, model_name: str, enc) -> np.ndarray:
    if backend == "sbert":
        q = enc.encode([query], convert_to_numpy=True).astype("float32")
        faiss.normalize_L2(q)
        return q
    elif backend == "openai":
        resp = enc.embeddings.create(model=model_name, input=[query])
        q = np.array([resp.data[0].embedding], dtype="float32")
        faiss.normalize_L2(q)
        return q
    else:
        raise ValueError(f"Unknown backend: {backend}")

# ---------- SID parsing ----------
SID_RE = re.compile(r"^(.+?)-(\d+)-(\d+)$")
def parse_sid_any(sid: str) -> Tuple[str, int, int]:
    m = SID_RE.match(sid or "")
    if not m: return ("", -1, -1)
    return (m.group(1), int(m.group(2)), int(m.group(3)))

def same_para(sid_a: str, sid_b: str) -> bool:
    a0, a1, _ = parse_sid_any(sid_a)
    b0, b1, _ = parse_sid_any(sid_b)
    return (a0 == b0) and (a1 == b1) and (a0 != "")

# ---------- Expansion ----------
def expand_seed(seed_idx: int, seed_score: float, embeddings: np.ndarray, sentences: List[Dict[str, str]],
                tau: float = 0.55, max_sentences: int = 8, max_tokens: int = 512) -> Dict[str, Any]:
    sid_seed = sentences[seed_idx]["sid"]
    para_indices = []
    i = seed_idx
    while i >= 0 and same_para(sentences[i]["sid"], sid_seed):
        para_indices.append(i); i -= 1
    para_indices.reverse()
    j = seed_idx + 1
    while j < len(sentences) and same_para(sentences[j]["sid"], sid_seed):
        para_indices.append(j); j += 1
    seed_pos = para_indices.index(seed_idx)

    sid_list = [sentences[seed_idx]["sid"]]
    texts = [sentences[seed_idx]["text"]]
    vecs = [embeddings[seed_idx]]
    centroid = np.mean(np.vstack(vecs), axis=0, keepdims=True)
    tokens = len(texts[0].split())
    sid_to_idx = {sentences[k]["sid"]: k for k in range(len(sentences))}

    def try_add(p: int) -> bool:
        nonlocal tokens, centroid, sid_list, texts, vecs
        idx = para_indices[p]
        if is_boilerplate_or_caption(sentences[idx]["text"]):
            return False
        v = embeddings[idx].reshape(1, -1)
        sim_seed = float(cosine_similarity(v, embeddings[sid_to_idx[sid_list[0]]].reshape(1, -1))[0, 0])
        sim_cent = float(cosine_similarity(v, centroid)[0, 0])
        if max(sim_seed, sim_cent) < tau: return False
        if len(sid_list) + 1 > max_sentences: return False
        if tokens + len(sentences[idx]["text"].split()) > max_tokens: return False
        sid_list.append(sentences[idx]["sid"]); texts.append(sentences[idx]["text"]); vecs.append(embeddings[idx])
        tokens += len(sentences[idx]["text"].split())
        centroid = np.mean(np.vstack(vecs), axis=0, keepdims=True)
        return True

    L, R = seed_pos - 1, seed_pos + 1
    grew = True
    while grew:
        grew = False
        if R < len(para_indices) and try_add(R): R += 1; grew = True
        if L >= 0 and try_add(L): L -= 1; grew = True

    return {"sid_list": sid_list, "text": " ".join(texts), "seed_idx": seed_idx, "seed_score": seed_score}

def deduplicate_chunks(chunks: List[Dict[str, Any]], jaccard_thr: float = 0.5) -> List[Dict[str, Any]]:
    kept = []
    for ch in chunks:
        s_new = set(ch["sid_list"]); drop = False; replace_idx = None
        for k, kept_ch in enumerate(kept):
            s_old = set(kept_ch["sid_list"])
            inter = len(s_new & s_old); union = len(s_new | s_old) or 1
            jac = inter / union
            if jac >= jaccard_thr:
                if ch["seed_score"] > kept_ch["seed_score"]: replace_idx = k
                else: drop = True
                break
        if drop: continue
        if replace_idx is not None: kept[replace_idx] = ch
        else: kept.append(ch)
    return kept

def faiss_expand_query(query: str, faiss_dir: str, top_n: int = 8, tau: float = 0.55,
                       max_sentences: int = 8, max_tokens: int = 512, dedup_jaccard: float = 0.5) -> List[Dict[str, Any]]:
    index, embeddings, meta, sentences, backend, model_name, enc = load_faiss(faiss_dir)
    q_emb = encode_query(query, backend, model_name, enc)
    D, I = index.search(q_emb, top_n)
    seeds = [(int(I[0][i]), float(D[0][i])) for i in range(I.shape[1])]
    chunks = []
    for idx, score in seeds:
        ch = expand_seed(idx, score, embeddings, sentences, tau=tau, max_sentences=max_sentences, max_tokens=max_tokens)
        if ch["text"].strip(): chunks.append(ch)
    chunks = deduplicate_chunks(chunks, jaccard_thr=dedup_jaccard)
    chunks.sort(key=lambda x: x["seed_score"], reverse=True)
    return chunks

# ---------- Metrics ----------
def dcg(scores: List[float]) -> float:
    return sum(s / math.log2(i + 2) for i, s in enumerate(scores))
def ndcg_at_k(gains: List[float]) -> float:
    if not gains: return 0.0
    gains_k = gains
    ideal = sorted(gains, reverse=True)
    denom = dcg(ideal)
    return 0.0 if denom == 0 else dcg(gains_k) / denom
def dedup_preserve_order(xs: List[str]) -> List[str]:
    seen = set(); out = []
    for x in xs:
        if x not in seen:
            seen.add(x); out.append(x)
    return out


# ---------- Singles-only retrieval with MMR (semantic-only) ----------
def _mmr_select(
    query_vec: np.ndarray,
    candidate_vecs: np.ndarray,
    candidate_indices: List[int],
    candidate_scores: List[float],
    top_k: int = 8,
    mmr_lambda: float = 0.7,
) -> List[int]:
    """
    Greedy MMR selection. Returns a list of selected indices into candidate_indices.
    query_vec: shape (1, d)
    candidate_vecs: shape (m, d) normalized
    candidate_indices: indices into the global embeddings array
    candidate_scores: similarity to query for each candidate (cosine), length m
    """
    m = len(candidate_indices)
    if m == 0 or top_k <= 0:
        return []
    selected_local: List[int] = []  # indices into [0..m)
    # Precompute candidate-candidate cosine sims for diversity term
    # All vectors are L2-normalized, so dot = cosine
    pairwise = candidate_vecs @ candidate_vecs.T  # (m, m)

    remaining = set(range(m))
    while len(selected_local) < min(top_k, m) and remaining:
        best_local = None
        best_score = -1e9
        for j in list(remaining):
            sim_to_query = float(candidate_scores[j])
            if not selected_local:
                div_penalty = 0.0
            else:
                # max similarity to any selected item
                div_penalty = max(float(pairwise[j, s]) for s in selected_local)
            score = mmr_lambda * sim_to_query - (1.0 - mmr_lambda) * div_penalty
            if score > best_score:
                best_score = score
                best_local = j
        if best_local is None:
            break
        selected_local.append(best_local)
        remaining.remove(best_local)
    return [candidate_indices[j] for j in selected_local]


def faiss_expand_query(
    query: str,
    faiss_dir: str,
    top_k: int = 8,
    pool_size: int = 128,
    mmr_lambda: float = 0.7,
    tau: float = 0.55,
    max_sentences: int = 8,
    max_tokens: int = 512,
) -> List[Dict[str, Any]]:
    """
    Singles-only retrieval using semantic similarity + MMR diversification.
    Adaptive expansion is applied ONLY for display/provenance around each selected sentence.

    Returns list of results sorted by semantic score, each item:
    {
      'sid': str,
      'score': float,  # cosine similarity (semantic-only)
      'text': str,     # the single sentence text
      'provenance': {  # adaptive expansion for display only
          'sid_list': [...],
          'text': '...'
      }
    }
    """
    index, embeddings, meta, sentences, backend, model_name, enc = load_faiss(faiss_dir)
    q_emb = encode_query(query, backend, model_name, enc)

    # Build candidate pool by raw semantic similarity
    pool_n = max(top_k, pool_size)
    D, I = index.search(q_emb, pool_n)
    cand_indices = [int(I[0][i]) for i in range(I.shape[1]) if int(I[0][i]) >= 0]
    cand_scores = [float(D[0][i]) for i in range(len(cand_indices))]
    cand_vecs = embeddings[cand_indices]

    # MMR selection over candidates
    selected_global = _mmr_select(q_emb, cand_vecs, cand_indices, cand_scores, top_k=top_k, mmr_lambda=mmr_lambda)

    # Collect results, keeping original semantic scores
    score_by_idx = {cand_indices[i]: cand_scores[i] for i in range(len(cand_indices))}
    results: List[Dict[str, Any]] = []
    for gi in selected_global:
        seed_score = float(score_by_idx.get(gi, 0.0))
        prov = expand_seed(gi, seed_score, embeddings, sentences, tau=tau, max_sentences=max_sentences, max_tokens=max_tokens)
        results.append({
            "sid": sentences[gi]["sid"],
            "score": seed_score,
            "text": sentences[gi]["text"],
            "provenance": {"sid_list": prov.get("sid_list", []), "text": prov.get("text", "")},
        })
    # Sort by semantic score desc (seed score)
    results.sort(key=lambda r: r["score"], reverse=True)
    return results


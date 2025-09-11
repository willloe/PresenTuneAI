# server.py
import os
import re
import json
import requests
import runpod
from typing import Dict, Any, List

# ---------------- Config ----------------
VLLM_URL = f"http://127.0.0.1:{os.getenv('PORT', '8000')}/v1/chat/completions"
MODEL_NAME = os.getenv("MODEL_PATH", "/workspace/model")
HTTP_TIMEOUT = int(os.getenv("HTTP_TIMEOUT", "300"))
ENABLE_RESPONSE_FORMAT = os.getenv("ENABLE_RESPONSE_FORMAT", "1") not in ("0", "false", "False")

# ---------------- Prompts (unchanged core) ----------------
SYSTEM_PROMPT = (
    "You output ONLY valid JSON. Use double quotes; no trailing commas; no comments; "
    "no extra text; no code fences. Build clean presentation slides from scientific text. "
    "STRICTLY EXCLUDE metadata such as: journal names, issue/volume, DOI, PMC/HHS notices, "
    "copyright or license, author affiliations, emails, submission/received dates, and web links. "
    "Bullets must be short, clear sentences (not fragments). "
    "Do not include equations, symbols, or citations. "
    "Each slide must have a concise noun-phrase title and 3-5 bullets. "
    "Ensure at least one slide provides introduction or context, and at least one slide presents conclusions."
)

USER_TMPL = (
    "Create {n_slides} slides. Titles must be concise noun phrases (e.g., 'Method Overview'). "
    "Bullets must be short, clear sentences that summarize key ideas in plain language. "
    "Avoid redundancy across slides. Do not use citations, numbers like '[1]', or URLs. "
    "Do not include equations. Ensure that one slide introduces the context and another concludes the work. "
    "Output ONLY JSON shaped like:\n"
    "{"
    "\"slide 1\":{\"text\":{\"title\":\"Introduction & Context\",\"bullets\":[\"The field faces a significant challenge\",\"Existing methods struggle to handle complexity\",\"There is a clear gap motivating this study\"]}},"
    "\"slide 2\":{\"text\":{\"title\":\"Proposed Method\",\"bullets\":[\"The approach combines multiple components\",\"The system improves efficiency and accuracy\",\"It differs from prior work by focusing on scalability\"]}},"
    "\"slide 3\":{\"text\":{\"title\":\"Conclusion\",\"bullets\":[\"The method addresses the original challenge\",\"Results demonstrate consistent improvements\",\"Future work can extend the approach to new domains\"]}}"
    "}\n\n"
    "SOURCE TEXT:\n{body}\n\n"
    "Return EXACTLY {n_slides} slides with keys \"slide 1\" through \"slide {n_slides}\" only."
)

# ---------------- Basics ----------------
def clamp_slides(n: int) -> int:
    return max(3, min(int(n), 10))

def _post_chat(messages: List[Dict[str, str]], max_tokens: int) -> Dict[str, Any]:
    payload = {
        "model": MODEL_NAME,
        "messages": messages,
        "temperature": 0.0,
        "max_tokens": max_tokens,
    }
    if ENABLE_RESPONSE_FORMAT:
        payload["response_format"] = {"type": "json_object"}
    r = requests.post(VLLM_URL, json=payload, timeout=HTTP_TIMEOUT)
    r.raise_for_status()
    return r.json()

def ask_vllm(messages: List[Dict[str, str]], max_tokens: int) -> str:
    data = _post_chat(messages, max_tokens)
    return data["choices"][0]["message"]["content"]

def extract_first_json(s: str) -> Dict[str, Any]:
    s = (s or "").strip()
    start = s.find("{")
    if start == -1:
        raise ValueError("No JSON start")
    depth, in_str, esc = 0, False, False
    for i, ch in enumerate(s[start:], start=start):
        if ch == "\\" and not esc:
            esc = True
            continue
        if ch == '"' and not esc:
            in_str = not in_str
        if not in_str:
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    return json.loads(s[start:i+1])
        esc = False
    last = s.rfind("}")
    if last > start:
        return json.loads(s[start:last+1])
    raise ValueError("Unbalanced JSON")

def normalize_slides(obj: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(obj, dict):
        raise ValueError("Top-level must be object")
    cleaned: Dict[str, Any] = {}
    for k, v in obj.items():
        if not isinstance(v, dict):
            continue
        text = v.get("text", {})
        title = (text.get("title") or "").strip()
        bullets = text.get("bullets", [])
        if not title or not isinstance(bullets, list):
            continue
        hb, seen = [], set()
        for b in bullets:
            if not isinstance(b, str):
                continue
            bb = b.strip()
            if not bb or bb in seen:
                continue
            if len(bb) > 240:
                bb = bb[:237].rstrip() + "…"
            hb.append(bb)
            seen.add(bb)
            if len(hb) == 5:
                break
        if 3 <= len(hb) <= 5:
            tt = title[:80].rstrip()
            cleaned[k] = {"text": {"title": tt, "bullets": hb}}
    if not cleaned:
        raise ValueError("No valid slides")
    return cleaned

# ---------------- Model-only repair utilities ----------------
def json_fix_pass(broken_raw: str) -> Dict[str, Any]:
    messages = [
        {"role": "system", "content": "You output ONLY valid JSON. No explanation. No extra text."},
        {"role": "user", "content": "Fix the following malformed JSON and return ONLY a valid JSON object:\n" + broken_raw[:24000]},
    ]
    raw = ask_vllm(messages, max_tokens=4000)
    return extract_first_json(raw)

def repair_missing_slides(text: str, missing_ids: List[int]) -> Dict[str, Any]:
    keys = [f"slide {i}" for i in missing_ids]
    prompt = (
        "Return ONLY a single JSON object whose keys are EXACTLY: "
        + ", ".join(f"\"{k}\"" for k in keys) + ". "
        "Each value must be {\"text\":{\"title\":string,\"bullets\":list of 3-5 short sentences}}. "
        "No extra keys. No commentary.\n\nSOURCE TEXT:\n" + text
    )
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ]
    raw = ask_vllm(messages, max_tokens=2500)
    obj = extract_first_json(raw)
    return {k: v for k, v in obj.items() if k in keys}

def regenerate_all(text: str, n_slides: int, max_tokens: int) -> Dict[str, Any]:
    up = USER_TMPL.replace("{n_slides}", str(n_slides)).replace("{body}", text)
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": up},
    ]
    raw = ask_vllm(messages, max_tokens=max_tokens)
    return extract_first_json(raw)

# ---------------- Sentence rewrite (model-only) ----------
SENT_END_RE = re.compile(r"[.!?]$")
VERBISH_RE  = re.compile(r"\b(is|are|was|were|be|being|been|has|have|had|do|does|did|can|could|will|would|should|may|might|must|improves?|reduces?|increases?|enables?|supports?|provides?|addresses?|demonstrates?|shows?|results?)\b", re.IGNORECASE)
WORDY_RE    = re.compile(r"\b\w{3,}\b")

def _is_fragment(b: str) -> bool:
    if not isinstance(b, str):
        return True
    s = b.strip()
    if not s:
        return True
    has_end = bool(SENT_END_RE.search(s))
    has_verb = bool(VERBISH_RE.search(s)) or bool(re.search(r"\b\w+(ed|ing|es|s)\b", s))
    has_words = len(WORDY_RE.findall(s)) >= 4
    looks_heading = ":" in s and not has_end
    return (not has_end) or (not has_verb) or (not has_words) or looks_heading

def _slides_needing_sentence_fix(slides: Dict[str, Any]) -> Dict[str, List[str]]:
    need: Dict[str, List[str]] = {}
    for k, v in slides.items():
        bullets = (((v or {}).get("text") or {}).get("bullets") or [])
        if any(_is_fragment(b) for b in bullets):
            need[k] = bullets
    return need

def _rewrite_bullets_to_sentences(text: str, subset: Dict[str, List[str]]) -> Dict[str, List[str]]:
    if not subset:
        return {}
    payload = json.dumps(subset, ensure_ascii=False)
    prompt = (
        "Rewrite the following slide bullets into short, complete sentences. "
        "Preserve meaning, tone, and the number of bullets per slide. "
        "Do NOT add or remove bullets. Keep 8–20 words per bullet. "
        "Return ONLY a JSON object mapping slide keys to arrays of rewritten bullets.\n\n"
        "SLIDES:\n" + payload + "\n\n"
        "SOURCE TEXT (for context only):\n" + (text[:10000])
    )
    messages = [
        {"role": "system", "content": "You output ONLY valid JSON. No commentary."},
        {"role": "user", "content": prompt},
    ]
    raw = ask_vllm(messages, max_tokens=2000)
    obj = extract_first_json(raw)
    out: Dict[str, List[str]] = {}
    for k, arr in obj.items():
        if isinstance(arr, list):
            out[k] = [str(x).strip() for x in arr if isinstance(x, (str,))]
    return out

# ---------------- Handler ----------------
def handler(event: Dict[str, Any]) -> Dict[str, Any]:
    ip = (event or {}).get("input") or {}
    text = (ip.get("text") or "").strip()
    slides_target = ip.get("slides_target", 6)

    if not text:
        return {"error": "Provide 'input.text' as a non-empty string."}

    try:
        n_slides = clamp_slides(int(slides_target))
    except Exception:
        n_slides = 6

    length = len(text)
    max_tokens = 6000 if length < 20000 else 9000

    raw = ""
    warnings: List[str] = []
    try:
        user_prompt = USER_TMPL.replace("{n_slides}", str(n_slides)).replace("{body}", text)
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ]

        try:
            raw = ask_vllm(messages, max_tokens=max_tokens)
            obj = extract_first_json(raw)
        except Exception as e1:
            try:
                raw = ask_vllm(messages, max_tokens=min(4000, max_tokens))
                obj = extract_first_json(raw)
            except Exception:
                warnings.append(f"First pass JSON malformed: {type(e1).__name__}. Applied JSON-fix.")
                obj = json_fix_pass(raw if raw else "")

        slides = normalize_slides(obj)

        expected = [f"slide {i}" for i in range(1, n_slides + 1)]
        slides = {k: v for k, v in slides.items() if k in expected}
        have_ids = {int(k.split()[-1]) for k in slides.keys()}
        missing = [i for i in range(1, n_slides + 1) if i not in have_ids]

        if missing:
            try:
                repaired = repair_missing_slides(text, missing)
                repaired_norm = normalize_slides(repaired)
                slides.update({k: v for k, v in repaired_norm.items() if k in [f"slide {i}" for i in missing]})
            except Exception as e2:
                warnings.append(f"Missing-slide repair failed: {type(e2).__name__}.")

        have_ids = {int(k.split()[-1]) for k in slides.keys()}
        still_missing = [i for i in range(1, n_slides + 1) if i not in have_ids]
        if still_missing:
            try:
                regen = regenerate_all(text, n_slides, max_tokens=min(5000, max_tokens))
                regen_norm = normalize_slides(regen)
                for i in still_missing:
                    key = f"slide {i}"
                    if key in regen_norm:
                        slides[key] = regen_norm[key]
            except Exception as e3:
                warnings.append(f"Full regeneration failed: {type(e3).__name__}.")

        ordered = {f"slide {i}": slides[f"slide {i}"] for i in range(1, n_slides + 1) if f"slide {i}" in slides}

        # ---- Sentence repair for fragments ----
        subset = _slides_needing_sentence_fix(ordered)
        if subset:
            try:
                rewrites = _rewrite_bullets_to_sentences(text, subset)
                for sk, new_bullets in rewrites.items():
                    if sk in ordered and new_bullets and len(new_bullets) == len(ordered[sk]["text"]["bullets"]):
                        fixed = []
                        seen = set()
                        for bb in new_bullets:
                            b = bb.strip()
                            if len(b) > 240: b = b[:237].rstrip() + "…"
                            if b and b not in seen:
                                fixed.append(b); seen.add(b)
                            if len(fixed) == 5: break
                        if 3 <= len(fixed) <= 5:
                            ordered[sk]["text"]["bullets"] = fixed
            except Exception:
                warnings.append("Sentence repair failed.")

        resp: Dict[str, Any] = {
            "slides": ordered,
            "requested_slides": n_slides,
            "model_tokens_max": max_tokens,
        }
        if len(ordered) != n_slides:
            warnings.append(f"Returned {len(ordered)} of {n_slides} after model-only repairs.")
        if warnings:
            resp["warning"] = " | ".join(warnings)
        return resp

    except Exception as e:
        return {
            "error": f"Failed to build slides using model-only repairs. {type(e).__name__}: {e}",
            "raw_head": (raw or "")[:800],
        }

runpod.serverless.start({"handler": handler})

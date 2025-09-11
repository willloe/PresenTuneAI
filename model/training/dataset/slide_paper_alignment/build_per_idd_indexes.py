#!/usr/bin/env python3

import argparse, json, os
from pathlib import Path
from typing import Dict, List


def load_paper_by_idd(papers_dir: Path, idd: int) -> List[Dict]:
    # Search all JSONs; each file may contain list or single object
    for p in sorted(papers_dir.glob("*.json")):
        try:
            with p.open("r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            continue
        items = data if isinstance(data, list) else [data]
        for item in items:
            if int(item.get("idd", -1)) == int(idd):
                sents = item.get("sentences", [])
                return sents
    return []


def main():
    ap = argparse.ArgumentParser(description="Build per-idd FAISS sentence-level (singles-only) semantic indexes from papers dir.")
    ap.add_argument("--papers_dir", type=str, required=True)
    ap.add_argument("--faiss_root", type=str, required=True, help="Root dir where per-idd subdirs will be created")
    ap.add_argument("--idd", type=int, default=None, help="If provided, build only this idd")
    ap.add_argument("--emb_backend", choices=["sbert","openai"], default="sbert")
    ap.add_argument("--emb_model", default="all-MiniLM-L6-v2")
    ap.add_argument("--openai_batch_size", type=int, default=256)
    ap.add_argument("--batch_size", type=int, default=128, help="SBERT encode batch size")
    ap.add_argument("--faiss_factory", default="Flat", help="FAISS factory string, e.g., 'Flat', 'IVF4096,Flat', 'HNSW32' ")
    ap.add_argument("--use_gpu", action="store_true")
    args = ap.parse_args()

    papers_dir = Path(args.papers_dir)
    faiss_root = Path(args.faiss_root)
    faiss_root.mkdir(parents=True, exist_ok=True)

    # Gather all idds available in papers
    idds = set()
    for p in sorted(papers_dir.glob("*.json")):
        try:
            with p.open("r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            continue
        items = data if isinstance(data, list) else [data]
        for item in items:
            if "idd" in item and isinstance(item.get("sentences", []), list):
                idds.add(int(item["idd"]))

    if args.idd is not None:
        idds = {int(args.idd)} if int(args.idd) in idds else set()

    from B_build_index import build_faiss

    for idd in sorted(idds):
        sents = load_paper_by_idd(papers_dir, idd)
        if not sents:
            continue
        out_dir = faiss_root / str(idd)
        out_dir.mkdir(parents=True, exist_ok=True)
        # Ensure required keys
        cleaned = []
        for s in sents:
            t = (s.get("text") or "").strip()
            if not t:
                continue
            cleaned.append({
                "sid": s.get("sid"),
                "section": s.get("section"),
                "text": t,
            })
        cleaned.sort(key=lambda x: (str(x.get("sid") or "")))
        build_faiss(cleaned, str(out_dir), emb_backend=args.emb_backend, emb_model=args.emb_model, openai_batch_size=args.openai_batch_size, batch_size=args.batch_size, faiss_factory=args.faiss_factory, use_gpu=bool(args.use_gpu))


if __name__ == "__main__":
    main()



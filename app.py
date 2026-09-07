"""
Local web service: search a word and see it used in real sentences pulled
from BBC RSS articles, shown side by side like Youglish.

Run:
    python3 app.py
Then open http://127.0.0.1:5050
"""
import re
import threading
from datetime import datetime, timezone

from flask import Flask, jsonify, render_template, request

import crawler

app = Flask(__name__)

_index = crawler.load_index()
_refresh_lock = threading.Lock()
_refresh_status = {"running": False, "message": "Index not built yet." if _index is None else "Ready."}


def _word_pattern(word: str) -> re.Pattern:
    escaped = re.escape(word.strip())
    # Match the base form plus a few common inflections (plurals, -ed, -ing)
    # so e.g. searching "negotiate" also surfaces "negotiated"/"negotiating".
    return re.compile(rf"\b{escaped}(?:s|es|d|ed|ing)?\b", re.IGNORECASE)


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/api/status")
def status():
    meta = {}
    if _index:
        meta = {
            "built_at": _index.get("built_at"),
            "article_count": _index.get("article_count"),
            "sentence_count": _index.get("sentence_count"),
        }
    return jsonify({**_refresh_status, **meta, "has_index": _index is not None})


@app.route("/api/refresh", methods=["POST"])
def refresh():
    if _refresh_status["running"]:
        return jsonify({"ok": False, "message": "Refresh already running."}), 409

    def run():
        global _index
        _refresh_status["running"] = True
        try:
            def progress(msg):
                _refresh_status["message"] = msg

            _index = crawler.build_index(progress_cb=progress)
        except Exception as exc:  # keep the server alive even if a crawl run fails
            _refresh_status["message"] = f"Refresh failed: {exc}"
        finally:
            _refresh_status["running"] = False

    threading.Thread(target=run, daemon=True).start()
    return jsonify({"ok": True, "message": "Refresh started."})


@app.route("/api/search")
def search():
    word = request.args.get("q", "").strip()
    if not word:
        return jsonify({"ok": False, "error": "Missing query."}), 400
    if not _index:
        return jsonify({"ok": False, "error": "Index not built yet. Click Refresh first."}), 400

    pattern = _word_pattern(word)
    matches = []
    for item in _index["sentences"]:
        m = pattern.search(item["text"])
        if m:
            matches.append({
                "text": item["text"],
                "match_start": m.start(),
                "match_end": m.end(),
                "article_title": item["article_title"],
                "article_url": item["article_url"],
                "feed": item["feed"],
            })

    # Prefer variety: spread results across different source articles first.
    matches.sort(key=lambda m: m["article_url"])
    deduped = []
    seen_text = set()
    for m in matches:
        if m["text"] in seen_text:
            continue
        seen_text.add(m["text"])
        deduped.append(m)

    return jsonify({
        "ok": True,
        "query": word,
        "count": len(deduped),
        "results": deduped[:60],
    })


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5050, debug=True)

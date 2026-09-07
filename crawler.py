"""
Crawls a fixed list of official BBC RSS feeds, fetches the linked articles,
splits their body text into sentences, and writes everything to cache.json.

This is the indexing step. It is meant to be run manually (or via the
Flask app's "Refresh index" button) — not on every search — so that
searching the word list stays instant.
"""
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

import feedparser
import requests
from bs4 import BeautifulSoup

CACHE_FILE = Path(__file__).parent / "cache.json"

# Official BBC RSS feeds (https://www.bbc.co.uk/news/10628494) covering a
# broad mix of topics so uncommon vocabulary has a better chance of a hit.
FEEDS = [
    "http://feeds.bbci.co.uk/news/rss.xml",
    "http://feeds.bbci.co.uk/news/world/rss.xml",
    "http://feeds.bbci.co.uk/news/uk/rss.xml",
    "http://feeds.bbci.co.uk/news/business/rss.xml",
    "http://feeds.bbci.co.uk/news/politics/rss.xml",
    "http://feeds.bbci.co.uk/news/health/rss.xml",
    "http://feeds.bbci.co.uk/news/education/rss.xml",
    "http://feeds.bbci.co.uk/news/science_and_environment/rss.xml",
    "http://feeds.bbci.co.uk/news/technology/rss.xml",
    "http://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml",
    "http://feeds.bbci.co.uk/sport/rss.xml?edition=uk",
    "http://feeds.bbci.co.uk/news/world/africa/rss.xml",
    "http://feeds.bbci.co.uk/news/world/asia/rss.xml",
    "http://feeds.bbci.co.uk/news/world/europe/rss.xml",
    "http://feeds.bbci.co.uk/news/world/latin_america/rss.xml",
    "http://feeds.bbci.co.uk/news/world/middle_east/rss.xml",
    "http://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml",
]

MAX_ITEMS_PER_FEED = 30
MAX_WORKERS = 8
REQUEST_TIMEOUT = 10
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; PersonalVocabIndexer/1.0; "
        "+local vocabulary study tool, low volume, non-commercial)"
    )
}

_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+(?=[A-Z\"“])")
_ABBREVIATIONS = ("Mr.", "Mrs.", "Ms.", "Dr.", "Prof.", "Sr.", "Jr.", "St.",
                   "U.S.", "U.K.", "e.g.", "i.e.", "vs.", "No.", "Co.")


def _split_sentences(text: str):
    # Protect common abbreviations from being treated as sentence ends.
    placeholder_map = {}
    for i, abbr in enumerate(_ABBREVIATIONS):
        token = f"\x00{i}\x00"
        placeholder_map[token] = abbr
        text = text.replace(abbr, token)

    parts = _SENTENCE_SPLIT_RE.split(text)

    sentences = []
    for part in parts:
        for token, abbr in placeholder_map.items():
            part = part.replace(token, abbr)
        part = part.strip()
        if part:
            sentences.append(part)
    return sentences


def _extract_article_sentences(url: str, session: requests.Session):
    try:
        resp = session.get(url, headers=HEADERS, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
    except requests.RequestException:
        return []

    # Parse from raw bytes rather than resp.text: requests sometimes
    # mis-guesses the charset from headers alone, which mangles accented
    # characters (e.g. "Niño" -> "NiÃ±o"). BeautifulSoup's own detection
    # (from the bytes + any <meta charset>) is more reliable here.
    soup = BeautifulSoup(resp.content, "html.parser")
    article = soup.find("article") or soup

    paragraphs = []
    for p in article.find_all("p"):
        txt = p.get_text(" ", strip=True)
        if len(txt) >= 25:
            paragraphs.append(txt)

    full_text = " ".join(paragraphs)
    sentences = [
        s for s in _split_sentences(full_text)
        if 25 <= len(s) <= 320
    ]
    return sentences


def build_index(progress_cb=None):
    """Crawl every feed + article and write cache.json. Returns the built index dict."""
    session = requests.Session()
    seen_urls = set()
    entries = []  # (url, title, feed_title)

    for feed_url in FEEDS:
        parsed = feedparser.parse(feed_url)
        feed_title = parsed.feed.get("title", feed_url)
        for entry in parsed.entries[:MAX_ITEMS_PER_FEED]:
            link = entry.get("link")
            if not link or link in seen_urls:
                continue
            seen_urls.add(link)
            entries.append((link, entry.get("title", ""), feed_title))

    if progress_cb:
        progress_cb(f"Found {len(entries)} articles across {len(FEEDS)} feeds. Fetching...")

    sentences = []
    done = 0

    def worker(item):
        url, title, feed_title = item
        return url, title, feed_title, _extract_article_sentences(url, session)

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = [pool.submit(worker, item) for item in entries]
        for fut in as_completed(futures):
            url, title, feed_title, sents = fut.result()
            done += 1
            for s in sents:
                sentences.append({
                    "text": s,
                    "article_title": title,
                    "article_url": url,
                    "feed": feed_title,
                })
            if progress_cb and done % 10 == 0:
                progress_cb(f"Fetched {done}/{len(entries)} articles...")

    index = {
        "built_at": datetime.now(timezone.utc).isoformat(),
        "article_count": len(entries),
        "sentence_count": len(sentences),
        "sentences": sentences,
    }
    CACHE_FILE.write_text(json.dumps(index, ensure_ascii=False, indent=0))
    if progress_cb:
        progress_cb(f"Done. Indexed {len(sentences)} sentences from {len(entries)} articles.")
    return index


def load_index():
    if not CACHE_FILE.exists():
        return None
    try:
        return json.loads(CACHE_FILE.read_text())
    except (json.JSONDecodeError, OSError):
        return None


if __name__ == "__main__":
    start = time.time()
    build_index(progress_cb=print)
    print(f"Took {time.time() - start:.1f}s")

# BBC Word Finder

A local, Youglish-style tool: type an English word and see it used in real
sentences pulled from current BBC News RSS articles — one at a time, with
next/previous navigation and text-to-speech playback, plus a full list below.
A **Today's Articles** panel above the search box also lists whatever was
published today, so there is something to read even before you know which
word to look up; opening one plays through its sentences the same way a
search's results do.

## How it works

- `crawler.py` fetches ~17 official BBC RSS feeds (News, World, Business,
  Politics, Health, Science, Technology, Sport, regional editions, etc.),
  downloads each linked article, splits the body text into sentences, and
  writes them all to `cache.json`, alongside a per-article summary (title,
  feed, published date) used by the Today's Articles panel.
- `app.py` is a small Flask server that searches `cache.json` in memory
  (instant) and serves the page. It never talks to the BBC on a search —
  only when you click **Refresh index**.
- The frontend (`templates/index.html`, `static/`) is plain HTML/CSS/JS,
  black-and-white, no build step.

Indexing is manual — click "Refresh index" whenever you want newer articles
(it takes roughly 30–90 seconds and runs in the background).

### Today's Articles

The panel filters the indexed articles down to whichever ones have a
published date matching the visitor's local calendar day, newest first.
Clicking a title loads every sentence extracted from that article into the
same player used for word search, with its next/previous navigation and
text-to-speech — just without a highlighted word, since none was searched
for. The original BBC article is always one tap away via the source link
under the player. If nothing was published yet today, the panel says so and
the search box still works as before.

## Setup

```bash
cd ~/Desktop/BBCWordFinder
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Run

```bash
source venv/bin/activate
python3 app.py
```

Then open <http://127.0.0.1:5050>, click **Refresh index** once to build the
initial index, and start searching.

## Notes

- Word matching is case-insensitive and also catches simple inflections
  (plurals, `-ed`, `-ing`).
- The index is just a JSON file (`cache.json`) — delete it to start fresh.
- This is a personal study tool that makes a modest number of requests to
  BBC's public RSS feeds and article pages; it is not meant for heavy or
  automated bulk scraping.

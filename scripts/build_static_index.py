"""
Builds the search index for the static GitHub Pages site: same crawler as
the local Flask app, but written to docs/cache.json so the static
frontend (docs/index.html) can fetch it directly with no backend.

Run manually:
    python3 scripts/build_static_index.py

Run automatically by .github/workflows/refresh-index.yml on a schedule.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import crawler  # noqa: E402

if __name__ == "__main__":
    crawler.build_index(progress_cb=print, output_path=ROOT / "docs" / "cache.json")

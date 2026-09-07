(() => {
  const form = document.getElementById("search-form");
  const input = document.getElementById("word-input");
  const indexStatus = document.getElementById("index-status");
  const emptyState = document.getElementById("empty-state");
  const noResults = document.getElementById("no-results");
  const player = document.getElementById("player");
  const playerSentence = document.getElementById("player-sentence");
  const playerLink = document.getElementById("player-link");
  const playerFeed = document.getElementById("player-feed");
  const playerCounter = document.getElementById("player-counter");
  const btnPrev = document.getElementById("btn-prev");
  const btnNext = document.getElementById("btn-next");
  const btnListen = document.getElementById("btn-listen");
  const resultList = document.getElementById("result-list");
  const btnRefresh = document.getElementById("btn-refresh");
  const refreshMsg = document.getElementById("refresh-msg");

  let results = [];
  let currentIndex = 0;

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function highlighted(text, start, end) {
    return (
      escapeHtml(text.slice(0, start)) +
      "<mark>" + escapeHtml(text.slice(start, end)) + "</mark>" +
      escapeHtml(text.slice(end))
    );
  }

  function renderPlayer() {
    if (results.length === 0) return;
    const r = results[currentIndex];
    playerSentence.innerHTML = highlighted(r.text, r.match_start, r.match_end);
    playerLink.textContent = r.article_title || r.article_url;
    playerLink.href = r.article_url;
    playerFeed.textContent = r.feed || "";
    playerCounter.textContent = `${currentIndex + 1} / ${results.length}`;
    btnPrev.disabled = currentIndex === 0;
    btnNext.disabled = currentIndex === results.length - 1;

    [...resultList.children].forEach((li, i) => {
      li.classList.toggle("active", i === currentIndex);
    });
    const activeLi = resultList.children[currentIndex];
    if (activeLi) activeLi.scrollIntoView({ block: "nearest" });
  }

  function renderList() {
    resultList.innerHTML = "";
    results.forEach((r, i) => {
      const li = document.createElement("li");
      li.innerHTML = highlighted(r.text, r.match_start, r.match_end)
        .replace("<mark>", "<b>").replace("</mark>", "</b>");
      li.addEventListener("click", () => {
        currentIndex = i;
        renderPlayer();
      });
      resultList.appendChild(li);
    });
  }

  function showState(state) {
    emptyState.hidden = state !== "empty";
    noResults.hidden = state !== "none";
    player.hidden = state !== "results";
    resultList.hidden = state !== "results";
  }

  async function runSearch(word) {
    indexStatus.textContent = "";
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(word)}`);
      const data = await res.json();
      if (!data.ok) {
        indexStatus.textContent = data.error || "Search failed.";
        showState("empty");
        return;
      }
      results = data.results;
      currentIndex = 0;
      if (results.length === 0) {
        showState("none");
        return;
      }
      renderList();
      renderPlayer();
      showState("results");
    } catch (err) {
      indexStatus.textContent = "Could not reach the server.";
      showState("empty");
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const word = input.value.trim();
    if (word) runSearch(word);
  });

  btnPrev.addEventListener("click", () => {
    if (currentIndex > 0) { currentIndex--; renderPlayer(); }
  });
  btnNext.addEventListener("click", () => {
    if (currentIndex < results.length - 1) { currentIndex++; renderPlayer(); }
  });

  btnListen.addEventListener("click", () => {
    if (results.length === 0) return;
    const text = results[currentIndex].text;
    if (!("speechSynthesis" in window)) {
      alert("This browser doesn't support text-to-speech.");
      return;
    }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "en-GB";
    window.speechSynthesis.speak(utter);
  });

  document.addEventListener("keydown", (e) => {
    if (document.activeElement === input) return;
    if (e.key === "ArrowLeft") btnPrev.click();
    if (e.key === "ArrowRight") btnNext.click();
  });

  async function pollStatus() {
    try {
      const res = await fetch("/api/status");
      const data = await res.json();
      if (data.running) {
        refreshMsg.textContent = data.message || "Refreshing…";
        btnRefresh.disabled = true;
      } else {
        btnRefresh.disabled = false;
        if (data.has_index) {
          const built = data.built_at ? new Date(data.built_at).toLocaleString() : "unknown";
          refreshMsg.textContent = `${data.sentence_count} sentences from ${data.article_count} articles · built ${built}`;
        } else {
          refreshMsg.textContent = "No index yet — click Refresh to build one (takes ~1 min).";
        }
      }
    } catch (err) {
      refreshMsg.textContent = "";
    }
  }

  btnRefresh.addEventListener("click", async () => {
    btnRefresh.disabled = true;
    refreshMsg.textContent = "Starting…";
    await fetch("/api/refresh", { method: "POST" });
    pollStatus();
  });

  pollStatus();
  setInterval(pollStatus, 4000);
})();

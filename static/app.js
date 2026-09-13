(() => {
  const form = document.getElementById("search-form");
  const input = document.getElementById("word-input");
  const indexStatus = document.getElementById("index-status");
  const emptyState = document.getElementById("empty-state");
  const noResults = document.getElementById("no-results");
  const stage = document.getElementById("stage");
  const playerSentence = document.getElementById("player-sentence");
  const playerLink = document.getElementById("player-link");
  const playerFeed = document.getElementById("player-feed");
  const playerCounter = document.getElementById("player-counter");
  const btnPrev = document.getElementById("btn-prev");
  const btnNext = document.getElementById("btn-next");
  const btnPlay = document.getElementById("btn-play");
  const btnReplay = document.getElementById("btn-replay");
  const autoplayToggle = document.getElementById("autoplay-toggle");
  const voiceSelect = document.getElementById("voice-select");
  const speedSelect = document.getElementById("speed-select");
  const resultList = document.getElementById("result-list");
  const queueHeading = document.getElementById("queue-heading");
  const btnRefresh = document.getElementById("btn-refresh");
  const refreshMsg = document.getElementById("refresh-msg");
  const todayLoading = document.getElementById("today-loading");
  const todayEmpty = document.getElementById("today-empty");
  const todayList = document.getElementById("today-list");
  const todayCount = document.getElementById("today-count");

  let results = [];
  let currentIndex = 0;
  let currentTokens = [];
  let isSpeaking = false;
  let isPaused = false;

  // ---------- speech synthesis (voice, playback) ----------

  let voices = [];

  function loadVoices() {
    const all = window.speechSynthesis.getVoices();
    voices = all.filter((v) => v.lang.toLowerCase().startsWith("en"));
    if (voices.length === 0) voices = all;

    voiceSelect.innerHTML = "";
    voices.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v.voiceURI;
      opt.textContent = `${v.name} (${v.lang})`;
      voiceSelect.appendChild(opt);
    });

    const ukIndex = voices.findIndex((v) => v.lang.toLowerCase() === "en-gb");
    if (ukIndex >= 0) voiceSelect.selectedIndex = ukIndex;
  }

  if ("speechSynthesis" in window) {
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  } else {
    voiceSelect.disabled = true;
    speedSelect.disabled = true;
    btnPlay.disabled = true;
    btnReplay.disabled = true;
  }

  function getSelectedVoice() {
    return voices.find((v) => v.voiceURI === voiceSelect.value) || null;
  }

  function updatePlayButton() {
    const showPause = isSpeaking && !isPaused;
    btnPlay.innerHTML = showPause ? "&#10073;&#10073;" : "&#9654;";
    btnPlay.classList.toggle("playing", showPause);
  }

  function clearSpeakingHighlight() {
    playerSentence.querySelectorAll(".word.speaking").forEach((s) => s.classList.remove("speaking"));
  }

  function highlightSpeakingWord(charIndex) {
    if (charIndex === undefined || charIndex === null) return;
    let target = null;
    for (const tok of currentTokens) {
      if (charIndex >= tok.start && charIndex < tok.end) { target = tok; break; }
      if (tok.start <= charIndex) target = tok;
    }
    clearSpeakingHighlight();
    if (target) {
      const span = playerSentence.querySelector(`.word[data-start="${target.start}"]`);
      if (span) span.classList.add("speaking");
    }
  }

  function speakCurrent() {
    if (!("speechSynthesis" in window) || results.length === 0) return;
    window.speechSynthesis.cancel();
    isPaused = false;

    const r = results[currentIndex];
    const utter = new SpeechSynthesisUtterance(r.text);
    const voice = getSelectedVoice();
    if (voice) utter.voice = voice;
    utter.lang = voice ? voice.lang : "en-GB";
    utter.rate = parseFloat(speedSelect.value) || 1;

    utter.onboundary = (e) => highlightSpeakingWord(e.charIndex);
    utter.onstart = () => { isSpeaking = true; updatePlayButton(); };
    utter.onend = () => {
      isSpeaking = false;
      isPaused = false;
      updatePlayButton();
      clearSpeakingHighlight();
      if (autoplayToggle.checked && currentIndex < results.length - 1) {
        setTimeout(() => {
          currentIndex++;
          renderPlayer();
          speakCurrent();
        }, 450);
      }
    };
    utter.onerror = () => { isSpeaking = false; isPaused = false; updatePlayButton(); };

    window.speechSynthesis.speak(utter);
  }

  function stopSpeech() {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    isSpeaking = false;
    isPaused = false;
    updatePlayButton();
    clearSpeakingHighlight();
  }

  btnPlay.addEventListener("click", () => {
    if (!isSpeaking && !isPaused) {
      speakCurrent();
    } else if (isSpeaking && !isPaused) {
      window.speechSynthesis.pause();
      isPaused = true;
      updatePlayButton();
    } else if (isPaused) {
      window.speechSynthesis.resume();
      isPaused = false;
      updatePlayButton();
    }
  });

  btnReplay.addEventListener("click", () => {
    speakCurrent();
  });

  autoplayToggle.addEventListener("change", () => {
    if (autoplayToggle.checked && !isSpeaking && !isPaused && results.length > 0) {
      speakCurrent();
    }
  });

  // ---------- rendering ----------

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function buildTokens(text) {
    const tokens = [];
    const re = /\S+/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      tokens.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
    }
    return tokens;
  }

  function renderPlayerSentence(r) {
    currentTokens = buildTokens(r.text);
    playerSentence.innerHTML = "";
    let cursor = 0;
    currentTokens.forEach((tok) => {
      if (tok.start > cursor) {
        playerSentence.appendChild(document.createTextNode(r.text.slice(cursor, tok.start)));
      }
      const span = document.createElement("span");
      span.className = "word";
      span.dataset.start = tok.start;
      const isTarget = tok.start < r.match_end && tok.end > r.match_start;
      if (isTarget) span.classList.add("target");
      span.textContent = tok.text;
      playerSentence.appendChild(span);
      cursor = tok.end;
    });
    if (cursor < r.text.length) {
      playerSentence.appendChild(document.createTextNode(r.text.slice(cursor)));
    }
  }

  function highlightedForList(text, start, end) {
    return (
      escapeHtml(text.slice(0, start)) +
      "<b>" + escapeHtml(text.slice(start, end)) + "</b>" +
      escapeHtml(text.slice(end))
    );
  }

  function renderPlayer() {
    if (results.length === 0) return;
    const r = results[currentIndex];
    renderPlayerSentence(r);
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
      li.innerHTML = highlightedForList(r.text, r.match_start, r.match_end);
      li.addEventListener("click", () => goTo(i));
      resultList.appendChild(li);
    });
  }

  function showState(state) {
    emptyState.hidden = state !== "empty";
    noResults.hidden = state !== "none";
    stage.hidden = state !== "results";
  }

  function goTo(i) {
    if (i < 0 || i >= results.length) return;
    stopSpeech();
    currentIndex = i;
    renderPlayer();
  }

  btnPrev.addEventListener("click", () => goTo(currentIndex - 1));
  btnNext.addEventListener("click", () => goTo(currentIndex + 1));

  document.addEventListener("keydown", (e) => {
    if (document.activeElement === input) return;
    if (e.key === "ArrowLeft") btnPrev.click();
    if (e.key === "ArrowRight") btnNext.click();
    if (e.key === " ") { e.preventDefault(); btnPlay.click(); }
  });

  // ---------- search ----------

  async function runSearch(word) {
    stopSpeech();
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
      queueHeading.textContent = "All examples";
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

  // ---------- today's articles ----------

  function isToday(iso) {
    if (!iso) return false;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return false;
    return d.toDateString() === new Date().toDateString();
  }

  function formatTime(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function renderTodayList(allArticles) {
    todayLoading.hidden = true;
    const todays = (allArticles || []).filter((a) => isToday(a.published));

    todayCount.textContent = todays.length ? String(todays.length) : "";
    todayList.innerHTML = "";

    if (todays.length === 0) {
      todayEmpty.hidden = false;
      todayList.hidden = true;
      return;
    }

    todayEmpty.hidden = true;
    todayList.hidden = false;
    todays.forEach((a) => {
      const li = document.createElement("li");

      const title = document.createElement("span");
      title.className = "today-title";
      title.textContent = a.title || a.url;
      li.appendChild(title);

      if (a.feed) {
        const feedTag = document.createElement("span");
        feedTag.className = "feed-tag";
        feedTag.textContent = a.feed;
        li.appendChild(feedTag);
      }

      if (a.published) {
        const time = document.createElement("span");
        time.className = "today-time";
        time.textContent = formatTime(a.published);
        li.appendChild(time);
      }

      li.addEventListener("click", () => openArticle(a.url));
      todayList.appendChild(li);
    });
  }

  async function openArticle(url) {
    stopSpeech();
    indexStatus.textContent = "";
    try {
      const res = await fetch(`/api/article?url=${encodeURIComponent(url)}`);
      const data = await res.json();
      if (!data.ok || data.results.length === 0) {
        showState("none");
        return;
      }
      results = data.results;
      currentIndex = 0;
      queueHeading.textContent = "Full article";
      renderList();
      renderPlayer();
      showState("results");
    } catch (err) {
      indexStatus.textContent = "Could not reach the server.";
      showState("empty");
    }
  }

  async function loadTodayArticles() {
    try {
      const res = await fetch("/api/articles");
      const data = await res.json();
      renderTodayList(data.ok ? data.articles : []);
    } catch (err) {
      renderTodayList([]);
    }
  }

  // ---------- index status / refresh ----------

  let wasRefreshing = false;

  async function pollStatus() {
    try {
      const res = await fetch("/api/status");
      const data = await res.json();
      if (data.running) {
        wasRefreshing = true;
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
        if (wasRefreshing) {
          wasRefreshing = false;
          loadTodayArticles();
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
  loadTodayArticles();
})();

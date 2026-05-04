/**
 * Client UI: Live timeline, scoped feeds (Yahoo Finance, CBC Politics), channel filters, FAB.
 */

const board = document.getElementById("board");
const refreshedAtEl = document.getElementById("refreshed-at");
const fab = document.getElementById("fab");
const fabRefreshIcon = fab.querySelector(".fab-icon--refresh");
const fabTopIcon = fab.querySelector(".fab-icon--top");
const channelButtons = document.querySelectorAll(".channel-pill");

const SCROLL_TOP_THRESHOLD_PX = 72;

/** @type {'live'|'finance'|'military'|'politics'|'sports'|'other'} */
let activeChannel = "live";

/** @type {Array<object>} */
let liveItems = [];

/** @type {Array<object>} */
let financeFeedItems = [];

/** @type {Array<object>} */
let politicsFeedItems = [];

let errorBannerHtml = "";

function formatTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

/** Exact timestamp for timeline connectors (Live). */
function formatExactTime(isoOrString) {
  if (!isoOrString) return "—";
  const d = new Date(isoOrString);
  if (Number.isNaN(d.getTime())) return String(isoOrString);
  return new Intl.DateTimeFormat("en-CA", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(d);
}

function formatPublished(isoOrString) {
  if (!isoOrString) return "Unknown time";
  const d = new Date(isoOrString);
  if (Number.isNaN(d.getTime())) return isoOrString;
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function parseTimeMs(isoOrString) {
  if (!isoOrString) return null;
  const t = Date.parse(isoOrString);
  return Number.isNaN(t) ? null : t;
}

function sortByPublishedDesc(items) {
  return [...items].sort((a, b) => {
    const ta = parseTimeMs(a.publishedAt);
    const tb = parseTimeMs(b.publishedAt);
    if (ta != null && tb != null) return tb - ta;
    if (ta != null) return -1;
    if (tb != null) return 1;
    return 0;
  });
}

function dedupeByLink(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = item.link || `${item.sourceId}:${item.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/**
 * Keyword routing for Military / Sports / Other / Finance (used on Live sources only).
 */
function inferChannel(title, content, sourceName) {
  const blob = `${title} ${content} ${sourceName}`.toLowerCase();

  const sports =
    /\b(sport|nba|nhl|nfl|mlb|soccer|olymp|raptors|leafs|canadiens|playoff|game\s*\d|world cup|fifa|curling|hockey|basketball|football)\b/i;
  const military =
    /\b(war|military|defence|defense|troop|missile|pentagon|nato|iran|ukraine|strait of hormuz|drone|strike|naval|army)\b/i;
  const finance =
    /\b(finance|business|econom|market|stock|tariff|trade|bank|inflation|oil price|opec|real estate|invest|fed\b|interest rate)\b/i;

  if (sports.test(blob)) return "sports";
  if (military.test(blob)) return "military";
  if (finance.test(blob)) return "finance";
  return "other";
}

function mergeSections(sections) {
  const flat = [];
  for (const section of sections || []) {
    const scope = section.scope || "live";
    for (const item of section.items || []) {
      let channel;
      if (scope === "finance") channel = "finance";
      else if (scope === "politics") channel = "politics";
      else channel = inferChannel(item.title || "", item.content || "", section.name || "");
      flat.push({
        ...item,
        sourceId: section.id,
        sourceName: section.name,
        channel,
      });
    }
  }
  return sortByPublishedDesc(dedupeByLink(flat));
}

function partitionSections(sections) {
  const live = [];
  const finance = [];
  const politics = [];
  for (const s of sections || []) {
    const sc = s.scope || "live";
    if (sc === "finance") finance.push(s);
    else if (sc === "politics") politics.push(s);
    else live.push(s);
  }
  return { live, finance, politics };
}

function financeTabItems() {
  const fromKeywords = liveItems.filter((i) => i.channel === "finance");
  return sortByPublishedDesc(dedupeByLink([...financeFeedItems, ...fromKeywords]));
}

function filterLiveByChannel(channel) {
  return liveItems.filter((it) => it.channel === channel);
}

function renderCard(item) {
  const img = item.imageUrl
    ? `<a class="card-media" href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer"><img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.title || "Article image")}" loading="lazy" /></a>`
    : "";

  const chLabel = escapeHtml(item.channel || "other");
  const top = `<div class="card-top">
        <span class="card-source">${escapeHtml(item.sourceName || "")}</span>
        <span class="card-channel">${chLabel}</span>
      </div>`;

  return `
    <article class="card" data-channel="${chLabel}">
      ${img}
      ${top}
      <h2 class="card-title"><a href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a></h2>
      <div class="card-meta">
        <span>${escapeHtml(item.author || "")}</span>
        <span>${escapeHtml(formatPublished(item.publishedAt))}</span>
      </div>
      <p class="card-body">${escapeHtml(item.content)}</p>
    </article>
  `;
}

/** Live branch card: publication time is only on the axis connector. */
function renderBranchCard(item) {
  const img = item.imageUrl
    ? `<a class="card-media" href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer"><img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.title || "Article image")}" loading="lazy" /></a>`
    : "";

  return `
    <article class="card card--branch">
      ${img}
      <div class="card-top">
        <span class="card-source">${escapeHtml(item.sourceName || "")}</span>
      </div>
      <h2 class="card-title"><a href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a></h2>
      <div class="card-meta">
        <span>${escapeHtml(item.author || "")}</span>
      </div>
      <p class="card-body">${escapeHtml(item.content)}</p>
    </article>
  `;
}

/**
 * One row: left spine + flexing branch line to card (newest → oldest, same order as `items`).
 */
function renderTimelineRow(item) {
  const exact = formatExactTime(item.publishedAt);
  const dt = item.publishedAt ? escapeHtml(item.publishedAt) : "";
  return `
    <div class="tl-row">
      <div class="tl-row__spine">
        <span class="tl-row__dot" aria-hidden="true"></span>
      </div>
      <div class="tl-row__bridge">
        <time class="tl-row__time" datetime="${dt}">${escapeHtml(exact)}</time>
        <div class="tl-row__arm" aria-hidden="true">
          <span class="tl-row__line"></span>
        </div>
      </div>
      <div class="tl-row__card">${renderBranchCard(item)}</div>
    </div>`;
}

function renderLiveTimeline(items) {
  if (!items.length) {
    return `<div class="status">No stories right now. Try refreshing.</div>`;
  }

  const cap = `
    <div class="live-timeline__cap">
      <div class="live-timeline__cap-gutter" aria-hidden="true"></div>
      <div class="live-timeline__cap-main">
        <span class="live-timeline__now">NOW</span>
      </div>
    </div>`;

  const rows = items.map((it) => renderTimelineRow(it)).join("");

  return `<div class="live-timeline">${cap}<div class="live-timeline__list"><div class="live-timeline__stream">${rows}</div></div></div>`;
}

function emptyMessage() {
  return `<div class="status">No stories in this category right now. Try <strong>Live</strong> or refresh.</div>`;
}

function renderBoard() {
  let main = "";
  if (activeChannel === "live") {
    main = renderLiveTimeline(liveItems);
    board.classList.add("board--timeline");
  } else {
    board.classList.remove("board--timeline");
    if (activeChannel === "finance") {
      const merged = financeTabItems();
      main = merged.length ? merged.map((item) => renderCard(item)).join("") : emptyMessage();
    } else if (activeChannel === "politics") {
      main = politicsFeedItems.length
        ? politicsFeedItems.map((item) => renderCard(item)).join("")
        : emptyMessage();
    } else {
      const filtered = filterLiveByChannel(activeChannel);
      main = filtered.length ? filtered.map((item) => renderCard(item)).join("") : emptyMessage();
    }
  }
  board.innerHTML = errorBannerHtml + main;
}

function setFabMode(isTop) {
  if (isTop) {
    fabRefreshIcon.hidden = false;
    fabTopIcon.hidden = true;
    fab.setAttribute("aria-label", "Refresh feed");
    fab.title = "Refresh";
  } else {
    fabRefreshIcon.hidden = true;
    fabTopIcon.hidden = false;
    fab.setAttribute("aria-label", "Back to top");
    fab.title = "Back to top";
  }
}

function onScrollFab() {
  const atTop = window.scrollY < SCROLL_TOP_THRESHOLD_PX;
  setFabMode(atTop);
}

async function loadNews() {
  board.innerHTML = `<div class="status">Loading RSS feeds…</div>`;
  board.classList.remove("board--timeline");
  fab.disabled = true;

  try {
    const res = await fetch("/api/news", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    refreshedAtEl.textContent = formatTime(data.refreshedAt);

    const { live, finance, politics } = partitionSections(data.sections);
    liveItems = mergeSections(live);
    financeFeedItems = mergeSections(finance);
    politicsFeedItems = mergeSections(politics);

    errorBannerHtml =
      data.errors?.length > 0
        ? `<div class="status error">Some sources failed:<br/>${data.errors.map((e) => `${escapeHtml(e.name)}: ${escapeHtml(e.message)}`).join("<br/>")}</div>`
        : "";

    const anyStories = liveItems.length + financeFeedItems.length + politicsFeedItems.length;
    if (!anyStories && !errorBannerHtml) {
      board.innerHTML = `<div class="status">No data available.</div>`;
    } else {
      renderBoard();
    }
  } catch (e) {
    refreshedAtEl.textContent = "—";
    board.innerHTML = `<div class="status error">Failed to load: ${escapeHtml(e.message)}</div>`;
  } finally {
    fab.disabled = false;
    onScrollFab();
  }
}

function onFabClick() {
  const atTop = window.scrollY < SCROLL_TOP_THRESHOLD_PX;
  if (atTop) {
    loadNews();
  } else {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

channelButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const ch = btn.dataset.channel;
    if (!ch) return;
    activeChannel = ch;
    channelButtons.forEach((b) => b.classList.toggle("is-active", b === btn));
    renderBoard();
  });
});

fab.addEventListener("click", onFabClick);
window.addEventListener("scroll", onScrollFab, { passive: true });

onScrollFab();
loadNews();

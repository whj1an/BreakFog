import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import * as cheerio from "cheerio";
import Parser from "rss-parser";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const parser = new Parser({
  customFields: {
    item: [
      ["media:content", "mediaContent", { keepArray: true }],
      ["media:thumbnail", "mediaThumbnail", { keepArray: true }],
      ["content:encoded", "contentEncoded"],
      ["dc:creator", "dcCreator"],
    ],
  },
});

/**
 * scope:
 * - live: merged into the Live timeline only (not Yahoo Finance).
 * - finance: Yahoo Finance CA RSS; shown in Finance tab only.
 * - politics: CBC Politics RSS; shown in Politics tab only.
 */
const SOURCES = [
  {
    id: "cbc",
    name: "CBC News",
    feedUrl: "https://rss.cbc.ca/lineup/topstories.xml",
    scope: "live",
  },
  {
    id: "ctv",
    name: "CTV News",
    // Site RSS is often 404; Google News site search still resolves to ctvnews.ca articles.
    feedUrl:
      "https://news.google.com/rss/search?q=site:www.ctvnews.ca&hl=en-CA&gl=CA&ceid=CA:en",
    scope: "live",
  },
  {
    id: "global",
    name: "Global News",
    feedUrl: "https://globalnews.ca/feed/",
    scope: "live",
  },
  {
    id: "google",
    name: "Google News (Canada)",
    feedUrl: "https://news.google.com/rss?hl=en-CA&gl=CA&ceid=CA:en",
    scope: "live",
  },
  {
    id: "yahoofinance",
    name: "Yahoo Finance Canada",
    feedUrl: "https://ca.finance.yahoo.com/news/rssindex",
    scope: "finance",
  },
  {
    id: "cbc-politics",
    name: "CBC Politics",
    feedUrl: "https://rss.cbc.ca/lineup/politics.xml",
    scope: "politics",
  },
];

function stripHtml(html) {
  if (!html) return "";
  const $ = cheerio.load(html, { xml: { decodeEntities: true } });
  return $.root().text().replace(/\s+/g, " ").trim();
}

function pickImage(item) {
  const mc = item.mediaContent;
  if (Array.isArray(mc) && mc[0]?.$?.url) return mc[0].$.url;
  if (mc?.$?.url) return mc.$.url;

  const mt = item.mediaThumbnail;
  if (Array.isArray(mt) && mt[0]?.$?.url) return mt[0].$.url;
  if (mt?.$?.url) return mt.$.url;

  if (item.enclosure?.type?.startsWith("image/") && item.enclosure.url) {
    return item.enclosure.url;
  }

  const encoded = item.contentEncoded || item["content:encoded"];
  if (encoded) {
    const $ = cheerio.load(encoded);
    const src = $("img").first().attr("src");
    if (src) return src;
  }

  if (item.content) {
    const $ = cheerio.load(item.content);
    const src = $("img").first().attr("src");
    if (src) return src;
  }

  return null;
}

function pickAuthor(item) {
  if (item.dcCreator) return String(item.dcCreator);
  if (item.creator) return String(item.creator);
  if (item.author) return String(item.author);
  return null;
}

function pickContent(item) {
  const encoded = item.contentEncoded || item["content:encoded"];
  if (encoded) {
    const text = stripHtml(encoded);
    if (text) return text;
  }
  if (item.contentSnippet) return item.contentSnippet.trim();
  if (item.content) return stripHtml(item.content);
  if (item.summary) return stripHtml(item.summary);
  return "";
}

function itemLink(raw) {
  if (raw.link) return raw.link;
  const g = raw.guid;
  if (typeof g === "string") return g;
  if (g && typeof g === "object" && g._) return g._;
  return "";
}

function normalizeItem(raw, sourceName) {
  const title = (raw.title || "").trim();
  const link = itemLink(raw);
  const publishedAt = raw.pubDate || raw.isoDate || null;
  const imageUrl = pickImage(raw);
  const author = pickAuthor(raw);
  let content = pickContent(raw);
  if (!content && title) content = "Summary unavailable; open the article for full text.";

  return {
    title,
    link,
    publishedAt,
    content,
    imageUrl,
    author: author || sourceName,
  };
}

async function fetchFeed(source) {
  const feed = await parser.parseURL(source.feedUrl);
  const items = (feed.items || []).slice(0, 8).map((it) => normalizeItem(it, source.name));
  return {
    id: source.id,
    name: source.name,
    feedTitle: feed.title || source.name,
    scope: source.scope || "live",
    items,
  };
}

const app = express();
const PORT = process.env.PORT || 3840;

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/news", async (_req, res) => {
  const refreshedAt = new Date().toISOString();
  const results = await Promise.allSettled(SOURCES.map((s) => fetchFeed(s)));

  const sections = [];
  const errors = [];

  results.forEach((r, i) => {
    const src = SOURCES[i];
    if (r.status === "fulfilled") {
      sections.push(r.value);
    } else {
      errors.push({ id: src.id, name: src.name, message: String(r.reason?.message || r.reason) });
    }
  });

  res.json({ refreshedAt, sections, errors });
});

app.listen(PORT, () => {
  console.log(`News hub: http://localhost:${PORT}`);
});

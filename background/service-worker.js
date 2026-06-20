// service-worker.js — 接收 content script 消息，转发到后端 8100
// 消息类型：
//   { type: "lookup", words: [...] }       → POST /vocab/lookup
//   { type: "translate-zh", word: "..." }   → GET  /vocab/translate-zh
//   { type: "mark-learning", word: "..." }  → POST /vocab/mark-learning
//   { type: "health" }                      → GET  /health

const API_BASE = "http://127.0.0.1:8100";

// 进程内缓存：避免重复请求
const translateCache = new Map();   // word -> { translation, pos, phonetic, cached, source, ts }
const lookupCache = new Map();      // signature -> { results, summary, ts }
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

function cacheGet(map, key) {
  const v = map.get(key);
  if (!v) return null;
  if (Date.now() - v.ts > CACHE_TTL_MS) {
    map.delete(key);
    return null;
  }
  return v.value;
}

function cacheSet(map, key, value) {
  map.set(key, { value, ts: Date.now() });
  // 上限保护：每个 cache 最多 1000 条
  if (map.size > 1000) {
    const firstKey = map.keys().next().value;
    map.delete(firstKey);
  }
}

async function handleLookup(words) {
  const sig = words.slice().sort().join("|");
  const cached = cacheGet(lookupCache, sig);
  if (cached) return cached;
  const resp = await fetch(`${API_BASE}/vocab/lookup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ words }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`lookup ${resp.status}: ${text.slice(0, 200)}`);
  }
  const data = await resp.json();
  cacheSet(lookupCache, sig, data);
  return data;
}

async function handleTranslate(word) {
  const cached = cacheGet(translateCache, word);
  if (cached) return { ...cached, cached: true };
  const url = `${API_BASE}/vocab/translate-zh?word=${encodeURIComponent(word)}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`translate-zh ${resp.status}: ${text.slice(0, 200)}`);
  }
  const data = await resp.json();
  cacheSet(translateCache, word, data);
  return data;
}

async function handleMarkLearning(word) {
  const resp = await fetch(`${API_BASE}/vocab/mark-learning`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ word }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`mark-learning ${resp.status}: ${text.slice(0, 200)}`);
  }
  return await resp.json();
}

async function handleTTS(word) {
  const resp = await fetch(`${API_BASE}/api/tts/synthesize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: word }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`tts ${resp.status}: ${text.slice(0, 200)}`);
  }
  return await resp.json();
}

async function handleHealth() {
  try {
    const resp = await fetch(`${API_BASE}/health`);
    if (!resp.ok) return { ok: false, status: resp.status };
    return { ok: true, data: await resp.json() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      let data;
      switch (msg.type) {
        case "lookup":
          data = await handleLookup(msg.words || []);
          break;
        case "translate-zh":
          data = await handleTranslate(msg.word);
          break;
        case "mark-learning":
          data = await handleMarkLearning(msg.word);
          break;
        case "tts":
          data = await handleTTS(msg.word);
          break;
        case "health":
          data = await handleHealth();
          break;
        default:
          sendResponse({ error: `unknown message type: ${msg.type}` });
          return;
      }
      sendResponse({ ok: true, data });
    } catch (e) {
      sendResponse({ error: e.message || String(e) });
    }
  })();
  // 必须返回 true 表示异步 sendResponse
  return true;
});

// 安装时打日志
chrome.runtime.onInstalled.addListener(() => {
  console.log("[IWR bg] installed");
});
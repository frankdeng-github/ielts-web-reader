// content.js - 简单稳健版 (hydra-safe)
// 关键: 必须在 React hydrate 完成后才能改 DOM
// 策略: 第一次只 scan 不 wrap, 等 React 完事再 wrap
(function () {
  "use strict";
  const log = (msg) => console.log("[IWR]", msg);

  // 配置: 前 N ms 内不修改 DOM (只 scan)
  const SAFE_WRAP_DELAY_MS = 3000;  // NYT 主页 hydration 慢, 设 3s 保守
  const startTime = performance.now();
  const canWrap = () => performance.now() - startTime > SAFE_WRAP_DELAY_MS;

  async function lookupAndHighlight(words) {
    if (words.length === 0) return;
    log(`lookup ${words.length} words`);
    let resp;
    try {
      resp = await chrome.runtime.sendMessage({ type: "lookup", words });
    } catch (e) {
      log("bg comm failed: " + e.message);
      return;
    }
    if (!resp || resp.error) { log("lookup failed:", resp?.error); return; }
    const payload = resp.data || resp;
    if (!payload || !Array.isArray(payload.results)) { log("invalid payload"); return; }
    const targets = new Set();
    for (const r of payload.results) {
      if (r.in_vocab && r.is_basic === false && r.mastered === false) targets.add(r.word);
    }
    log(`-> ${targets.size} advanced_unknown (basic ${payload.summary?.basic || 0} skipped)`);
    if (targets.size > 0 && window.__iwr_highlight) {
      if (!canWrap()) {
        log(`hydrate not done, defer wrap by 500ms (${(performance.now() - startTime).toFixed(0)}ms elapsed)`);
        setTimeout(() => {
          const cnt = window.__iwr_highlight.highlightWords(targets);
          log(`wrapped ${cnt} spans (deferred)`);
        }, 600);
      } else {
        const cnt = window.__iwr_highlight.highlightWords(targets);
        log(`wrapped ${cnt} spans`);
      }
    }
  }

  function scanAllWords() {
    if (!window.__iwr_scanner) return [];
    const seen = new Set();
    const out = [];
    const scanner = window.__iwr_scanner;
    const walker = document.createTreeWalker(
      document.body || document.documentElement,
      NodeFilter.SHOW_TEXT,
      { acceptNode: (n) => scanner.isSkippable(n.parentElement) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT }
    );
    let n;
    while ((n = walker.nextNode()) && out.length < 500) {
      const text = n.nodeValue || "";
      const matches = text.match(/[A-Za-z][A-Za-z'-]{2,}/g);
      if (!matches) continue;
      for (const m of matches) {
        const w = m.toLowerCase();
        if (seen.has(w)) continue;
        seen.add(w);
        out.push(w);
        if (out.length >= 500) break;
      }
    }
    return out;
  }

  function runOnce() {
    const words = scanAllWords();
    if (words.length === 0) { log("scan: 0 words"); return; }
    lookupAndHighlight(words);
  }

  function start() {
    log(`start (hydrate-safe: wrap deferred ${SAFE_WRAP_DELAY_MS}ms)`);
    runOnce();
    setTimeout(runOnce, 800);
    setTimeout(runOnce, 2000);
    setTimeout(runOnce, 4000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      log("URL changed -> " + location.href);
      lastUrl = location.href;
      runOnce();
      setTimeout(runOnce, 1500);
    }
  }, 1000);
})();
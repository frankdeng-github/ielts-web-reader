// highlight.js — 把 lookup 结果中"未掌握的 3000+ 重点词"包裹成 <span>
// 策略：扫描 text node，用 lookup 集合过滤后替换
// 防止重入：所有生成的 span 加 data-iwr-skip 属性 + iwr-unknown class

(function () {
  "use strict";
  if (window.__iwr_highlight_loaded__) return;
  window.__iwr_highlight_loaded__ = true;

  const SKIP_ATTR = window.__iwr_scanner?.SKIP_ATTR || "data-iwr-skip";
  const WORD_RE = /[A-Za-z][A-Za-z'-]{2,}/g;

  function wrapWord(textNode, word) {
    const text = textNode.nodeValue;
    const re = new RegExp(`\\b${escapeRe(word)}\\b`, "i");
    const m = text.match(re);
    if (!m) return null;
    const idx = m.index;
    const before = text.slice(0, idx);
    const matched = text.slice(idx, idx + m[0].length);
    const after = text.slice(idx + m[0].length);

    const span = document.createElement("span");
    span.className = "iwr-unknown";
    span.setAttribute("data-word", word.toLowerCase());
    span.setAttribute(SKIP_ATTR, "1");  // 防止重入扫描
    span.textContent = matched;

    const frag = document.createDocumentFragment();
    if (before) frag.appendChild(document.createTextNode(before));
    frag.appendChild(span);
    if (after) frag.appendChild(document.createTextNode(after));
    textNode.parentNode.replaceChild(frag, textNode);
    return span;
  }

  function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function highlightWords(targetWords) {
    // targetWords: Set<string> (lower-case)
    if (!targetWords || targetWords.size === 0) return 0;
    const scanner = window.__iwr_scanner;
    if (!scanner) return 0;

    let count = 0;
    // 收集 text nodes 后一次性处理（避免实时修改导致 TreeWalker 中断）
    const nodes = [];
    const walker = document.createTreeWalker(
      document.body || document.documentElement,
      NodeFilter.SHOW_TEXT,
      { acceptNode: (n) => scanner.isSkippable(n.parentElement) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT }
    );
    let n;
    while ((n = walker.nextNode())) nodes.push(n);

    for (const node of nodes) {
      if (!node.parentNode) continue;  // 已被前面的 wrap 替换
      const text = node.nodeValue || "";
      // 找本页所有 target word 是否在此 text 里
      const found = [];
      let m;
      WORD_RE.lastIndex = 0;
      while ((m = WORD_RE.exec(text)) !== null) {
        const w = m[0].toLowerCase();
        if (targetWords.has(w)) found.push({ idx: m.index, len: m[0].length, word: w });
      }
      if (found.length === 0) continue;

      // 从后往前 wrap，避免 index 错位
      for (let i = found.length - 1; i >= 0; i--) {
        const { idx, len, word } = found[i];
        const before = text.slice(0, idx);
        const matched = text.slice(idx, idx + len);
        const after = text.slice(idx + len);
        const span = document.createElement("span");
        span.className = "iwr-unknown";
        span.setAttribute("data-word", word);
        span.setAttribute(SKIP_ATTR, "1");
        // inline style + !important 双保险, 防止 NYT 的 CSS 覆盖
        span.setAttribute(
          "style",
          "border-bottom: 2px dotted #ffd966 !important; background: rgba(255, 217, 102, 0.12) !important; padding: 1px 2px !important; cursor: help !important; border-radius: 2px !important;"
        );
        span.textContent = matched;
        const frag = document.createDocumentFragment();
        if (before) frag.appendChild(document.createTextNode(before));
        frag.appendChild(span);
        if (after) frag.appendChild(document.createTextNode(after));
        if (node.parentNode) node.parentNode.replaceChild(frag, node);
        count++;
      }
    }
    return count;
  }

  window.__iwr_highlight = { highlightWords };
})();
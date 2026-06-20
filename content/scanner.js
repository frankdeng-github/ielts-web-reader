// scanner.js — 扫描页面文本节点，提取英文 token
// 提取规则：词长 ≥3 / 首字母 [A-Za-z] / 后续 [A-Za-z'-]
// 跳过节点: script / style / code / pre / textarea / input / noscript / 扩展自身标记

(function () {
  "use strict";
  // 防止重复注入
  if (window.__iwr_scanner_loaded__) return;
  window.__iwr_scanner_loaded__ = true;

  const SKIP_TAGS = new Set([
    "SCRIPT", "STYLE", "CODE", "PRE", "TEXTAREA", "INPUT",
    "NOSCRIPT", "IFRAME", "CANVAS", "SVG", "MATH",
  ]);
  const SKIP_ATTR = "data-iwr-skip";
  const WORD_RE = /[A-Za-z][A-Za-z'-]{2,}/g;
  const MAX_WORDS = 500;

  function isSkippable(node) {
    if (!node) return true;
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    if (SKIP_TAGS.has(node.tagName)) return true;
    if (node.isContentEditable) return true;
    if (node.closest && node.closest(`[${SKIP_ATTR}]`)) return true;
    return false;
  }

  function extractFromTextNode(textNode) {
    const parent = textNode.parentElement;
    if (!parent || isSkippable(parent)) return [];
    const text = textNode.nodeValue || "";
    if (!text || text.length < 3) return [];
    const matches = text.match(WORD_RE);
    if (!matches) return [];
    return matches.map((w) => w.toLowerCase());
  }

  function scanDocument(root) {
    const seen = new Set();
    const words = [];
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const p = node.parentElement;
          if (!p || isSkippable(p)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      }
    );
    let node;
    while ((node = walker.nextNode())) {
      if (words.length >= MAX_WORDS) break;
      const tokens = extractFromTextNode(node);
      for (const t of tokens) {
        if (words.length >= MAX_WORDS) break;
        if (seen.has(t)) continue;
        seen.add(t);
        words.push(t);
      }
    }
    return words;
  }

  // 暴露给 content.js 调用
  window.__iwr_scanner = {
    scanDocument,
    extractFromTextNode,
    isSkippable,
    SKIP_ATTR,
    MAX_WORDS,
  };
})();
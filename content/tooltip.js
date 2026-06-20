// tooltip.js — hover 显示中文翻译 + [+ 加入学习] 按钮
// 使用事件委托：监听 document 上的 mouseover，匹配 .iwr-unknown

(function () {
  "use strict";
  if (window.__iwr_tooltip_loaded__) return;
  window.__iwr_tooltip_loaded__ = true;

  let activeSpan = null;
  let tipEl = null;
  let pendingWord = null;

  function ensureTip() {
    if (tipEl) return tipEl;
    tipEl = document.createElement("div");
    tipEl.className = "iwr-tooltip";
    tipEl.setAttribute("data-iwr-skip", "1");
    tipEl.style.display = "none";
    document.body.appendChild(tipEl);
    return tipEl;
  }

  let hideTimer = null;
  let showTimer = null;

  function triggerShow(span) {
    if (activeSpan === span) return;
    if (showTimer) {
      clearTimeout(showTimer);
      showTimer = null;
    }
    // 延迟 180ms 触发（Hover Intent），防止快速划过页面时弹窗疯狂跳动
    showTimer = setTimeout(() => {
      show(span);
      showTimer = null;
    }, 180);
  }

  function show(span) {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    activeSpan = span;

    const word = span.getAttribute("data-word");
    if (!word) return;
    const tip = ensureTip();
    tip.innerHTML = `<div class="iwr-loading">翻译 "${word}"…</div>`;
    position(tip, span);
    tip.style.display = "block";

    // 预加载/合成语音接口（并发预热缓存，优化后续播放速度）
    chrome.runtime.sendMessage(
      { type: "tts", word },
      () => {} // 静默预热
    );

    // 通过 background 拿翻译
    pendingWord = word;
    chrome.runtime.sendMessage(
      { type: "translate-zh", word },
      (resp) => {
        if (pendingWord !== word) return;  // 用户已经 hover 到别的词
        if (chrome.runtime.lastError) {
          tip.innerHTML = `<div class="iwr-err">⚠️ 后端未响应<br><small>${escapeHtml(chrome.runtime.lastError.message || "")}</small></div>`;
          return;
        }
        if (!resp || resp.error) {
          tip.innerHTML = `<div class="iwr-err">⚠️ ${escapeHtml(resp?.error || "未知错误")}</div>`;
          return;
        }
        const payload = resp.data || resp;
        renderTranslation(tip, word, payload);
      }
    );
  }

  function renderTranslation(tip, word, resp) {
    const phonetic = resp.phonetic ? `<span class="iwr-phonetic">${escapeHtml(resp.phonetic)}</span>` : "";
    const pos = resp.pos ? `<span class="iwr-pos">${escapeHtml(resp.pos)}</span>` : "";
    const cachedTag = resp.cached ? `<span class="iwr-cache" title="命中 cache">⚡</span>` : "";
    tip.innerHTML = `
      <div class="iwr-word-row">
        <span class="iwr-word">${escapeHtml(word)}</span>
        <button class="iwr-btn-play" title="播放读音">🔊</button>
        ${pos}${phonetic}${cachedTag}
      </div>
      <div class="iwr-translation">${escapeHtml(resp.translation || "暂无翻译")}</div>
      <button class="iwr-btn-add" data-word="${escapeHtml(word)}">+ 加入学习</button>
    `;
    
    // 播放读音逻辑
    const playBtn = tip.querySelector(".iwr-btn-play");
    if (playBtn) {
      playBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        playBtn.disabled = true;
        playBtn.textContent = "⌛";
        chrome.runtime.sendMessage(
          { type: "tts", word },
          (tresp) => {
            playBtn.disabled = false;
            playBtn.textContent = "🔊";
            if (chrome.runtime.lastError || !tresp || tresp.error) {
              console.error("TTS failed:", chrome.runtime.lastError || tresp?.error);
              return;
            }
            const payload = tresp.data || tresp;
            if (payload.audio_url) {
              const audio = new Audio(`http://127.0.0.1:8100${payload.audio_url}`);
              audio.play().catch(err => console.error("Audio play failed:", err));
            }
          }
        );
      });
    }

    const btn = tip.querySelector(".iwr-btn-add");
    if (btn) {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        btn.disabled = true;
        btn.textContent = "加入中…";
        chrome.runtime.sendMessage(
          { type: "mark-learning", word },
          (resp) => {
            if (chrome.runtime.lastError || !resp || resp.error) {
              btn.textContent = "❌ 失败";
              btn.disabled = false;
              return;
            }
            const payload = resp.data || resp;
            if (payload.added) {
              btn.textContent = "✓ 已加入学习";
              btn.classList.add("iwr-btn-done");
            } else {
              btn.textContent = "已在学习列表";
              btn.classList.add("iwr-btn-done");
            }
          }
        );
      });
    }
  }

  function position(tip, span) {
    const r = span.getBoundingClientRect();
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;
    tip.style.left = (r.left + scrollX + r.width / 2) + "px";
    
    // 智能定位：如果单词距离浏览器顶部不足 100px，则把弹窗显示在单词下方，防止被顶部裁剪隐藏
    if (r.top < 100) {
      tip.style.top = (r.bottom + scrollY + 8) + "px";
      tip.style.transform = "translate(-50%, 0)";
    } else {
      tip.style.top = (r.top + scrollY - 8) + "px";
      tip.style.transform = "translate(-50%, -100%)";
    }
  }

  function hide() {
    if (tipEl) tipEl.style.display = "none";
    activeSpan = null;
    pendingWord = null;
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    if (showTimer) {
      clearTimeout(showTimer);
      showTimer = null;
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  let cachedSpans = [];
  let lastSpanUpdate = 0;

  function getSpans() {
    const now = Date.now();
    if (now - lastSpanUpdate > 500 || cachedSpans.length === 0) {
      cachedSpans = document.querySelectorAll(".iwr-unknown");
      lastSpanUpdate = now;
    }
    return cachedSpans;
  }

  // 穿透透明遮罩层获取鼠标下方的真实高亮元素（物理坐标包围盒碰撞检测，彻底解决多层遮罩覆盖问题）
  function getElementUnderMouse(e) {
    const target = e.target;
    if (!target) return null;
    
    // 1. 优先尝试直接命中
    let span = target.closest && target.closest(".iwr-unknown");
    if (span) return span;
    
    // 2. 物理坐标碰撞检测：遍历所有高亮 span，看鼠标坐标是否在其 bounding rect 内部
    const x = e.clientX;
    const y = e.clientY;
    const spans = getSpans();
    for (let i = 0; i < spans.length; i++) {
      const s = spans[i];
      const r = s.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        return s;
      }
    }
    return null;
  }

  // 统一使用 mousemove 监听，解决在同一个大卡片遮罩层内部移动时，浏览器不触发 mouseover/mouseout 的问题
  document.addEventListener("mousemove", (e) => {
    const span = getElementUnderMouse(e);
    const tip = e.target.closest && e.target.closest(".iwr-tooltip");
    
    if (span) {
      // 准备显示，清除可能存在的隐藏定时器
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
      triggerShow(span);
    } else if (tip) {
      // 在弹窗上移动时，清除一切定时器，保持弹窗不消失，同时清除 pending 的 show 任务
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
      if (showTimer) {
        clearTimeout(showTimer);
        showTimer = null;
      }
    } else {
      // 既不在高亮单词上，也不在弹窗上
      // 清除未完成的显示任务
      if (showTimer) {
        clearTimeout(showTimer);
        showTimer = null;
      }
      // 延迟 400ms 关闭，给用户足够的时间将鼠标移动到弹窗上
      if (activeSpan && !hideTimer) {
        hideTimer = setTimeout(() => {
          hide();
        }, 400);
      }
    }
  }, true);

  // 点击页面其他地方关闭
  document.addEventListener("click", (e) => {
    if (tipEl && !tipEl.contains(e.target) && !e.target.closest(".iwr-unknown")) {
      hide();
    }
  });

  // 页面滚动时关闭，防止弹窗悬空，同时重置活动状态
  window.addEventListener("scroll", hide, { passive: true });
})();
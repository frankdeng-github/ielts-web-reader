// popup.js — 显示后端健康状态 + 词库规模

const $dot = document.getElementById("status-dot");
const $backend = document.getElementById("backend-status");
const $vocab = document.getElementById("vocab-count");
const $btn = document.getElementById("check-btn");

async function check() {
  $backend.textContent = "检查中…";
  $dot.className = "dot";
  $vocab.textContent = "—";

  try {
    const resp = await chrome.runtime.sendMessage({ type: "health" });
    if (chrome.runtime.lastError) {
      $backend.textContent = "通信失败";
      $dot.className = "dot err";
      return;
    }
    if (!resp?.ok) {
      $backend.textContent = "❌ 离线";
      $dot.className = "dot err";
      return;
    }
    const d = resp.data.data || resp.data;
    if (d.status === "ok") {
      $backend.textContent = "✅ 在线";
      $dot.className = "dot ok";
      $vocab.textContent = `${d.db_vocab?.toLocaleString() || "?"} 词`;
    } else {
      $backend.textContent = "❌ 异常";
      $dot.className = "dot err";
    }
  } catch (e) {
    $backend.textContent = "❌ 错误: " + e.message;
    $dot.className = "dot err";
  }
}

$btn.addEventListener("click", check);
check();
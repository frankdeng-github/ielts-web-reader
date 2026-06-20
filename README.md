# IELTS Web Reader (Chrome 扩展)

读英文网页时，hover 显示你**还没掌握的 3000+ 雅思重点词**的中文翻译，一键加入 SM-2 学习队列。

> 配套后端：[ielts-must-pass](https://github.com/frankdeng-github/ielts-must-pass) (FastAPI, port 8100)
> 配套文档：[`docs/SPEC_web_reader.md`](docs/SPEC_web_reader.md)

---

## ⚡ 30 秒安装

1. **确认后端在跑**（一次性）
   ```bash
   cd ~/ielts-must-pass/backend && ./start.sh
   # 看到 "Uvicorn running on http://127.0.0.1:8100"
   ```

2. **加载扩展**
   - Chrome 地址栏输入 `chrome://extensions/`
   - 右上角打开「**开发者模式**」
   - 点「**加载已解压的扩展程序**」
   - 选 clone 下来的 `web-reader/` 目录
   - 看到 🟡 IELTS Web Reader 卡片 = 成功

3. **打开任意英文网页测试**
   - 推荐：`https://www.nytimes.com/` 任意文章
   - 鼠标移到 **生词**（3000+ 词 + 你没掌握）→ 1 秒内看到黄色中文 tooltip
   - 点「+ 加入学习」→ 进 SQLite `vocab_progress` 表，明天复习时出现

---

## 🎯 核心规则

| 词类型 | 处理 |
|---|---|
| **3000 以内基础词**（如 `the / run / happy`） | **完全不打扰** — 不翻译、不标、不入库 |
| **3000+ 重点词 + 已掌握**（如 `abandon` 你标过掌握） | **完全不打扰** |
| **3000+ 重点词 + 未掌握**（如 `ephemeral`） | **hover 显示中文 + 一键加入学习** |
| **不在 20K 词库的生僻词**（如 `cryptocurrency`） | **不翻译**（词库无） |

设计意图：3000 基础词靠每日跟读被动习得，**不要被网页阅读污染**。

---

## 📁 项目结构

```
web-reader/
├── manifest.json                # Manifest V3 配置
├── content/
│   ├── content.js               # 入口：scan → lookup → highlight
│   ├── scanner.js               # 文本节点扫描 + token 提取
│   ├── highlight.js             # 包裹生词为 <span class="iwr-unknown">
│   ├── tooltip.js               # hover 显示 tooltip + 加入学习按钮
│   └── tooltip.css              # tooltip / highlight 样式
├── background/
│   └── service-worker.js        # 后台：调 127.0.0.1:8100 + 进程内 cache
├── popup/
│   ├── popup.html               # 后端状态 + 词库规模
│   └── popup.js
├── icons/
│   ├── icon-16.png
│   ├── icon-48.png
│   ├── icon-128.png
│   └── _generate.py             # 重新生成图标用
└── README.md
```

---

## 🔌 后端 API（依赖）

3 个端点全部由 [`backend/routes/vocab_lookup.py`](../../backend/routes/vocab_lookup.py) 提供：

| 端点 | 用途 |
|---|---|
| `POST /vocab/lookup` | 批量查词状态（is_basic + mastered） |
| `GET  /vocab/translate-zh?word=xxx` | 中文翻译（LLM cache） |
| `POST /vocab/mark-learning` | 把词加入 SM-2 学习队列 |

详细 schema 见 SPEC 文档。

---

## 🛠 故障排查

**1. popup 显示「离线」**
- 后端没启：`cd ~/ielts-must-pass/backend && ./start.sh`
- 端口冲突：`lsof -i:8100` 看谁占着

**2. hover 没反应**
- F12 打开 console，看 `[IWR]` 开头的日志
- 常见原因：页面在 iframe 里（v0.1 不支持 frames）；SPA 未完全渲染

**3. 中文翻译一直是「暂无翻译」**
- Qwen LLM 没启（`http://127.0.0.1:1234`）。后端 fallback 会写 `source=fallback` 到 `vocab_zh_cache`。
- 清掉 cache 重试：`sqlite3 ~/ielts-must-pass/backend/data/ielts-must-pass.db "DELETE FROM vocab_zh_cache WHERE source='fallback'"`

**4. 想改图标 / 颜色**
- 编辑 `icons/_generate.py` 重跑
- tooltip 样式在 `content/tooltip.css`

---

## 🔄 开发迭代流程

```bash
# 改完任意文件后
# 1. 去 chrome://extensions/
# 2. 找到 IELTS Web Reader 卡片
# 3. 点 🔄 刷新按钮（reload）
# 4. 回到网页刷新页面即可
```

无需打包、无需重启后端（除非改了 Python 代码）。

---

## 📜 版本

- **0.1.0** (2026-06-19) — MVP：scan + lookup + hover tooltip + mark-learning
- 未来：v0.2 SPA DOM 变化支持 / v0.3 侧栏批量加词 / v0.4 整句翻译

---

## 🧪 自检 checklist

- [ ] 后端 8100 在线
- [ ] chrome://extensions/ 加载无报错
- [ ] popup 显示 ✅ 在线 + 词库 20000
- [ ] nytimes 文章 hover "ephemeral" → 看到中文 tooltip
- [ ] hover "the" → 无任何反应（基础词跳过 ✓）
- [ ] 点 +加入学习 → button 变 "✓ 已加入学习"
- [ ] SQLite `vocab_progress` 表新增一行
# SPEC: IELTS Web Reader (Chrome 扩展)

> **项目**: `ielts-must-pass` 子模块
> **目录**: `~/ielts-must-pass/extensions/web-reader/`
> **作者**: Frank + Hermes
> **创建日期**: 2026-06-19
> **状态**: v3 已锁定，待实施

---

## 一、目标 (Goal)

Frank 在 Chrome 读英文网页（NYT / BBC / 学术 / Reddit 等）时：

1. 插件**只翻译 Frank 还没掌握的 3000+ 重点词**
2. **零翻译 3000 以内基础词**（设计意图：靠每日跟读被动习得）
3. Hover 显示中文翻译（释义 + 词性 + 音标）
4. 一键「+加入学习」→ 进 `vocab_progress` 触发 SM-2 SRS 复习调度
5. 数据**单一来源** = `ielts-must-pass` 后端 (localhost:8100)

**不做的事**（明确边界）：
- ❌ 不翻译全网所有词
- ❌ 不动 `passive_progress`（基础词跟读专用）
- ❌ 不动 `definition_cache`（已有英文释义，跟我们的中文释义分离）
- ❌ 不做完整段落翻译（Google Translate 那种）
- ❌ 不做账号系统（单用户 "frank"）

---

## 二、核心决策（已 Frank 确认）

| 决策 | 选定 | 来源 |
|---|---|---|
| 数据源 | `ielts-must-pass` 后端 (port 8100) | Frank |
| 显示模式 | Hover tooltip（不替换原文） | Frank Q1=C |
| 入库策略 | 手动点按钮（不自动入库） | Frank Q2=B |
| 3000 词处理 | **零翻译、零入库、零干扰** | Frank 第三轮要求 |
| 翻译源 | 后端新增端点 + Qwen 本地 LLM + cache | 推荐方案 P |
| 加入学习落点 | 写 `vocab_progress` 表（SM-2 主动队列） | 方案 α |
| 词长下限 | ≥ 3 字母 | Frank 默认 |
| 域名范围 | 全网（用户可在 popup 关闭） | Frank 默认 |
| 安装方式 | unpacked 加载（开发者模式） | Frank 确认 |

---

## 三、数据流

```
[Chrome 加载网页]
   │
   ▼
[content/scanner.js: 扫描 text node，提取英文 token]
   │  去重 / 长度≥3 / 跳过 script/style/code
   ▼
[background/service-worker.js: 批量 POST]
   POST /vocab/lookup  { words: [...] }
   │
   ▼
[后端 vocab_lookup.py]
   查询 vocab JOIN vocab_progress LEFT JOIN passive_progress
   返回: [{word, is_basic, in_vocab, mastered}, ...]
   │
   ▼
[content/highlight.js: 包裹 is_basic=0 且 !mastered 的词]
   <span class="iwr-unknown" data-word="ephemeral">ephemeral</span>
   │
   ▼
[用户 hover 单词]
   │
   ▼
[content/tooltip.js: 显示 tooltip]
   GET /vocab/translate-zh?word=ephemeral
   │
   ▼
[后端 vocab_lookup.py]
   查 vocab_zh_cache → miss 则调 Qwen (127.0.0.1:1234) → 写入 cache
   返回: {translation, pos, phonetic, cached}
   │
   ▼
[Tooltip 渲染：中文翻译 + [✓ 加入学习] 按钮]
   │
   ▼
[用户点按钮]
   POST /vocab/mark-learning { word: "ephemeral" }
   │
   ▼
[后端 vocab_lookup.py]
   写 vocab_progress (state='new', ef=2.5, reps=0, interval=0)
   触发 SRS 调度（明天起出现在 /api/review/next 队列）
```

---

## 四、后端 API 设计

### 4.1 新增表 `vocab_zh_cache`

```sql
CREATE TABLE IF NOT EXISTS vocab_zh_cache (
    word_id INTEGER PRIMARY KEY,
    translation TEXT NOT NULL,           -- 中文翻译: "短暂的；瞬息的"
    pos TEXT,                             -- 词性: "adj"
    phonetic TEXT,                        -- 音标: "/ɪˈfem(ə)rəl/"
    source TEXT NOT NULL DEFAULT 'qwen', -- 'qwen' | 'manual' | 'cache'
    generated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (word_id) REFERENCES vocab(id)
);
```

**为什么不复用 `definition_cache`？**  
`definition_cache` 是"用 3000 基础词写的英文释义 + 例句"（给跟读用的，结构是英文）。中文 hover 释义是不同的产物，分开 cache 避免互相污染。

### 4.2 端点 1：`POST /vocab/lookup`

```python
请求: { "words": ["ephemeral", "abandon", "the", "foo"] }
响应: {
  "results": [
    {"word": "ephemeral", "in_vocab": true, "is_basic": false, "mastered": false, "word_id": 4521},
    {"word": "abandon",   "in_vocab": true, "is_basic": false, "mastered": true,  "word_id": 3201},
    {"word": "the",       "in_vocab": true, "is_basic": true,  "mastered": true,  "word_id": 5},
    {"word": "foo",       "in_vocab": false, "is_basic": null, "mastered": null, "word_id": null}
  ],
  "summary": { "total": 4, "in_vocab": 3, "basic": 1, "advanced_unknown": 1 }
}
```

**逻辑**：
- 单词 lower-case 去重
- 查 `vocab` 表：`SELECT id, word, is_basic FROM vocab WHERE word IN (...)`
- 查用户掌握状态：`SELECT word_id, state FROM vocab_progress WHERE user_id=1 AND word_id IN (...)`，`state='mastered'` 视为 mastered
- 返回每词标签 + summary

**性能**：单次最多 500 词（content script 上限），SQL 单查询 < 50ms

### 4.3 端点 2：`GET /vocab/translate-zh?word=ephemeral`

```python
响应: {
  "word": "ephemeral",
  "translation": "短暂的；瞬息的",
  "pos": "adj",
  "phonetic": "/ɪˈfem(ə)rəl/",
  "cached": true,
  "source": "qwen"
}
```

**逻辑**：
- 查 `vocab_zh_cache` JOIN `vocab`
- miss → 调 Qwen (`http://127.0.0.1:1234/v1/chat/completions`, model=`qwen2.5-3b-instruct`)
  - Prompt：参考 `ai/definition_gen.py` 模式，但要求**只输出中文翻译 + 词性 + 音标 JSON**
  - 失败兜底：返回 `translation="暂无翻译"`，不抛错
- 写 cache

**性能**：命中 < 10ms，miss 1-3s（Qwen 本地）

### 4.4 端点 3：`POST /vocab/mark-learning`

```python
请求: { "word": "ephemeral" }
响应: {
  "word": "ephemeral",
  "word_id": 4521,
  "added": true,           // true=新建, false=已存在
  "state": "new",
  "next_review_due": null  // 新词立即入队
}
```

**逻辑**：
- 查 `vocab.word_id`
- UPSERT `vocab_progress`（state='new', ef=2.5, reps=0, interval_days=0）
- 已存在则返回 `added=false`
- 词不在 vocab 表 → 404

---

## 五、Chrome 扩展结构

```
~/ielts-must-pass/extensions/web-reader/
├── manifest.json                   # Manifest V3
├── content/
│   ├── content.js                  # 入口（注入时机: document_idle）
│   ├── scanner.js                  # 文本节点扫描 + token 提取
│   ├── highlight.js                # 包裹生词为 <span class="iwr-unknown">
│   ├── tooltip.js                  # hover 显示 tooltip
│   └── tooltip.css                 # tooltip 样式
├── background/
│   └── service-worker.js           # 后台：调后端 API + cache 管理
├── popup/
│   ├── popup.html                  # 开关 + 状态显示
│   └── popup.js
├── icons/
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
├── README.md                       # 安装步骤 + 使用说明
└── SPEC.md                         # 链接到 docs/SPEC_web_reader.md
```

### manifest.json 关键字段

```json
{
  "manifest_version": 3,
  "name": "IELTS Web Reader",
  "version": "0.1.0",
  "description": "Hover-translate 3000+ IELTS 重点词 (ielts-must-pass) - 仅翻译未掌握",
  "permissions": ["storage", "activeTab"],
  "host_permissions": ["<all_urls>", "http://127.0.0.1:8100/*"],
  "background": { "service_worker": "background/service-worker.js" },
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["content/scanner.js", "content/highlight.js", "content/tooltip.js", "content/content.js"],
    "css": ["content/tooltip.css"],
    "run_at": "document_idle",
    "all_frames": false
  }],
  "action": { "default_popup": "popup/popup.html", "default_icon": {...} }
}
```

### 文本扫描规则（scanner.js）

- **跳过节点**：`<script>`, `<style>`, `<code>`, `<pre>`, `<textarea>`, `<input>`, `<noscript>`
- **跳过属性**：`<span data-iwr-skip>` (扩展自身标记，避免重入)
- **词边界正则**：`/[A-Za-z][A-Za-z'-]{2,}/g`（首字母 + ≥2 字符后缀 = 词长 ≥3）
- **跳过数字 token**：`/\d/` 开头跳过
- **去重**：同页面 lower-case 全局去重
- **上限**：单页面最多 500 unique words（超出截断）
- **性能**：IntersectionObserver 懒扫描可见区域

### Tooltip UI（tooltip.css）

- 位置：单词上方居中（`position: absolute` + `transform: translate(-50%, -100%)`）
- 背景：`#1a1a1a` + 圆角 6px + 半透明
- 中文：`#ffd966` (暖黄显眼)
- 词性+音标：`#9ca3af` (灰)
- 按钮：「+ 加入学习」绿色 hover 态
- z-index: 2147483647（最高，避免被页面覆盖）
- transition: opacity 0.15s（丝滑）

### 跨域 + 后端联通

- 插件后台调 `http://127.0.0.1:8100/vocab/*` 已通过 `host_permissions` 允许
- Content script → background 用 `chrome.runtime.sendMessage` 通信
- Background → 后端用 `fetch`
- 后端未启动时：插件 popup 显示「⚠️ 后端离线」，content script 静默失败（不打扰阅读）

---

## 六、风险 + 边界处理

| 风险 | 处理 |
|---|---|
| 大页面卡顿 | 单页 500 词上限 + IntersectionObserver 懒扫描 |
| SPA 改 DOM 后单词消失/出现 | MutationObserver 监听 + diff 处理（v0.2 再说，MVP 先不处理） |
| 翻译 API 失败（Qwen 挂了） | tooltip 显示"暂无翻译"+ 重试按钮 |
| 后端未启动 | popup 状态显示，启动 extension 时 ping 一次 |
| 同一词频繁 hover | background cache 5 分钟 TTL |
| 用户已 offline | fetch catch → tooltip 显示"网络错误" |
| 用户主动 "加入学习" 后立刻看到变化 | toast "已加入学习，明日复习" |
| 重复 "加入学习" | 后端 `added=false`，前端 toast "已在学习列表" |
| 隐私 | 只发单词列表给后端，**不传页面 URL/正文** |

---

## 七、验收标准 (DoD)

### 后端
1. `POST /vocab/lookup` 返回正确 JSON，无 5xx
2. `GET /vocab/translate-zh?word=ephemeral` 返回中文翻译，cache 第二次 < 10ms
3. `POST /vocab/mark-learning` 写入 `vocab_progress` 表
4. 端口 8100 启动日志显示路由注册成功

### Chrome 扩展
5. `chrome://extensions/` 开发者模式加载 unpacked 后无报错
6. 打开 `nytimes.com` 任一英文文章
7. 鼠标移到 3000+ 未掌握词（如 "ephemeral"）→ 1 秒内显示中文 tooltip
8. 鼠标移到 3000 以内词（如 "the"）→ 无任何高亮/翻译
9. 鼠标移到已掌握词（如 "abandon"）→ 无翻译
10. 点「+ 加入学习」→ SQLite `vocab_progress` 表新增一行
11. popup 显示「服务在线」+ 已处理词数

### 文档
12. `PROJECT_STATUS.md` 加 Web Reader 章节
13. `ARCHITECTURE.md` 加扩展架构图
14. `extensions/web-reader/README.md` 有完整安装步骤

---

## 八、未来迭代 (Out of Scope for MVP)

- v0.2: MutationObserver 处理 SPA DOM 变化
- v0.3: 侧边栏批量操作（一键加本页所有生词）
- v0.4: 短句翻译（hover 整句）—— 不在原始需求
- v0.5: 导出 Chrome Web Store（需要 5 USD + 隐私政策）

---

## 九、变更记录

| 版本 | 日期 | 变更 |
|---|---|---|
| v1 | 2026-06-19 初稿 | 误把 ielts-ai-coach 当数据源 |
| v2 | 2026-06-19 修正 | 改用 ielts-must-pass，但 passive_progress 设计冲突 |
| v3 | 2026-06-19 锁定 | 加入 3000 词铁律，方案 α 严格分层，写 vocab_progress |

---

**Frank 签字处**：👆 已确认，待开始 Phase 2 实施。
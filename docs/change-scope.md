# PR 改动范围

提交到 `main` 的 PR 需要通过 `scope/approved-paths`。Codex 根据已确认的任务范围，在修改前记录允许的完整文件路径。每个路径精确匹配仓库内的文件。重命名需要同时涵盖原路径和新路径。

1. 核对整个 PR 的实际 diff，确定它符合原先记录的清单。读取 GitHub 上当前 `main` 和候选提交的完整 SHA，核对候选与受审查的提交一致。
2. Codex 用已认证的仓库所有者 GitHub 会话代发检查请求。将下面的 PR 编号和两个 SHA 替换为刚核对的值，`paths` 使用已确认的清单。

   ```bash
   gh api repos/frankdeng-github/ielts-web-reader/dispatches --input - <<'JSON'
   {
     "event_type": "approve-change-scope",
     "client_payload": {
       "pr": 123,
       "base": "完整的-main-SHA",
       "head": "完整的-PR-HEAD-SHA",
       "paths": ["README.md"]
     }
   }
   JSON
   ```

3. 核对该候选提交的必过项状态。若更新了候选提交或 `main`，先对齐基线并复核完整 diff，再沿用确认的范围重新提交检查。只有确实需要扩大范围时，才请用户确认新增内容。

GitHub 校验请求来自仓库所有者，用户确认的范围由任务会话记录。工作流从默认分支加载，通过公开的 Git 读权限获取候选对象。仓库的 Actions 执行策略只允许 `repository_dispatch` 事件。将来增加 CI 触发方式时，需要一起核对检查结果的来源约束。

路径检查通过后，维护者仍需核对文件内的差异和相关回归，例如查词、翻译和加词行为。

# PR 改动范围

提交到 `main` 的 PR 需要通过 `scope/approved-paths`。维护者从任务约定中确定允许修改的文件，将完整路径和要验收的 PR 版本提交给检查。每个路径精确匹配仓库内的文件；重命名需要同时批准原路径和新路径。

1. 在 PR 中核对实际 diff，记录当前 `main` 和候选提交的完整 SHA。
2. 由仓库所有者提交审批。将下面的 PR 编号、两个 SHA 和路径替换为此次核对的值。

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

3. 在 PR 的检查区查看状态。主分支更新后，先把 PR 更新到最新基线，再重新核对并审批。候选提交更新后也需要重新审批。

批准信息来自 GitHub 的维护者操作。工作流从默认分支加载，通过公开的 Git 读权限获取候选对象。仓库的 Actions 执行策略只允许 `repository_dispatch` 事件。将来增加 CI 触发方式时，需要一起核对检查结果的来源约束。

路径检查通过后，维护者仍需核对文件内的差异和相关回归，例如查词、翻译和加词行为。

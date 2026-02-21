# Contributing

## 开发与校验

- 安装依赖：`npm ci`
- 本地开发：`npm run dev`
- 类型检查：`npm run typecheck`
- 单测：`npm run test`
- 构建：`npm run build`

提交前建议至少执行：`npm run typecheck && npm run test && npm run build`

## Commit 规范（Conventional Commits）

请使用以下格式：

`<type>(<scope>): <subject>`

常用 `type`：

- `feat`: 新功能（触发 minor 版本发布）
- `fix`: 问题修复（触发 patch 版本发布）
- `perf`: 性能优化（通常触发 patch）
- `refactor`: 重构（无行为变化时通常不发布）
- `docs`: 文档变更（通常不发布）
- `test`: 测试相关（通常不发布）
- `chore`: 构建/工具链/杂项（通常不发布）

带破坏性变更时，请在 commit footer 增加：

`BREAKING CHANGE: <description>`

这会触发 major 版本发布。

示例：

- `feat(popup): add quick copy for selected links`
- `fix(scanner): avoid duplicate magnet links`
- `feat!: drop legacy storage schema`

## CI 与发布说明

- `ci.yml`：在 `push` / `pull_request` 时做类型检查、测试、构建、打包（用于 PR 校验）。
- `release.yml`：在 `main/master` 分支 push 后运行 `semantic-release`，自动完成：
  - 计算版本号
  - 更新 `package.json` 版本
  - 同步 `public/manifest.json` 版本
  - 生成 `CHANGELOG.md`
  - 打 tag 并创建 GitHub Release
  - 上传 zip 产物

## 分支与 PR 建议

- 使用功能分支开发，PR 合并到 `main`（或仓库默认主分支）。
- PR 描述建议包含：变更点、验证步骤、截图（如有 UI 变更）。

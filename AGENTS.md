# Repository Guidelines

## 项目结构与模块划分
- 入口视图：`src/App.vue` 按 uTools 入口 code 切换视图，当前仅保留 `clipboard`。
- 剪贴板主界面：`src/Clipboard/index.vue`，所有核心逻辑与 UI。
- 样式：`src/main.css` 维护全局与组件样式。
- 静态资源：`public/`（含 `plugin.json`、`preload/`）。
- 构建产物：`dist/`（由 Vite 构建生成）。

## 构建、测试与开发命令
- `npm install`：安装依赖（Vue 3、Vite、uTools API 类型）。
- `npm run dev`：启动 Vite 开发服务器，浏览器预览或在 uTools 中加载本地地址。
- `npm run build`：打包到 `dist/`，用于发布。
- 当前无测试脚本；若新增测试，请在 `package.json` 增加 `npm test` 并在本文档补充说明。

## 编码风格与命名约定
- Vue 单文件组件使用 `<script setup lang="ts">`，缩进 2 空格，尽量使用 `ref`/`watch`。
- 组件/目录命名：PascalCase；通用工具函数：camelCase。
- 样式：CSS 变量置于 `:root`；组件样式优先 `scoped`；共享样式写入 `src/main.css`。
- 注释要求：关键逻辑、uTools 交互、异常处理需有清晰注释（输入/输出、失败提示）。
- 格式化遵循默认 Prettier/Volar 规则。
- 使用中文回复, 所有代码都需要有详细注释
- 开发时参考 [uTools的开发者文档](https://www.u-tools.cn/docs/developer/docs.html)

## 测试指引
- 推荐 Vitest + Vue Test Utils；测试文件命名 `*.spec.ts`，与组件同目录。
- 重点覆盖：入口路由切换、剪贴板同步与持久化、`window.services` 文件读写、通知与异常处理。
- 在提交前确保 `npm run build` 通过；若添加测试，注明依赖与运行方式。

## 提交与 PR 规范
- 提交信息用祈使句，≤72 字符，例如“Add clipboard favorite filter”；必要时正文附 “Refs #123”。
- PR 需说明变更内容、测试情况、影响面；UI 改动提供前后截图或短视频（uTools 流程更佳）。
- 保持与本地未提交改动兼容，不要覆盖用户现有变更；合并前确认构建无误。

## 安全与配置提示
- 访问 `window.utools`/`window.services` 前先判空；文件 I/O 包裹 `try/catch` 并用 `utools.showNotification` 反馈失败原因。
- 仅在用户选定路径内读写；确认剪贴板 payload 类型（`over`/`img`/`files`）再处理。
- 禁止提交密钥或打包产物；需要网络能力时明确依赖与权限提示。

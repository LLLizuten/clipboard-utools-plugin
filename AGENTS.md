# Repository Guidelines

## 项目结构与模块划分
- 入口：`src/App.vue` 负责根据 uTools 入口 code（`clipboard`/`read`/`write`）切换视图，`src/main.js` 完成启动，`src/main.css` 放全局样式。
- 视图：`src/Clipboard/` 为核心剪贴板界面与逻辑，`src/Read/` 处理文件读取，`src/Write/` 处理写入。
- 资源：静态资产放 `public/`，发布产物生成在 `dist/`；配置集中在 `vite.config.js`。
- 约定：组件文件使用 PascalCase 目录/文件名，通用工具使用 camelCase；新增代码需在模块旁保持清晰注释。

## 构建、测试与开发命令
- `npm install`：安装依赖（Vue 3、Vite、utools-api-types）。
- `npm run dev`：启动 Vite 开发服务器；浏览器可直接预览，uTools 中加载本地地址可获得完整 API。
- `npm run build`：产出发布包至 `dist/`，如需调整基路径或别名在 `vite.config.js` 修改。
- 当前未配置测试脚本；添加测试时在 `package.json` 增加 `npm test` 并补充说明。

## 编码风格与命名约定
- Vue 3 单文件组件使用 `<script setup lang="ts">`，优先 `ref`/`watch`；缩进 2 空格。
- 样式：CSS 变量放在 `:root`，组件样式建议 `scoped`；共享样式集中 `src/main.css`。
- 格式化：遵循编辑器默认的 Prettier/Volar 规则；命名清晰、早返回，避免冗长分支。
- 注释：关键逻辑与与 uTools 交互处需写明输入/输出、异常处理，保持“所有代码需要有详细注释”的标准。
- 使用中文回复, 所有代码都需要有详细注释
- 开发时可以参考 [uTools的开发者文档](https://www.u-tools.cn/docs/developer/docs.html)

## 测试指引
- 推荐 Vitest + Vue Test Utils，命名 `*.spec.ts` 与组件同目录存放。
- 重点覆盖：入口路由切换、剪贴板同步与持久化、`window.services` 文件读写、异常通知（`utools.showNotification`）。
- 在 CI 前确保 `npm run build` 通过；如有测试，文档化依赖和运行方式。

## 提交与 PR 规范
- 提交信息用祈使句、≤72 字符，如“Add read handler for files”；正文可附“Refs #123”并说明变更原因与边界。
- PR 需描述变更、测试情况及影响面；UI 改动附前后截图或短视频（uTools 流程更佳）。
- 保持与已有未提交改动兼容，不要覆盖用户本地变更；合并前确认构建无误。

## 安全与配置提示
- 访问 `window.utools`/`window.services` 前先判空，文件 I/O 包裹 try/catch 并通过 `utools.showNotification` 告知失败原因。
- 仅在用户选择路径内读写，确认 payload 类型（`over`/`img`/`files`）再处理。
- 禁止提交密钥或打包产物；如需网络能力，明确依赖和权限提示。

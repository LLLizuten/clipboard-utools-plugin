# 剪贴板管理器（uTools 插件）

一个基于 Vue 3 + Vite 的 uTools 插件，提供剪贴板历史、收藏、备注、图片记录与右键操作菜单。

## 功能特性
- 自动轮询同步剪贴板，最多保留 200 条，置顶优先、收藏其次。
- 文本折叠/展开预览，Ctrl+A 仅选中正文；图片支持缩略图查看。
- 收藏与备注管理：备注后可自由收藏/取消，右键菜单集中操作（复制/固定/收藏/备注/删除）。
- 支持键盘快捷键：回车或双击复制，Ctrl/Cmd+F 搜索，左右键切换页签，上下键切换选中，Alt+P 固定，Alt+F 收藏，E 备注，Delete 删除。

## 快速开始
```bash
npm install      # 安装依赖
npm run dev      # 启动开发服务器，浏览器预览或在 uTools 加载本地地址
npm run build    # 产出 dist/ 发布包
```
将 `dist/` 打包为 uTools 插件即可分发；开发时可在 uTools 中指向 dev 地址获得完整 API。

## 目录结构
- `src/App.vue`：入口视图（当前仅 clipboard）。
- `src/Clipboard/index.vue`：核心逻辑与 UI。
- `src/main.css`：全局样式。
- `public/plugin.json`：插件清单与入口配置。
- `dist/`：构建产物（`npm run build` 生成）。

## 开发约定
- 组件使用 `<script setup lang="ts">`，缩进 2 空格，命名：组件 PascalCase，工具 camelCase。
- 关键逻辑与 uTools 交互必须写明注释（输入/输出、异常提示）。
- 样式变量放在 `:root`，共享样式集中在 `src/main.css`。
- 访问 `window.utools`/`window.services` 需先判空；文件 I/O 包裹 try/catch，并通过 `utools.showNotification` 提示失败。

## 测试与发布
- 目前无测试脚本；如需测试，推荐 Vitest + Vue Test Utils，命名 `*.spec.ts` 并在 `package.json` 补充 `npm test`。
- 发布前请确保 `npm run build` 通过。

## 提交规范
- Commit 使用祈使句、≤72 字符，如“Add clipboard favorite filter”，必要时正文附 “Refs #123”。
- PR 描述需包含变更内容、测试情况、影响面；UI 改动建议附前后截图或动图。***

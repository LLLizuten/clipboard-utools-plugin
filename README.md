# uTools 剪贴板插件

基于 Vue 3 + Vite 构建的 uTools 小插件，聚合最近的文本/图片剪贴板内容，提供搜索、收藏、固定、快速复制等能力，并包含文件读取/写入示例入口，便于二次开发或调试。

## 功能概览
- 剪贴板历史：自动每 3 秒同步当前剪贴板，去重更新时间戳，最多保留 200 条。
- 分类与搜索：按全部/文本/图片/收藏筛选，本地关键字过滤内容与备注。
- 收藏与备注：支持收藏/取消收藏，为条目添加备注并按收藏时间排序查看。
- 固定与删除：固定条目置顶显示，支持单条删除，状态持久化到 `utools.dbStorage` 与 `localStorage`。
- 快捷操作：回车或双击复制，Ctrl/Cmd+F 聚焦搜索，左右键切换标签，Alt+P 固定，Alt+F 收藏，E 编辑备注，Delete 删除，方向键切换选中。
- 额外入口：`hello` 展示入参调试；`read` 读取文件内容；`write` 根据拖拽/粘贴的文本或图片写入文件并在资源管理器中定位。

## 目录结构
- `src/App.vue`：根据 uTools 入口 code (`clipboard`/`hello`/`read`/`write`) 切换视图。
- `src/Clipboard/`：核心剪贴板管理界面与逻辑（轮询、存储、搜索、收藏、快捷键）。
- `src/Read/`：调用 `window.services.readFile` 读取选中文件或从入口 payload 直接读取。
- `src/Write/`：处理 `over`/`img` 入口，将文本或图片落盘并通过 `shellShowItemInFolder` 打开所在位置。
- `src/Hello/`：简单展示进入参数的调试页。
- `src/main.js` / `src/main.css`：应用启动与全局样式。

## 本地运行
```bash
npm install
npm run dev
```
默认以浏览器预览，未注入 uTools 时会自动 fallback 到 `clipboard` 视图。开发时可在 uTools 中加载 `npm run dev` 输出的本地地址以获得完整 API。

## 构建发布
```bash
npm run build
```
产物输出到 `dist/`，可按 uTools 插件打包规则进行分发；必要时在 `vite.config.js` 调整 `base` 或别名。

## 使用提示
- uTools 环境下需要可用的 `window.utools` 与 `window.services`，文件读写请确保权限允许。
- 插件数据仅本地存储，不做网络同步；若遇到写入异常会通过 `utools.showNotification` 给出提示。
- 若需扩展测试，可引入 Vitest + Vue Test Utils，并在 `package.json` 添加 `npm test` 脚本。

## 相关命令
- 开发：`npm run dev`
- 构建：`npm run build`

## 许可证
未在仓库中声明许可证，请在发布前补充合适的开源协议或内部使用声明。

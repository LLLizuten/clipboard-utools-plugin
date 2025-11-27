# Repository Guidelines

## Project Structure & Module Organization
- `src/` holds all Vue single-file components; entry routing is in `src/App.vue` and bootstrapping in `src/main.js`.
- Feature views map to plugin entry codes: `src/Hello/index.vue`, `src/Read/index.vue`, `src/Write/index.vue`.
- Shared styling lives in `src/main.css`; static assets can be placed under `public/`.
- Vite config sits in `vite.config.js`; adjust aliases or base path there when packaging for uTools.

## Build, Test, and Development Commands
- `npm install` — install dependencies (Vue 3, Vite, utools-api-types).
- `npm run dev` — start Vite dev server; open the served URL in uTools or a browser for hot reload.
- `npm run build` — generate production assets in `dist/` for packaging into the uTools plugin.
- No dedicated test script is defined; add one before enforcing CI checks.

## Coding Style & Naming Conventions
- Use Vue 3 `<script setup>` with TypeScript annotations (`lang="ts"`); prefer `ref`/`watch` from `vue`.
- Keep components in PascalCase files (`Hello/index.vue`), hooks/utilities in camelCase modules.
- Indentation: 2 spaces; favor concise templates and early returns in handlers.
- Run formatting via your editor’s Prettier/Volar defaults; keep CSS variables in `:root` and scope component styles when possible.
- 用中文回复问题
- 所有代码需要有详细注释

## Testing Guidelines
- No test framework is configured; if adding tests, use Vitest + Vue Test Utils and expose a `npm test` script.
- Name spec files `*.spec.ts` alongside the component under test (e.g., `src/Read/index.spec.ts`).
- Target behaviors: uTools entry handling (`route` changes), file read/write flows (`window.services` usage), and error notifications.

## Commit & Pull Request Guidelines
- Follow an imperative subject line (`Add read handler for files`); keep under ~72 chars.
- Reference related issues in the body (`Refs #123`); include what changed, why, and any edge cases.
- For UI-affecting changes, attach before/after screenshots or a short clip of the uTools flow.
- Ensure `npm run build` succeeds before submitting PRs; note any platform assumptions (Windows paths, uTools APIs).

## Security & Configuration Tips
- Interactions with `window.utools` and `window.services` should guard against missing permissions; wrap file I/O in try/catch and surface errors via `utools.showNotification`.
- Avoid writing outside user-selected paths; confirm payload types (`over`, `img`, `files`) before processing.
- Do not check secrets or packaged binaries into the repo; keep plugin-specific credentials outside version control.

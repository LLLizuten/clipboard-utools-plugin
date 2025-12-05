const fs = require('node:fs')
const path = require('node:path')
const { clipboard, nativeImage } = require('electron')

const EMPTY_PIXEL = nativeImage.createFromDataURL(
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/3tVZ9sAAAAASUVORK5CYII='
)

// 剪贴板缓存键与上限（保持与前端一致，便于共享数据）
const STORAGE_KEY = 'clipboard_items'
const MAX_ITEMS = 200
// 后台轮询间隔，毫秒
const POLL_INTERVAL = 500
// 轮询定时器句柄与最近一次内容哈希，避免重复写入
let watcherTimer = null
let lastHash = null

// 通过 window 对象向渲染进程注入 nodejs 能力
window.services = {
  // 读文件
  readFile (file) {
    return fs.readFileSync(file, { encoding: 'utf-8' })
  },
  // 文本写入到下载目录
  writeTextFile (text) {
    const filePath = path.join(window.utools.getPath('downloads'), Date.now().toString() + '.txt')
    fs.writeFileSync(filePath, text, { encoding: 'utf-8' })
    return filePath
  },
  // 图片写入到下载目录
  writeImageFile (base64Url) {
    const matchs = /^data:image\/([a-z]{1,20});base64,/i.exec(base64Url)
    if (!matchs) return
    const filePath = path.join(window.utools.getPath('downloads'), Date.now().toString() + '.' + matchs[1])
    fs.writeFileSync(filePath, base64Url.substring(matchs[0].length), { encoding: 'base64' })
    return filePath
  },
  // 清空系统剪贴板（文本与图片）
  clearClipboard () {
    try {
      // 优先使用 uTools 官方 API 覆盖文本/图片
      if (global.utools?.copyText) global.utools.copyText(' ')
      if (global.utools?.copyImage) global.utools.copyImage(EMPTY_PIXEL.toDataURL())
      if (global.utools?.copyText) global.utools.copyText('')

      // 使用 electron clipboard 强制写入空文本与空图像
      clipboard.clear('clipboard')
      clipboard.clear('selection')
      clipboard.writeText(' ', 'clipboard')
      clipboard.writeImage(EMPTY_PIXEL, 'clipboard')
      clipboard.writeText(' ', 'selection')
      clipboard.writeImage(EMPTY_PIXEL, 'selection')
      clipboard.writeText('', 'clipboard')
      clipboard.writeText('', 'selection')
      clipboard.writeImage(EMPTY_PIXEL, 'clipboard')
      clipboard.writeImage(EMPTY_PIXEL, 'selection')

      // 验证
      const clearedText = clipboard.readText('clipboard')
      const clearedImage = clipboard.readImage('clipboard')
      const selectionText = clipboard.readText('selection')
      return (!clearedText || clearedText === ' ') && clearedImage.isEmpty() && (!selectionText || selectionText === ' ')
    } catch (err) {
      console.warn('clearClipboard failed', err)
      return false
    }
  },
  // 读取剪贴板（调试用）
  readClipboard () {
    try {
      const text = clipboard.readText('clipboard')
      const image = clipboard.readImage('clipboard')
      return { text, imageEmpty: image.isEmpty() }
    } catch (err) {
      console.warn('readClipboard failed', err)
      return { text: null, imageEmpty: null }
    }
  },
  // 启动后台剪贴板轮询，使用 electron.clipboard 读取系统层内容
  startClipboardWatcher () {
    // 已在运行则直接返回
    if (watcherTimer) {
      return { running: true }
    }
    // 立即尝试抓取一次，避免等待首个间隔
    captureAndPersistClipboard()
    watcherTimer = setInterval(() => {
      captureAndPersistClipboard()
    }, POLL_INTERVAL)
    return { running: true }
  },
  // 停止后台剪贴板轮询
  stopClipboardWatcher () {
    if (watcherTimer) {
      clearInterval(watcherTimer)
      watcherTimer = null
    }
    lastHash = null
    return { running: false }
  },
  // 查询轮询状态（渲染层可用于展示开关状态）
  getClipboardWatcherStatus () {
    return { running: !!watcherTimer, lastHash }
  }
}

// 封装：读取系统剪贴板（优先图片，再文本），失败返回 null
function readSystemClipboard () {
  try {
    const img = clipboard.readImage('clipboard')
    if (img && !img.isEmpty()) {
      return { type: 'image', content: img.toDataURL() }
    }
  } catch (err) {
    console.warn('clipboard readImage failed', err)
  }
  try {
    const text = clipboard.readText('clipboard')
    if (text) {
      return { type: 'text', content: text }
    }
  } catch (err) {
    console.warn('clipboard readText failed', err)
  }
  return null
}

// 将当前剪贴板内容写入存储（去重、排序、截断）
function captureAndPersistClipboard () {
  const entry = readSystemClipboard()
  if (!entry) return
  const hash = `${entry.type}:${entry.content}`
  if (hash === lastHash) return
  lastHash = hash

  const list = loadStoredItems()
  const now = Date.now()
  const idx = list.findIndex((item) => item.type === entry.type && item.content === entry.content)

  if (idx >= 0) {
    // 已存在则更新时间戳并移至前端
    const existing = list[idx]
    const updated = { ...existing, updatedAt: now }
    list.splice(idx, 1)
    list.unshift(updated)
  } else {
    list.unshift({
      id: uuid(),
      type: entry.type,
      content: entry.content,
      createdAt: now,
      updatedAt: now,
      pinned: false,
      favorited: false
    })
  }

  const compacted = compactItems(list)
  persistItems(compacted)
}

// 读取已存储的数据（优先 utools.dbStorage）
function loadStoredItems () {
  const raw = global.utools?.dbStorage?.getItem(STORAGE_KEY)
  if (!raw) return []
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (Array.isArray(parsed)) {
      return parsed
        .filter((item) => item?.id && item?.content)
        .map((item) => ({
          pinned: false,
          favorited: false,
          ...item
        }))
        .slice(0, MAX_ITEMS)
    }
  } catch (err) {
    console.warn('loadStoredItems parse failed', err)
  }
  return []
}

// 按固定/收藏优先裁剪列表，保持上限
function compactItems (list) {
  const pinned = list.filter((item) => item.pinned)
  const favorited = list.filter((item) => item.favorited && !item.pinned)
  const others = list.filter((item) => !item.pinned && !item.favorited)
  const afterPinnedQuota = Math.max(0, MAX_ITEMS - pinned.length)
  const afterFavoriteQuota = Math.max(0, afterPinnedQuota - favorited.length)
  const keptFavorites = favorited.slice(0, afterPinnedQuota)
  const keptOthers = others.slice(0, afterFavoriteQuota)
  return [...pinned, ...keptFavorites, ...keptOthers]
}

// 写入存储
function persistItems (list) {
  try {
    global.utools?.dbStorage?.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch (err) {
    console.warn('persistItems failed', err)
  }
}

// 简单 UUID 生成（在 preload 环境无 crypto.randomUUID 时兜底）
function uuid () {
  if (global.crypto?.randomUUID) return global.crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

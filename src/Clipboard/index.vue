<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

type ClipType = 'text' | 'image'

interface ClipEntry {
  id: string
  type: ClipType
  content: string
  createdAt: number
  updatedAt: number
  pinned: boolean
  favorited: boolean
  favoriteNote?: string
  favoritedAt?: number
}

const STORAGE_KEY = 'clipboard_items'
const MAX_ITEMS = 200
// 文本卡片默认截断长度与行数上限，超出后提供“展开全部”交互
const TEXT_PREVIEW_LIMIT = 240
const TEXT_PREVIEW_LINES = 6

const items = ref<ClipEntry[]>(loadItems())
const searchText = ref('')
const searchInputRef = ref<HTMLInputElement | null>(null)
const viewType = ref<'all' | 'text' | 'image' | 'favorites'>('all')
const selectedId = ref<string | null>(items.value[0]?.id ?? null)
const itemRefs = ref<Record<string, HTMLElement | null>>({})
const previewTextRef = ref<HTMLElement | null>(null)
const textRefs = ref<Record<string, HTMLElement | null>>({})
// 记录每条文本是否已展开，键为条目 id，布尔表示展开/折叠
const expandedMap = ref<Record<string, boolean>>({})
const noteEditingId = ref<string | null>(null)
const noteDraft = ref('')
const noteTextareaRef = ref<HTMLTextAreaElement | null>(null)
const statusMsg = ref('')
const errorMsg = ref('')
const isCapturing = ref(false)
const lastHash = ref<string | null>(null)
let pollTimer: number | null = null
// 标记可见性监听是否已绑定，防止重复添加事件
let visibilityListenerBound = false

const filteredItems = computed(() => {
  let list = [...items.value]
  if (viewType.value === 'favorites') {
    list = list.filter((item) => item.favorited)
  } else if (viewType.value !== 'all') {
    list = list.filter((item) => item.type === viewType.value)
  }
  const keyword = searchText.value.trim().toLowerCase()
  if (keyword) {
    list = list.filter((item) => {
      const pool = [
        item.content.toLowerCase(),
        item.favoriteNote?.toLowerCase() ?? '',
        item.type === 'image' ? 'img image 图片' : ''
      ].join(' ')
      return pool.includes(keyword)
    })
  }
  return list.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    const aRank = viewType.value === 'favorites' ? (a.favoritedAt ?? a.updatedAt) : a.updatedAt
    const bRank = viewType.value === 'favorites' ? (b.favoritedAt ?? b.updatedAt) : b.updatedAt
    return bRank - aRank
  })
})

const selectedItem = computed(
  () => filteredItems.value.find((item) => item.id === selectedId.value) ?? filteredItems.value[0] ?? null
)

watch(
  items,
  () => {
    persistItems(items.value)
    if (items.value.length === 0) {
      selectedId.value = null
    }
  },
  { deep: true }
)

watch(
  filteredItems,
  (list) => {
    if (!list.length) {
      selectedId.value = null
      return
    }
    if (!selectedId.value || !list.some((item) => item.id === selectedId.value)) {
      selectedId.value = list[0].id
    }
  },
  { deep: true }
)

watch(selectedId, () => {
  // 选中项切换时同步当前卡片的文本节点，便于 Ctrl+A 选中正文
  previewTextRef.value = selectedId.value ? textRefs.value[selectedId.value] ?? null : null
  scrollSelectedIntoView()
})

onMounted(() => {
  captureClipboard(true)
  startPolling()
  bindVisibilityListener()
  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  stopPolling()
  unbindVisibilityListener()
  window.removeEventListener('keydown', handleKeydown)
})

// 根据页面可见性启停轮询，避免窗口隐藏后仍高频读取剪贴板
function bindVisibilityListener() {
  if (visibilityListenerBound || typeof document === 'undefined') return
  const handler = () => {
    if (document.visibilityState === 'visible') {
      startPolling()
    } else {
      stopPolling()
    }
  }
  document.addEventListener('visibilitychange', handler)
  ;(bindVisibilityListener as any)._handler = handler
  visibilityListenerBound = true
}

function unbindVisibilityListener() {
  if (!visibilityListenerBound || typeof document === 'undefined') return
  const handler = (bindVisibilityListener as any)._handler as (() => void) | undefined
  if (handler) {
    document.removeEventListener('visibilitychange', handler)
  }
  visibilityListenerBound = false
}

function startPolling() {
  if (pollTimer || typeof window === 'undefined') return
  pollTimer = window.setInterval(() => {
    captureClipboard(true)
  }, 500)
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function loadItems(): ClipEntry[] {
  const raw =
    (window as any)?.utools?.dbStorage?.getItem(STORAGE_KEY) ??
    (typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null)
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
    console.warn('Failed to parse clipboard cache', err)
  }
  return []
}

function persistItems(list: ClipEntry[]) {
  const serialized = JSON.stringify(list.slice(0, MAX_ITEMS))
  try {
    ;(window as any)?.utools?.dbStorage?.setItem(STORAGE_KEY, serialized)
  } catch (err) {
    console.warn('utools dbStorage setItem failed', err)
    ;(window as any)?.utools?.showNotification?.('保存剪贴板数据失败（dbStorage），请检查空间或权限')
  }
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, serialized)
    }
  } catch (err) {
    console.warn('localStorage setItem failed', err)
    ;(window as any)?.utools?.showNotification?.('保存剪贴板数据失败（localStorage），请检查浏览器权限或空间')
  }
}

function uuid() {
  if (crypto?.randomUUID) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function compactItems() {
  const pinned = items.value.filter((item) => item.pinned)
  const rest = items.value.filter((item) => !item.pinned).slice(0, Math.max(0, MAX_ITEMS - pinned.length))
  items.value = [...pinned, ...rest]
}

function addOrUpdateItem(entry: { type: ClipType; content: string }) {
  const now = Date.now()
  const existingIndex = items.value.findIndex(
    (item) => item.type === entry.type && item.content === entry.content
  )
  if (existingIndex >= 0) {
    const existing = items.value[existingIndex]
    const updated: ClipEntry = {
      ...existing,
      updatedAt: now
    }
    items.value.splice(existingIndex, 1)
    items.value.unshift(updated)
    selectedId.value = updated.id
    compactItems()
    return { added: false, updated: true }
  }
  const newItem: ClipEntry = {
    id: uuid(),
    type: entry.type,
    content: entry.content,
    createdAt: now,
    updatedAt: now,
    pinned: false,
    favorited: false
  }
  items.value.unshift(newItem)
  compactItems()
  selectedId.value = newItem.id
  return { added: true, updated: false }
}

// 主动/轮询读取剪贴板的入口：
// silent=true 用于轮询场景，只在内容发生变化时更新列表且不展示提示；silent=false 用于用户手动触发，展示状态与错误。
// 1) 先清空提示状态并在非静默模式下拉起“读取中”状态；
// 2) 调用 readClipboard() 读取内容，若无内容则在手动模式下提示后返回；
// 3) 对读取结果生成 hash，静默模式下若与上次一致则跳过，避免重复插入；
// 4) 新内容会添加或更新时间戳，并更新 status 文案；异常时仅在手动模式展示错误；
// 5) 最后关闭“读取中”状态（仅手动模式），保持轮询轻量。
async function captureClipboard(silent = false) {
  errorMsg.value = ''
  statusMsg.value = ''
  if (!silent) {
    isCapturing.value = true
  }
  try {
    const entry = await readClipboard(silent)
    if (!entry) {
      if (!silent) {
        errorMsg.value = '未获取到剪贴板内容'
      }
      return
    }
    const hash = `${entry.type}:${entry.content}`
    if (silent && hash === lastHash.value) return
    lastHash.value = hash
    const { added } = addOrUpdateItem(entry)
    if (!silent) {
      statusMsg.value = added ? '已记录剪贴板内容' : '已更新剪贴板时间'
    }
  } catch (err: any) {
    if (!silent) errorMsg.value = err?.message ?? '读取剪贴板失败'
  } finally {
    if (!silent) {
      isCapturing.value = false
    }
  }
}
// 读取当前剪贴板内容的统一入口，按优先级尝试不同能力：
// 1) 优先使用 uTools 的原生 API：先读图片（更容易丢失焦点许可），再读文本；
// 2) 若 uTools 不可用，则使用标准 Clipboard API 的 read()：遍历条目，优先 image/png，再读取 text/plain；
// 3) 最后退回到 readText() 兜底，只拿纯文本；
// 4) 所有步骤失败则返回 null，调用方据此显示提示，不会抛出异常影响轮询。
async function readClipboard(silent = false): Promise<{ type: ClipType; content: string } | null> {
  const utoolsApi = (window as any)?.utools
  try {
    if (utoolsApi?.readImage) {
      const img = utoolsApi.readImage()
      if (img) {
        return { type: 'image', content: img }
      }
    }
    if (utoolsApi?.readText) {
      const text = utoolsApi.readText()
      if (text) {
        return { type: 'text', content: text }
      }
    }
  } catch (err) {
    console.warn('utools clipboard read failed', err)
  }

  // 静默轮询时若页面未聚焦，跳过标准 Clipboard API，避免权限提示或拒绝频繁出现
  if (silent && typeof document !== 'undefined' && !document.hasFocus()) {
    return null
  }

  if (navigator?.clipboard?.read) {
    try {
      const clipItems = await navigator.clipboard.read()
      for (const item of clipItems) {
        if (item.types.includes('image/png')) {
          const blob = await item.getType('image/png')
          const dataUrl = await blobToDataUrl(blob)
          return { type: 'image', content: dataUrl }
        }
        if (item.types.includes('text/plain')) {
          const blob = await item.getType('text/plain')
          const text = (await blob.text()).trim()
          if (text) {
            return { type: 'text', content: text }
          }
        }
      }
    } catch {
      // ignore focus/permission errors
    }
  }

  if (navigator?.clipboard?.readText) {
    try {
      const text = (await navigator.clipboard.readText()).trim()
      if (text) return { type: 'text', content: text }
    } catch {
      // ignore focus/permission errors
    }
  }
  return null
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

async function copyItem(item: ClipEntry, shouldExit = false) {
  const utoolsApi = (window as any)?.utools
  try {
    if (item.type === 'text') {
      if (utoolsApi?.copyText) {
        utoolsApi.copyText(item.content)
      } else if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(item.content)
      }
    } else {
      if (utoolsApi?.copyImage) {
        utoolsApi.copyImage(item.content)
      } else if (navigator?.clipboard?.write && (window as any)?.ClipboardItem) {
        const resp = await fetch(item.content)
        const blob = await resp.blob()
        const clipboardItem = new (window as any).ClipboardItem({
          [blob.type || 'image/png']: blob
        })
        await navigator.clipboard.write([clipboardItem])
      }
    }
    statusMsg.value = '已复制'
    if (shouldExit) {
      if (utoolsApi?.hideMainWindow) {
        utoolsApi.hideMainWindow()
      } else if (utoolsApi?.outPlugin) {
        utoolsApi.outPlugin()
      }
    }
  } catch (err: any) {
    errorMsg.value = err?.message ?? '复制失败'
    ;(window as any)?.utools?.showNotification?.(`复制失败：${errorMsg.value}`)
  }
}

// 快捷键处理
function handleKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  const tag = target?.tagName?.toLowerCase()
  const keyLower = event.key.toLowerCase()

  if (noteEditingId.value && event.key === 'Escape') {
    cancelNoteEdit()
    return
  }

  if (tag === 'input' || tag === 'textarea') return

  // Ctrl+A 时仅选中预览区文本，避免全局全选干扰
  if (event.ctrlKey && keyLower === 'a') {
    event.preventDefault()
    selectPreviewText()
    return
  }

  if ((event.ctrlKey || event.metaKey) && keyLower === 'f') {
    event.preventDefault()
    searchInputRef.value?.focus()
    return
  }

  if (event.key === 'ArrowUp') {
    moveSelection(-1)
    event.preventDefault()
  } else if (event.key === 'ArrowDown') {
    moveSelection(1)
    event.preventDefault()
  } else if (event.key === 'Enter' || (event.ctrlKey && keyLower === 'c')) {
    if (selectedItem.value) {
      copyItem(selectedItem.value, true)
      event.preventDefault()
    }
  } else if (event.key === 'ArrowLeft') {
    shiftTab(-1)
    event.preventDefault()
  } else if (event.key === 'ArrowRight') {
    shiftTab(1)
    event.preventDefault()
  } else if (event.key === 'Delete') {
    if (selectedItem.value) {
      removeItem(selectedItem.value.id)
      event.preventDefault()
    }
  } else if (event.altKey && keyLower === 'p') {
    if (selectedItem.value) {
      togglePin(selectedItem.value)
      event.preventDefault()
    }
  } else if (event.altKey && keyLower === 'f') {
    if (selectedItem.value) {
      toggleFavorite(selectedItem.value)
      event.preventDefault()
    }
  } else if (keyLower === 'e') {
    if (selectedItem.value) {
      startEditNote(selectedItem.value)
      event.preventDefault()
    }
  }
}

function selectPreviewText() {
  // 仅在选中文本条目时执行选取，防止图片预览或空选中
  if (!selectedItem.value || selectedItem.value.type !== 'text') return
  const el = previewTextRef.value
  if (!el) return
  const selection = window.getSelection()
  if (!selection) return
  const range = document.createRange()
  range.selectNodeContents(el)
  selection.removeAllRanges()
  selection.addRange(range)
}
// 上下滚动
function moveSelection(direction: 1 | -1) {
  if (!filteredItems.value.length) return
  const currentIndex = filteredItems.value.findIndex((item) => item.id === selectedId.value)
  const nextIndex = currentIndex === -1 ? 0 : (currentIndex + direction + filteredItems.value.length) % filteredItems.value.length
  selectedId.value = filteredItems.value[nextIndex].id
}

// 页签切换
function shiftTab(direction: 1 | -1) {
  const modes: Array<'all' | 'text' | 'image' | 'favorites'> = ['all', 'text', 'image', 'favorites']
  const idx = modes.indexOf(viewType.value)
  const next = (idx + direction + modes.length) % modes.length
  viewType.value = modes[next]
}

function togglePin(item: ClipEntry) {
  const updated = { ...item, pinned: !item.pinned, updatedAt: Date.now() }
  replaceItem(updated)
}

function toggleFavorite(item: ClipEntry) {
  const isFav = !item.favorited
  const updated: ClipEntry = {
    ...item,
    favorited: isFav,
    favoritedAt: isFav ? Date.now() : undefined
  }
  replaceItem(updated)
}

function startEditNote(item: ClipEntry) {
  noteEditingId.value = item.id
  noteDraft.value = item.favoriteNote ?? ''
  focusNoteInput()
}

function saveNoteEdit() {
  if (!noteEditingId.value) return
  const idx = items.value.findIndex((item) => item.id === noteEditingId.value)
  if (idx === -1) {
    cancelNoteEdit()
    return
  }
  const base = items.value[idx]
  const updated: ClipEntry = {
    ...base,
    favorited: true,
    favoriteNote: noteDraft.value,
    favoritedAt: base.favoritedAt ?? Date.now(),
    updatedAt: Date.now()
  }
  replaceItem(updated)
  statusMsg.value = '备注已更新'
  cancelNoteEdit()
}

function cancelNoteEdit() {
  noteEditingId.value = null
  noteDraft.value = ''
}

function focusNoteInput() {
  nextTick(() => {
    noteTextareaRef.value?.focus()
    noteTextareaRef.value?.select()
  })
}

function handleNoteKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    saveNoteEdit()
  }
}

function replaceItem(next: ClipEntry) {
  const idx = items.value.findIndex((item) => item.id === next.id)
  if (idx >= 0) {
    items.value.splice(idx, 1, next)
    compactItems()
    selectedId.value = next.id
  }
}

function setItemRef(id: string, el: HTMLElement | null) {
  if (el) {
    itemRefs.value[id] = el
  } else {
    delete itemRefs.value[id]
  }
}

// 记录每个文本条目的正文节点，配合 selectedId 更新以支持 Ctrl+A 全选
function setTextRef(id: string, el: HTMLElement | null) {
  if (el) {
    textRefs.value[id] = el
  } else {
    delete textRefs.value[id]
  }
  if (selectedId.value === id) {
    previewTextRef.value = el
  }
}

function scrollSelectedIntoView() {
  nextTick(() => {
    const id = selectedId.value
    if (!id) return
    const el = itemRefs.value[id]
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  })
}

function removeItem(id: string) {
  items.value = items.value.filter((item) => item.id !== id)
  delete textRefs.value[id]
  delete expandedMap.value[id]
}

function formatTime(ts: number) {
  const date = new Date(ts)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${date.getMonth() + 1}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function shorten(text: string, limit = 120) {
  if (!text) return ''
  if (text.length <= limit) return text
  return `${text.slice(0, limit)}…`
}

// 判断文本是否需要折叠展示，长度或行数任一超限即显示“展开全部”
function shouldCollapse(item: ClipEntry) {
  if (item.type !== 'text') return false
  const text = item.content ?? ''
  if (text.length > TEXT_PREVIEW_LIMIT) return true
  const lines = text.split(/\r?\n/)
  return lines.length > TEXT_PREVIEW_LINES
}

// 当前条目是否处于展开态
function isExpanded(id: string) {
  return !!expandedMap.value[id]
}

// 展开/收起指定条目正文
function toggleExpand(id: string) {
  expandedMap.value[id] = !expandedMap.value[id]
}
</script>

<template>
  <div class="clipboard-page">
    <div class="clipboard-shell">
      <section class="controls-row">
        <div class="category-tabs">
          <button
            class="tab-chip"
            :class="{ active: viewType === 'all' }"
            @click="viewType = 'all'"
          >
            <span class="chip-icon">▦</span>
            全部
            <span class="chip-badge">{{ items.length }}</span>
          </button>
          <button
            class="tab-chip"
            :class="{ active: viewType === 'text' }"
            @click="viewType = 'text'"
          >
            <span class="chip-icon">文</span>
            文本
            <span class="chip-badge">{{ items.filter((i) => i.type === 'text').length }}</span>
          </button>
          <button
            class="tab-chip"
            :class="{ active: viewType === 'image' }"
            @click="viewType = 'image'"
          >
            <span class="chip-icon">图</span>
            图片
            <span class="chip-badge">{{ items.filter((i) => i.type === 'image').length }}</span>
          </button>
          <button
            class="tab-chip"
            :class="{ active: viewType === 'favorites' }"
            @click="viewType = 'favorites'"
            title="仅显示收藏"
          >
            <span class="chip-icon">★</span>
            收藏
            <span class="chip-badge">{{ items.filter((i) => i.favorited).length }}</span>
          </button>
        </div>

        <label class="search-box">
          <span class="search-icon">⌕</span>
          <input
            ref="searchInputRef"
            v-model.trim="searchText"
            class="search-input"
            type="text"
            placeholder="搜索内容或备注 (Ctrl/Cmd+F)"
          />
        </label>
      </section>

      <section class="content-grid">
        <div class="list-panel" v-if="filteredItems.length">
          <div
            v-for="item in filteredItems"
            :key="item.id"
            class="clip-card"
            :class="{
              selected: selectedItem?.id === item.id,
              pinned: item.pinned,
              favorited: item.favorited,
              'type-text': item.type === 'text',
              'type-image': item.type === 'image'
            }"
            :ref="(el) => setItemRef(item.id, el)"
            @click="selectedId = item.id"
            @dblclick.stop="copyItem(item, true)"
          >
            <div class="card-head">
              <div class="tag type">
                <span class="tag-icon">{{ item.type === 'text' ? 'T' : 'IMG' }}</span>
                <span>{{ item.type === 'text' ? '文本' : '图片' }}</span>
              </div>
              <div class="tag pinned" v-if="item.pinned">已固定</div>
              <div class="tag favorite" v-if="item.favorited">已收藏</div>
              <div class="time-stamp">{{ formatTime(item.updatedAt) }}</div>
            </div>

            <div v-if="item.favoriteNote !== undefined" class="note-block">
              <span class="note-icon">✎</span>
              <span class="note-text">{{ item.favoriteNote || '（空）' }}</span>
            </div>

            <div class="card-body">
              <template v-if="item.type === 'text'">
                <div class="text-wrapper" :class="{ expanded: isExpanded(item.id) }">
                  <!-- 使用 v-text 避免 <pre> 继承模板缩进换行，导致 Ctrl+A 时多出空格或空行 -->
                  <pre
                    class="text-preview"
                    :class="{ 'full-text': isExpanded(item.id), collapsed: !isExpanded(item.id) }"
                    :ref="(el) => setTextRef(item.id, el)"
                    v-text="isExpanded(item.id) ? item.content : shorten(item.content, TEXT_PREVIEW_LIMIT)"
                  ></pre>
                  <div v-if="!isExpanded(item.id) && shouldCollapse(item)" class="expand-mask"></div>
                </div>
                <button
                  v-if="shouldCollapse(item)"
                  class="expand-btn"
                  @click.stop="toggleExpand(item.id)"
                >
                  {{ isExpanded(item.id) ? '收起' : '展开全部' }}
                </button>
              </template>
              <template v-else>
                <img
                  class="thumb"
                  :class="{ selected: selectedItem?.id === item.id }"
                  :src="item.content"
                  alt="剪贴板图片"
                />
              </template>
            </div>

            <div class="card-actions">
              <button class="icon-btn primary" @click.stop="copyItem(item)">复制</button>
              <button class="icon-btn amber" @click.stop="togglePin(item)">
                {{ item.pinned ? '取消固定' : '固定' }}
              </button>
              <button class="icon-btn rose" @click.stop="toggleFavorite(item)">
                {{ item.favorited ? '取消收藏' : '收藏' }}
              </button>
              <button class="icon-btn blue" @click.stop="startEditNote(item)">备注</button>
              <button class="icon-btn danger" @click.stop="removeItem(item.id)">删除</button>
            </div>
          </div>
        </div>
        <div v-else class="empty-card">暂无记录，点击“记录当前剪贴板”开始收集。</div>
      </section>
    </div>

    <div v-if="noteEditingId" class="note-dialog-backdrop">
      <div class="note-dialog">
        <div class="note-dialog-head">
          <span>编辑备注</span>
          <button class="icon-btn subtle" @click="cancelNoteEdit">✕</button>
        </div>
        <textarea
          ref="noteTextareaRef"
          v-model="noteDraft"
          rows="4"
          class="note-textarea"
          @keydown="handleNoteKeydown"
        ></textarea>
        <div class="dialog-actions">
          <button class="icon-btn subtle" @click="cancelNoteEdit">取消</button>
          <button class="icon-btn primary" @click="saveNoteEdit">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

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

const items = ref<ClipEntry[]>(loadItems())
const searchText = ref('')
const searchInputRef = ref<HTMLInputElement | null>(null)
const viewType = ref<'all' | 'text' | 'image' | 'favorites'>('all')
const selectedId = ref<string | null>(items.value[0]?.id ?? null)
const itemRefs = ref<Record<string, HTMLElement | null>>({})
const previewTextRef = ref<HTMLElement | null>(null)
const noteEditingId = ref<string | null>(null)
const noteDraft = ref('')
const noteTextareaRef = ref<HTMLTextAreaElement | null>(null)
const statusMsg = ref('')
const errorMsg = ref('')
const isCapturing = ref(false)
const lastHash = ref<string | null>(null)
let pollTimer: number | null = null

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
  scrollSelectedIntoView()
})

onMounted(() => {
  captureClipboard(true)
  pollTimer = window.setInterval(() => {
    captureClipboard(true)
  }, 3000)
  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  if (pollTimer) {
    clearInterval(pollTimer)
  }
  window.removeEventListener('keydown', handleKeydown)
})

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
  }
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, serialized)
    }
  } catch (err) {
    console.warn('localStorage setItem failed', err)
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

async function captureClipboard(silent = false) {
  errorMsg.value = ''
  statusMsg.value = ''
  if (!silent) {
    isCapturing.value = true
  }
  try {
    const entry = await readClipboard()
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

async function readClipboard(): Promise<{ type: ClipType; content: string } | null> {
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
    utoolsApi?.showNotification?.('已复制到剪贴板')
    if (shouldExit) {
      if (utoolsApi?.hideMainWindow) {
        utoolsApi.hideMainWindow()
      } else if (utoolsApi?.outPlugin) {
        utoolsApi.outPlugin()
      }
    }
  } catch (err: any) {
    errorMsg.value = err?.message ?? '复制失败'
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
  } else if (event.key === 'Enter') {
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
</script>

<template>
  <div class="clipboard">
    <div class="clipboard-toolbar">
      <div class="toolbar-left">
        <input
          ref="searchInputRef"
          v-model.trim="searchText"
          class="input"
          type="text"
          placeholder="搜索内容或备注 (Ctrl/Cmd+F)"
        />
        <div class="tabs">
          <button
            class="tab"
            :class="{ active: viewType === 'all' }"
            @click="viewType = 'all'"
          >
            全部 ({{ items.length }})
          </button>
          <button
            class="tab"
            :class="{ active: viewType === 'text' }"
            @click="viewType = 'text'"
          >
            文本 ({{ items.filter((i) => i.type === 'text').length }})
          </button>
          <button
            class="tab"
            :class="{ active: viewType === 'image' }"
            @click="viewType = 'image'"
          >
            图片 ({{ items.filter((i) => i.type === 'image').length }})
          </button>
          <button
            class="tab"
            :class="{ active: viewType === 'favorites' }"
            @click="viewType = 'favorites'"
            title="仅显示收藏"
          >
            收藏 ({{ items.filter((i) => i.favorited).length }})
          </button>
        </div>
      </div>
      <div class="toolbar-actions">
        <button class="ghost" :disabled="isCapturing" @click="captureClipboard()">
          {{ isCapturing ? '读取中…' : '记录当前剪贴板' }}
        </button>
      </div>
    </div>

    <div class="clipboard-status">
      <span v-if="statusMsg" class="ok">{{ statusMsg }}</span>
      <span v-if="errorMsg" class="err">{{ errorMsg }}</span>
      <!-- <span class="hint">自动轮询剪贴板，每 3 秒同步一次。</span> -->
    </div>

    <div class="clipboard-body">
      <div class="clipboard-list" v-if="filteredItems.length">
        <div
          v-for="item in filteredItems"
          :key="item.id"
          class="clipboard-item"
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
          <div class="item-meta">
            <span class="pill">{{ item.type === 'text' ? 'T' : 'IMG' }}</span>
            <span class="time">{{ formatTime(item.updatedAt) }}</span>
            <span v-if="item.pinned" class="badge">Pinned</span>
            <span v-if="item.favorited" class="badge fav">Fav</span>
          </div>
          <div class="item-content">
            <template v-if="item.type === 'text'">
              <div class="text-preview">{{ shorten(item.content) }}</div>
            </template>
            <template v-else>
              <img class="thumb" :src="item.content" alt="剪贴板图片" />
            </template>
            <div v-if="item.favoriteNote !== undefined" class="note">备注：{{ item.favoriteNote || '（空）' }}</div>
          </div>
          <div class="item-actions">
            <button class="ghost" @click.stop="copyItem(item)">复制</button>
            <button class="ghost" @click.stop="togglePin(item)">
              {{ item.pinned ? '取消固定' : '固定' }}
            </button>
            <button class="ghost" @click.stop="toggleFavorite(item)">
              {{ item.favorited ? '取消收藏' : '收藏' }}
            </button>
            <button class="ghost" @click.stop="startEditNote(item)">备注</button>
            <button class="ghost danger" @click.stop="removeItem(item.id)">删除</button>
          </div>
        </div>
      </div>
      <div v-else class="empty">暂无记录，点击“记录当前剪贴板”开始收集。</div>

      <div class="clipboard-preview" v-if="selectedItem">
      <div class="preview-head">
        <div class="pill">{{ selectedItem.type === 'text' ? 'TEXT' : 'IMAGE' }}</div>
        <div class="time">创建：{{ formatTime(selectedItem.createdAt) }}</div>
      </div>
      <div class="preview-body" v-if="selectedItem.type === 'text'" ref="previewTextRef">
        <pre>{{ selectedItem.content }}</pre>
      </div>
        <div class="preview-body img" v-else>
          <img :src="selectedItem.content" alt="剪贴板图片预览" />
        </div>
        <div v-if="selectedItem.favoriteNote !== undefined" class="note">备注：{{ selectedItem.favoriteNote || '（空）' }}</div>
      </div>
    </div>

    <div v-if="noteEditingId" class="note-dialog-backdrop">
      <div class="note-dialog">
        <div class="note-dialog-head">
          <span>编辑备注</span>
          <button class="ghost" @click="cancelNoteEdit">✕</button>
        </div>
        <textarea
          ref="noteTextareaRef"
          v-model="noteDraft"
          rows="4"
          class="note-textarea"
          @keydown="handleNoteKeydown"
        ></textarea>
        <div class="dialog-actions">
          <button class="ghost" @click="cancelNoteEdit">取消</button>
          <button class="ghost" @click="saveNoteEdit">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

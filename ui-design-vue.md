# Vue 3 实现指南

> 本文档作为 `UI-DESIGN-SPEC.md` 的补充，提供 Vue 3 + Composition API 的具体实现指导

## 🎯 技术栈

- **Vue 3.x** (Composition API)
- **Tailwind CSS v4.0**
- **Vite** (推荐)
- **TypeScript** (推荐)

---

## 📁 项目结构

```
src/
├── App.vue                    # 主应用
├── components/
│   ├── Header.vue            # 顶部栏
│   ├── CategoryTabs.vue      # 分类标签
│   ├── SearchBar.vue         # 搜索框
│   ├── ClipboardList.vue     # 列表容器
│   ├── ClipboardItem.vue     # 单个卡片
│   └── NoteModal.vue         # 备注编辑弹窗
├── composables/
│   ├── useClipboard.ts       # 剪贴板逻辑
│   ├── useKeyboard.ts        # 键盘快捷键
│   └── useStorage.ts         # localStorage 持久化
├── types/
│   └── clipboard.ts          # TypeScript 类型定义
└── styles/
    └── globals.css           # 全局样式（Tailwind 配置）
```

---

## 🔧 核心实现

### 1. 类型定义 (types/clipboard.ts)

```typescript
export type ClipboardType = 'text' | 'image'
export type CategoryFilter = 'all' | 'text' | 'image' | 'favorite'

export interface ClipboardItem {
  id: string
  type: ClipboardType
  content: string
  timestamp: Date
  note?: string
  isFavorite: boolean
  isPinned: boolean
  favoriteTime?: Date
}
```

### 2. 主应用状态 (App.vue)

```vue
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useClipboard } from './composables/useClipboard'
import { useKeyboard } from './composables/useKeyboard'
import { useStorage } from './composables/useStorage'
import type { CategoryFilter } from './types/clipboard'

// 组合式函数
const { items, addItem, deleteItem, updateItem } = useClipboard()
const { save, load } = useStorage('clipboardItems')

// 响应式状态
const category = ref<CategoryFilter>('all')
const searchQuery = ref('')
const selectedIndex = ref(0)
const editingNote = ref<string | null>(null)
const searchInputRef = ref<HTMLInputElement>()

// 计算属性：筛选和排序
const filteredItems = computed(() => {
  return items.value
    .filter(item => {
      // 分类筛选
      if (category.value === 'favorite' && !item.isFavorite) return false
      if (category.value === 'text' && item.type !== 'text') return false
      if (category.value === 'image' && item.type !== 'image') return false
      
      // 搜索筛选
      if (searchQuery.value) {
        const query = searchQuery.value.toLowerCase()
        return (
          item.content.toLowerCase().includes(query) ||
          (item.note && item.note.toLowerCase().includes(query))
        )
      }
      
      return true
    })
    .sort((a, b) => {
      // 固定项置顶
      if (a.isPinned && !b.isPinned) return -1
      if (!a.isPinned && b.isPinned) return 1
      
      // 在收藏分类中，按收藏时间排序
      if (category.value === 'favorite' && a.favoriteTime && b.favoriteTime) {
        return b.favoriteTime.getTime() - a.favoriteTime.getTime()
      }
      
      // 其他情况按时间戳排序
      return b.timestamp.getTime() - a.timestamp.getTime()
    })
})

// 生命周期
onMounted(() => {
  const stored = load()
  if (stored) {
    items.value = stored
  }
})

// 持久化
watch(items, (newItems) => {
  save(newItems)
}, { deep: true })
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
    <div class="max-w-5xl mx-auto px-4 py-6">
      <Header 
        :item-count="items.length"
        @clear-all="handleClearAll"
      />
      <CategoryTabs 
        v-model="category"
        :counts="{
          all: items.length,
          text: items.filter(i => i.type === 'text').length,
          image: items.filter(i => i.type === 'image').length,
          favorite: items.filter(i => i.isFavorite).length,
        }"
      />
      <SearchBar 
        v-model="searchQuery"
        ref="searchInputRef"
      />
      <ClipboardList 
        :items="filteredItems"
        :selected-index="selectedIndex"
        @select="selectedIndex = $event"
        @copy="handleCopy"
        @delete="handleDelete"
        @toggle-favorite="handleToggleFavorite"
        @toggle-pin="handleTogglePin"
        @edit-note="editingNote = $event"
      />
      
      <div v-if="filteredItems.length === 0" class="text-center py-16 text-slate-400">
        {{ searchQuery ? '没有找到匹配的内容' : '暂无剪贴板记录' }}
      </div>
    </div>
    
    <NoteModal
      v-if="editingNote"
      :item-id="editingNote"
      :current-note="items.find(i => i.id === editingNote)?.note || ''"
      @save="handleSaveNote"
      @close="editingNote = null"
    />
  </div>
</template>
```

### 3. 组合式函数示例

#### useClipboard.ts
```typescript
import { ref } from 'vue'
import type { ClipboardItem, ClipboardType } from '../types/clipboard'

const MAX_ITEMS = 200

export function useClipboard() {
  const items = ref<ClipboardItem[]>([])

  const addItem = (content: string, type: ClipboardType) => {
    // 查找是否已存在相同内容（去重）
    const existingIndex = items.value.findIndex(item => item.content === content)
    
    if (existingIndex !== -1) {
      // 存在则更新时间戳
      items.value[existingIndex].timestamp = new Date()
    } else {
      // 不存在则添加新项
      const newItem: ClipboardItem = {
        id: Date.now().toString(),
        type,
        content,
        timestamp: new Date(),
        isFavorite: false,
        isPinned: false,
      }
      
      items.value.unshift(newItem)
      
      // 保持最多200条
      if (items.value.length > MAX_ITEMS) {
        items.value = items.value.slice(0, MAX_ITEMS)
      }
    }
  }

  const deleteItem = (id: string) => {
    items.value = items.value.filter(item => item.id !== id)
  }

  const updateItem = (id: string, updates: Partial<ClipboardItem>) => {
    const index = items.value.findIndex(item => item.id === id)
    if (index !== -1) {
      items.value[index] = { ...items.value[index], ...updates }
    }
  }

  return {
    items,
    addItem,
    deleteItem,
    updateItem,
  }
}
```

#### useKeyboard.ts
```typescript
import { onMounted, onUnmounted, type Ref } from 'vue'

interface KeyboardOptions {
  onArrowUp: () => void
  onArrowDown: () => void
  onArrowLeft: () => void
  onArrowRight: () => void
  onEnter: () => void
  onDelete: () => void
  onEditNote: () => void
  onTogglePin: () => void
  onToggleFavorite: () => void
  onFocusSearch: () => void
}

export function useKeyboard(options: KeyboardOptions) {
  const handleKeyDown = (e: KeyboardEvent) => {
    // Ctrl/Cmd+F 聚焦搜索
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault()
      options.onFocusSearch()
      return
    }

    // 如果在输入框中，跳过其他快捷键
    if (
      e.target instanceof HTMLInputElement || 
      e.target instanceof HTMLTextAreaElement
    ) {
      return
    }

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault()
        options.onArrowUp()
        break
      case 'ArrowDown':
        e.preventDefault()
        options.onArrowDown()
        break
      case 'ArrowLeft':
        e.preventDefault()
        options.onArrowLeft()
        break
      case 'ArrowRight':
        e.preventDefault()
        options.onArrowRight()
        break
      case 'Enter':
        e.preventDefault()
        options.onEnter()
        break
      case 'Delete':
        e.preventDefault()
        options.onDelete()
        break
      case 'e':
      case 'E':
        e.preventDefault()
        options.onEditNote()
        break
      case 'p':
      case 'P':
        if (e.altKey) {
          e.preventDefault()
          options.onTogglePin()
        }
        break
      case 'f':
      case 'F':
        if (e.altKey) {
          e.preventDefault()
          options.onToggleFavorite()
        }
        break
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeyDown)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeyDown)
  })
}
```

#### useStorage.ts
```typescript
export function useStorage(key: string) {
  const save = (data: any) => {
    try {
      localStorage.setItem(key, JSON.stringify(data))
    } catch (e) {
      console.error('Failed to save to localStorage:', e)
    }
  }

  const load = () => {
    try {
      const stored = localStorage.getItem(key)
      if (stored) {
        return JSON.parse(stored, (key, value) => {
          // 处理日期对象
          if (key === 'timestamp' || key === 'favoriteTime') {
            return value ? new Date(value) : undefined
          }
          return value
        })
      }
    } catch (e) {
      console.error('Failed to load from localStorage:', e)
    }
    return null
  }

  return { save, load }
}
```

### 4. 组件实现示例

#### ClipboardItem.vue
```vue
<script setup lang="ts">
import { ref } from 'vue'
import { ChevronDown, ChevronUp, Copy, Trash2, Star, Pin, FileText, Image as ImageIcon, StickyNote } from 'lucide-vue-next'
import type { ClipboardItem } from '../types/clipboard'

interface Props {
  item: ClipboardItem
  isSelected: boolean
}

interface Emits {
  (e: 'select'): void
  (e: 'copy', content: string): void
  (e: 'delete', id: string): void
  (e: 'toggle-favorite', id: string): void
  (e: 'toggle-pin', id: string): void
  (e: 'edit-note', id: string): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const isExpanded = ref(false)
const CONTENT_LIMIT = 200

const getTimeAgo = (date: Date) => {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  
  if (seconds < 60) return '刚刚'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`
  return `${Math.floor(seconds / 86400)} 天前`
}

const handleDoubleClick = () => {
  emit('copy', props.item.content)
}

const isLongContent = computed(() => {
  return props.item.type === 'text' && props.item.content.length > CONTENT_LIMIT
})

const displayContent = computed(() => {
  if (props.item.type === 'image') return props.item.content
  if (!isLongContent.value) return props.item.content
  return isExpanded.value 
    ? props.item.content 
    : props.item.content.substring(0, CONTENT_LIMIT) + '...'
})
</script>

<template>
  <div
    @click="emit('select')"
    @dblclick="handleDoubleClick"
    :class="[
      'bg-white rounded-xl border-2 p-4 transition-all duration-200 cursor-pointer',
      isSelected
        ? 'border-indigo-500 shadow-lg shadow-indigo-500/20'
        : 'border-transparent hover:border-slate-200 hover:shadow-md'
    ]"
  >
    <div class="flex items-start gap-4">
      <div class="flex-1 min-w-0">
        <!-- 头部：类型、时间、状态标签 -->
        <div class="flex items-center gap-2 mb-2 flex-wrap">
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs">
            <ImageIcon v-if="item.type === 'image'" class="w-3.5 h-3.5" />
            <FileText v-else class="w-3.5 h-3.5" />
            {{ item.type === 'image' ? '图片' : '文本' }}
          </span>
          
          <span v-if="item.isPinned" class="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs">
            <Pin class="w-3.5 h-3.5" />
            已固定
          </span>
          
          <span v-if="item.isFavorite" class="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg text-xs">
            <Star class="w-3.5 h-3.5" />
            已收藏
          </span>
          
          <span class="text-xs text-slate-400">
            {{ getTimeAgo(item.timestamp) }}
          </span>
        </div>

        <!-- 备注 -->
        <div v-if="item.note" class="mb-2 flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
          <StickyNote class="w-4 h-4 text-blue-600 flex-shrink-0" />
          <span class="text-sm text-blue-900">{{ item.note }}</span>
        </div>

        <!-- 内容 -->
        <div>
          <div v-if="item.type === 'image'" class="mt-2">
            <img 
              :src="item.content" 
              alt="Clipboard" 
              class="max-w-xs max-h-48 rounded-lg border border-slate-200"
            />
          </div>
          
          <div v-else class="text-slate-700 text-sm">
            <pre class="whitespace-pre-wrap break-words font-sans">{{ displayContent }}</pre>
          </div>
          
          <button
            v-if="isLongContent"
            @click.stop="isExpanded = !isExpanded"
            class="mt-2 inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs transition-colors"
          >
            <ChevronUp v-if="isExpanded" class="w-3.5 h-3.5" />
            <ChevronDown v-else class="w-3.5 h-3.5" />
            {{ isExpanded ? '收起' : `展开全部 (${item.content.length} 字符)` }}
          </button>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="flex flex-col gap-2">
        <button
          @click.stop="emit('toggle-pin', item.id)"
          :class="[
            'p-2 rounded-lg transition-all duration-200',
            item.isPinned
              ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
              : 'bg-slate-100 text-slate-600 hover:bg-amber-50 hover:text-amber-600'
          ]"
          title="固定 (Alt+P)"
        >
          <Pin class="w-4 h-4" />
        </button>
        
        <button
          @click.stop="emit('toggle-favorite', item.id)"
          :class="[
            'p-2 rounded-lg transition-all duration-200',
            item.isFavorite
              ? 'bg-rose-100 text-rose-600 hover:bg-rose-200'
              : 'bg-slate-100 text-slate-600 hover:bg-rose-50 hover:text-rose-600'
          ]"
          title="收藏 (Alt+F)"
        >
          <Star class="w-4 h-4" />
        </button>
        
        <button
          @click.stop="emit('edit-note', item.id)"
          :class="[
            'p-2 rounded-lg transition-all duration-200',
            item.note
              ? 'bg-blue-100 text-blue-600 hover:bg-blue-200'
              : 'bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-600'
          ]"
          title="备注 (E)"
        >
          <StickyNote class="w-4 h-4" />
        </button>
        
        <button
          @click.stop="emit('copy', item.content)"
          class="p-2 bg-slate-100 text-slate-600 hover:bg-green-50 hover:text-green-600 rounded-lg transition-all duration-200"
          title="复制 (Enter)"
        >
          <Copy class="w-4 h-4" />
        </button>
        
        <button
          @click.stop="emit('delete', item.id)"
          class="p-2 bg-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-600 rounded-lg transition-all duration-200"
          title="删除 (Delete)"
        >
          <Trash2 class="w-4 h-4" />
        </button>
      </div>
    </div>
  </div>
</template>
```

---

## 🔄 React vs Vue 对照表

### 状态管理
| React | Vue 3 |
|-------|-------|
| `const [value, setValue] = useState(0)` | `const value = ref(0)` |
| `setValue(1)` | `value.value = 1` |
| `const obj = useState({...})` | `const obj = reactive({...})` |
| `setObj({...obj, key: val})` | `obj.key = val` |

### 副作用
| React | Vue 3 |
|-------|-------|
| `useEffect(() => {...}, [])` | `onMounted(() => {...})` |
| `useEffect(() => {...}, [dep])` | `watch(dep, () => {...})` |
| `useEffect(() => { return () => {...} })` | `onUnmounted(() => {...})` |

### 计算值
| React | Vue 3 |
|-------|-------|
| `const val = useMemo(() => {...}, [dep])` | `const val = computed(() => {...})` |
| `const fn = useCallback(() => {...}, [dep])` | 直接定义函数即可 |

### 引用
| React | Vue 3 |
|-------|-------|
| `const ref = useRef(null)` | `const ref = ref<HTMLElement>()` |
| `<div ref={ref}>` | `<div ref="ref">` |

### Props & Emit
| React | Vue 3 |
|-------|-------|
| `function Comp({value, onChange})` | `defineProps<{value}>()` + `defineEmits<{change}>()` |
| `onChange(newVal)` | `emit('change', newVal)` |

### 条件渲染
| React | Vue 3 |
|-------|-------|
| `{condition && <div>}` | `<div v-if="condition">` |
| `{condition ? <A> : <B>}` | `<A v-if="condition"> <B v-else>` |

### 列表渲染
| React | Vue 3 |
|-------|-------|
| `{items.map(item => <div key={item.id}>)}` | `<div v-for="item in items" :key="item.id">` |

---

## 📦 推荐的 Vue 生态库

| 功能 | 推荐库 | 说明 |
|------|-------|------|
| 图标 | `lucide-vue-next` | Lucide 的 Vue 3 版本 |
| Toast | `vue-sonner` | Sonner 的 Vue 移植版 |
| 表单 | `vee-validate` | Vue 的表单验证库 |
| 状态管理 | `pinia` | Vue 官方推荐（本项目可能不需要） |
| 工具库 | `@vueuse/core` | Vue 版的 React Hooks 工具集 |

### 安装命令
```bash
npm install lucide-vue-next vue-sonner
npm install -D @types/node
```

---

## 🎨 Tailwind 配置

Vue 项目中的 Tailwind 配置与 React 完全相同，只需确保：

```javascript
// tailwind.config.js (Tailwind v4 使用 CSS 配置)
// 在 /styles/globals.css 中配置

@import "tailwindcss";

/* 其余样式与 React 版本完全一致 */
```

---

## ⚡ 性能优化

### Vue 3 特有的优化
```vue
<script setup>
// 1. 使用 shallowRef 对于大数组
const items = shallowRef([])

// 2. 使用 v-memo 缓存列表项
</script>

<template>
  <ClipboardItem
    v-for="item in items"
    :key="item.id"
    v-memo="[item.id, item.isPinned, item.isFavorite, isSelected(item.id)]"
  />
</template>
```

---

## 🧪 测试建议

- 使用 **Vitest** 进行单元测试
- 使用 **Cypress** 或 **Playwright** 进行 E2E 测试
- 重点测试：
  - 键盘快捷键在各浏览器的兼容性
  - localStorage 持久化逻辑
  - 复杂的筛选和排序逻辑

---

## 📋 迁移检查清单

- [ ] 将 React 组件改写为 Vue SFC（.vue 文件）
- [ ] 将 useState/useEffect 改为 ref/watch
- [ ] 将事件处理器从 onClick 改为 @click
- [ ] 将 lucide-react 改为 lucide-vue-next
- [ ] 将 sonner 改为 vue-sonner
- [ ] 保持所有 Tailwind 类名不变
- [ ] 保持所有设计规范不变
- [ ] 测试所有键盘快捷键
- [ ] 测试数据持久化功能

---

**文档维护者**: Vue Implementation Team  
**最后更新**: 2024-11-28  
**适用版本**: Vue 3.3+


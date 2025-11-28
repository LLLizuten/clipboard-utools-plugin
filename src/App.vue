<script lang="ts" setup>
import { onMounted, ref } from 'vue'
import Clipboard from './Clipboard/index.vue'

// 当前仅保留剪贴板功能，路由固定为 clipboard，兼容浏览器预览场景
const route = ref<'clipboard'>('clipboard')

onMounted(() => {
  if (window.utools) {
    // 仍监听插件进入，未来若扩展其他入口可在此添加分支
    window.utools.onPluginEnter((action) => {
      route.value = action.code as 'clipboard'
    })
    window.utools.onPluginOut(() => {
      route.value = 'clipboard'
    })
  }
})
</script>

<template>
  <Clipboard v-if="route === 'clipboard'" />
</template>

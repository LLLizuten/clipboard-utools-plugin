<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import Hello from './Hello/index.vue'
import Read from './Read/index.vue'
import Write from './Write/index.vue'
import Clipboard from './Clipboard/index.vue'

const route = ref('')
const enterAction = ref({})

onMounted(() => {
  if (window.utools) {
    window.utools.onPluginEnter((action) => {
      route.value = action.code
      enterAction.value = action
    })
    window.utools.onPluginOut((isKill) => {
      route.value = ''
    })
  } else {
    // Fallback for browser dev preview
    route.value = 'clipboard'
  }
})
</script>

<template>
  <template v-if="route === 'clipboard' || route === ''">
    <Clipboard></Clipboard>
  </template>
  <template v-if="route === 'hello'">
    <Hello :enterAction="enterAction"></Hello>
  </template>
  <template v-if="route === 'read'">
    <Read :enterAction="enterAction"></Read>
  </template>
  <template v-if="route === 'write'">
    <Write :enterAction="enterAction"></Write>
  </template>
</template>

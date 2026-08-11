<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { renderMarkdown } from '../lib/markdown'
import { renderDiagrams } from '../lib/mermaidRenderer'

const props = defineProps({
  source: { type: String, default: '' },
})

const container = ref(null)
const html = computed(() => renderMarkdown(props.source))

async function renderDiagramsInContainer() {
  if (container.value) {
    await renderDiagrams(container.value)
  }
}

onMounted(renderDiagramsInContainer)

watch(
  () => props.source,
  () => {
    void renderDiagramsInContainer()
  },
  { flush: 'post' },
)
</script>

<template>
  <div ref="container" class="markdown-body" v-html="html"></div>
</template>

<style scoped>
.markdown-body {
  height: 100%;
  overflow-y: auto;
  padding: 24px 28px;
  box-sizing: border-box;
}
</style>

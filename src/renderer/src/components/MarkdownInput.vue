<script setup>
import { ref } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue', 'loaded'])

let debounceTimer

function isMarkdownPath(path) {
  return /\.(md|markdown|mdx)$/i.test(path)
}

function onInput(event) {
  const value = event.target.value
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    emit('update:modelValue', value)
  }, 300)
}

async function onDrop(event) {
  const file = event.dataTransfer?.files?.[0]
  if (!file) return
  const path = window.electronAPI?.getPathForFile(file)
  if (!path || !isMarkdownPath(path)) {
    alert('Solo se permiten archivos .md, .markdown o .mdx')
    return
  }
  const result = await window.electronAPI.openFile(path)
  if (result) emit('loaded', result)
}
</script>

<template>
  <div class="editor-pane">
    <textarea
      class="editor"
      :value="props.modelValue"
      spellcheck="false"
      @input="onInput"
      @dragover.prevent
      @drop.prevent="onDrop"
    ></textarea>
  </div>
</template>

<style scoped>
.editor-pane {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.editor {
  flex: 1;
  width: 100%;
  border: none;
  resize: none;
  outline: none;
  padding: 20px 24px;
  box-sizing: border-box;
  font-family: var(--mono);
  font-size: 14px;
  line-height: 1.6;
  color: var(--text);
  background: transparent;
  white-space: pre;
}
</style>

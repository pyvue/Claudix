<template>
  <div class="selection-block" @click="handleClick">
    <div class="selection-header">
      <span class="selection-icon">📝</span>
      <span class="selection-label">{{ block.label }}</span>
    </div>
    <pre v-if="block.selectedText" class="selection-snippet"><code>{{ block.selectedText }}</code></pre>
  </div>
</template>

<script setup lang="ts">
import type { SelectionBlock as SelectionBlockType } from '../../../models/ContentBlock';
import type { ToolContext } from '../../../types/tool';

interface Props {
  block: SelectionBlockType;
  context?: ToolContext;
}

const props = defineProps<Props>();

function handleClick() {
  if (!props.context) return;

  props.context.fileOpener.open(props.block.filePath, {
    startLine: props.block.startLine,
    endLine: props.block.endLine
  });
}
</script>

<style scoped>
.selection-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 6px 0;
  padding: 8px 10px;
  background-color: var(--vscode-editor-background);
  border: 1px solid var(--vscode-panel-border);
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.selection-block:hover {
  background-color: var(--vscode-list-hoverBackground);
  border-color: var(--vscode-focusBorder);
}

.selection-header {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.selection-icon {
  font-size: 12px;
}

.selection-label {
  font-size: 12px;
  color: var(--vscode-textLink-foreground);
  font-family: var(--vscode-editor-font-family);
}

.selection-snippet {
  margin: 0;
  padding: 8px;
  background: color-mix(in srgb, var(--vscode-editor-background) 60%, var(--vscode-editor-foreground) 5%);
  border-radius: 4px;
  border: 1px dashed var(--vscode-editorInlayHint-foreground);
  font-family: var(--vscode-editor-font-family);
  font-size: 12px;
  white-space: pre-wrap;
  line-height: 1.4;
  color: var(--vscode-editor-foreground);
}
</style>

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

const emit = defineEmits(['send-command']);
const { t } = useI18n();

const commandInput = ref('');

const sendCommand = () => {
  const command = commandInput.value; // 获取原始输入，不进行 trim
  // 无论输入框是否为空，都发送内容（空字符串或命令）加上换行符
  console.log(`[CommandInputBar] Sending command: ${command || '<Enter>'} `); // 日志记录空回车
  emit('send-command', command + '\n'); // 发送命令（或空字符串）并附加换行符
  commandInput.value = ''; // 清空输入框
};
</script>

<template>
  <div class="command-input-bar">
    <div class="input-wrapper">
      <input
        type="text"
        v-model="commandInput"
        :placeholder="t('commandInputBar.placeholder')"
        class="command-input"
        @keydown.enter="sendCommand"
      />
      <!-- 可以在这里添加按钮 -->
    </div>
    <!-- 可以在这里添加其他按钮 -->
  </div>
</template>

<style scoped>
.command-input-bar {
  display: flex;
  align-items: center;
  padding: 5px 0px;
  background-color: var(--app-bg-color); /* Use theme variable */
  min-height: 30px; /* 保证一定高度 */
}

.input-wrapper {
  flex-grow: 1; /* 让输入框容器占据大部分空间 */
  display: flex;
  justify-content: center; /* 水平居中输入框 */
  background-color: transparent;
}

.command-input {
  padding: 6px 10px;
  border: 1px solid var(--border-color); /* Use theme variable */
  border-radius: 4px;
  font-size: 0.9em;
  background-color: var(--app-bg-color); /* Use theme variable */
  color: var(--text-color); /* Use theme variable */
  width: 60%; /* 输入框宽度，可调整 */
  max-width: 800px; /* 最大宽度 */
  outline: none;
  transition: border-color 0.2s ease-in-out, box-shadow 0.2s ease-in-out;
}

.command-input:focus {
  border-color: var(--button-bg-color); /* Use theme variable */
  box-shadow: 0 0 5px var(--button-bg-color, #007bff); /* Use theme variable for glow */
}

/* 可以添加按钮样式 */
/*
.command-input-bar button {
  margin-left: 10px;
  padding: 6px 12px;
}
*/
</style>

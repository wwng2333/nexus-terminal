<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'; // 移除 nextTick
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import 'xterm/css/xterm.css'; // 引入 xterm 样式

// 定义 props 和 emits
const props = defineProps<{
  sessionId: string; // 会话 ID
  isActive: boolean; // 新增：标记此终端是否为活动标签页
  stream?: ReadableStream<string>; // 用于接收来自 WebSocket 的数据流 (可选)
  options?: object; // xterm 的配置选项
}>();

const emit = defineEmits<{
  (e: 'data', data: string): void; // 用户输入事件
  (e: 'resize', dimensions: { cols: number; rows: number }): void; // 终端大小调整事件
  (e: 'ready', terminal: Terminal): void; // 终端准备就绪事件
}>();

const terminalRef = ref<HTMLElement | null>(null); // 终端容器的引用
let terminal: Terminal | null = null;
let fitAddon: FitAddon | null = null;
let resizeObserver: ResizeObserver | null = null;
let debounceTimer: number | null = null; // 用于防抖的计时器 ID

// 防抖函数
const debounce = (func: Function, delay: number) => {
  return (...args: any[]) => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = window.setTimeout(() => {
      func(...args);
      debounceTimer = null;
    }, delay);
  };
};

// 防抖处理 resize 事件的函数
const debouncedEmitResize = debounce((term: Terminal) => {
    if (term) {
        emit('resize', { cols: term.cols, rows: term.rows });
    }
}, 150); // 150ms 防抖延迟

// 初始化终端
onMounted(() => {
  if (terminalRef.value) {
    terminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Consolas, "Courier New", monospace',
      theme: { // 简单主题示例
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
      },
      rows: 24, // 初始行数
      cols: 80, // 初始列数
      ...props.options, // 合并外部传入的选项
    });

    // 加载插件
    fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());

    // 将终端附加到 DOM
    terminal.open(terminalRef.value);

    // 适应容器大小
    fitAddon.fit();
    emit('resize', { cols: terminal.cols, rows: terminal.rows }); // 触发初始 resize 事件

    // 监听用户输入
    terminal.onData((data) => {
      emit('data', data);
    });

    // 监听终端大小变化 (通过 ResizeObserver)
    if (terminalRef.value) {
        const container = terminalRef.value; // 捕获引用
        resizeObserver = new ResizeObserver(() => {
            // 检查容器是否实际可见
            if (container.offsetHeight > 0) {
                try {
                    fitAddon?.fit(); // 让 xterm 适应容器
                    // 只有当终端是活动的，才触发防抖的 resize 事件发送
                    if (props.isActive && terminal) {
                        debouncedEmitResize(terminal);
                    }
                } catch (e) {
                    console.warn("Fit addon resize failed:", e);
                }
            }
        });
        resizeObserver.observe(container);
    }

    // 不再需要重写 fitAddon.fit 方法来 emit resize
    // // 监听 fitAddon 的 resize 事件，获取新的尺寸并触发 emit
    // // 注意：fitAddon 本身不直接触发 resize 事件，我们需要在 fit() 后手动获取
    // const originalFit = fitAddon.fit.bind(fitAddon);
    // fitAddon.fit = () => {
    //     originalFit();
    //     if (terminal) {
    //         emit('resize', { cols: terminal.cols, rows: terminal.rows });
    //     }
    // };


    // 处理传入的数据流 (如果提供了 stream prop)
    watch(() => props.stream, async (newStream) => {
      if (newStream) {
        const reader = newStream.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (terminal && value) {
              terminal.write(value); // 将流数据写入终端
            }
          }
        } catch (error) {
          console.error('读取终端流时出错:', error);
        } finally {
          reader.releaseLock();
        }
      }
    }, { immediate: true }); // 立即执行一次 watch

    // 触发 ready 事件
    emit('ready', terminal);

    // 聚焦终端
    terminal.focus();
  }
});

// 组件卸载前清理资源
onBeforeUnmount(() => {
  if (resizeObserver && terminalRef.value) {
      resizeObserver.unobserve(terminalRef.value);
  }
  if (terminal) {
    terminal.dispose();
    terminal = null;
  }
});

// 暴露 write 方法给父组件 (可选)
const write = (data: string | Uint8Array) => {
    terminal?.write(data);
};
defineExpose({ write });

</script>

<template>
  <div ref="terminalRef" class="terminal-container"></div>
</template>

<style scoped>
.terminal-container {
  width: 100%;
  height: 100%; /* 高度需要由父容器控制 */
  overflow: hidden; /* 防止滚动条出现 */
}
</style>

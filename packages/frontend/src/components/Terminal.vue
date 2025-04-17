<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'; // 重新导入 nextTick
import { ITheme } from 'xterm';
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
  (e: 'ready', payload: { sessionId: string; terminal: Terminal }): void; // *** 修正：ready 事件传递包含 sessionId 和 terminal 实例的对象 ***
}>();

const terminalRef = ref<HTMLElement | null>(null); // 终端容器的引用
let terminal: Terminal | null = null;
let fitAddon: FitAddon | null = null;
let resizeObserver: ResizeObserver | null = null;
let debounceTimer: number | null = null; // 用于防抖的计时器 ID
const fontSize = ref(14); // 字体大小状态, 默认为14

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

// 防抖处理由 ResizeObserver 触发的 resize 事件
const debouncedEmitResize = debounce((term: Terminal) => {
    if (term && props.isActive) { // 仅当标签仍处于活动状态时才发送防抖后的 resize
        const dimensions = { cols: term.cols, rows: term.rows };
        console.log(`[Terminal ${props.sessionId}] Debounced resize emit (from ResizeObserver):`, dimensions);
        emit('resize', dimensions);
    } else {
        console.log(`[Terminal ${props.sessionId}] Debounced resize skipped (inactive).`);
    }
}, 150); // 150ms 防抖延迟

// 立即执行 Fit 并发送 Resize 的函数
const fitAndEmitResizeNow = (term: Terminal) => {
    if (!term) return;
    try {
        fitAddon?.fit();
        const dimensions = { cols: term.cols, rows: term.rows };
        console.log(`[Terminal ${props.sessionId}] Immediate resize emit:`, dimensions);
        emit('resize', dimensions);
    } catch (e) {
        console.warn("Immediate fit/resize failed:", e);
    }
};

// 初始化终端
onMounted(() => {
  if (terminalRef.value) {
    terminal = new Terminal({
      cursorBlink: true,
      fontSize: fontSize.value,
      fontFamily: 'Consolas, "Courier New", monospace, "Microsoft YaHei", "微软雅黑"',
      theme: { // 简单主题示例
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
      },
      rows: 24, // 初始行数
      cols: 80, // 初始列数
      allowTransparency: true,
      disableStdin: false,
      convertEol: true,
      scrollback: 1000, // 减少可滚动历史行数
      scrollOnUserInput: true, // 输入时滚动到底部
      ...props.options, // 合并外部传入的选项
    });
    
    // 注意: 终端数据的解码已在useSshTerminal.ts中进行处理

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

    // 监听终端大小变化 (通过 ResizeObserver) - 主要处理浏览器窗口大小变化等
    if (terminalRef.value) {
        const container = terminalRef.value; // 捕获引用
        resizeObserver = new ResizeObserver((entries) => {
            const entry = entries[0];
            const { height } = entry.contentRect;
            // console.log(`[Terminal ${props.sessionId}] ResizeObserver triggered. Height: ${height}, isActive: ${props.isActive}`);
            if (height > 0 && terminal) { // 仅在可见时调整
                 try {
                    // fitAddon?.fit(); // 视觉上适应 <-- 移除此行，不再强制 fit 内部行数
                    // 触发防抖的 resize 发送，通知后端潜在的尺寸变化
                    debouncedEmitResize(terminal);
                 } catch (e) {
                    console.warn("Fit addon resize failed (observer):", e);
                 }
            }
        });
        resizeObserver.observe(container);
    }

    // 监听 isActive prop 的变化，当标签变为活动时立即 fit 并发送 resize
    watch(() => props.isActive, (newValue) => {
        if (newValue && terminal && terminalRef.value) {
            // 当标签变为活动时，等待 DOM 更新和短暂延时后执行 fit
            console.log(`[Terminal ${props.sessionId}] 标签变为活动状态，准备调整尺寸。`); // 日志改为中文
            nextTick(() => {
                // 添加短暂延时，确保元素完全可见且渲染稳定
                setTimeout(() => {
                    // 再次检查终端实例是否存在且容器可见
                    if (terminal && terminalRef.value && terminalRef.value.offsetHeight > 0) {
                         console.log(`[Terminal ${props.sessionId}] 执行延时后的 fit 和 resize。`); // 日志改为中文
                        fitAndEmitResizeNow(terminal);
                    } else {
                         console.log(`[Terminal ${props.sessionId}] 延时后检查：终端不可见或已销毁，跳过 fit。`); // 日志改为中文
                    }
                }, 50); // 50ms 延时，可以根据需要调整
            });
        }
    });

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
              // 尝试在写入数据后调用 fit，看是否能触发滚动条
              nextTick(() => { // 使用 nextTick 确保 DOM 更新后再 fit
                try {
                  fitAddon?.fit();
                  // 注意：这里可能不需要再 emit resize，因为 fit 主要是为了更新内部布局以适应外部滚动
                } catch (fitError) {
                  console.warn("Fit addon failed after writing stream data:", fitError);
                }
              });
            }
          }
        } catch (error) {
          console.error('读取终端流时出错:', error);
        } finally {
          reader.releaseLock();
        }
      }
    }, { immediate: true }); // 立即执行一次 watch

    // 触发 ready 事件，传递 sessionId 和 terminal 实例
    if (terminal) { // 确保 terminal 实例已创建
        emit('ready', { sessionId: props.sessionId, terminal: terminal });
    }

    // 聚焦终端
    terminal.focus();
    
    // 重新添加鼠标滚轮缩放功能
    if (terminalRef.value) {
      terminalRef.value.addEventListener('wheel', (event: WheelEvent) => {
    //     // 只在按下Ctrl键时才触发缩放
    //     if (event.ctrlKey) {
    //       event.preventDefault(); // 阻止默认的滚动行为
          
    //       // 根据滚轮方向调整字体大小
    //       if (event.deltaY < 0) {
    //         // 向上滚动，增大字体
    //         fontSize.value = Math.min(fontSize.value + 1, 40); // 设置最大字体大小为40
    //       } else {
    //         // 向下滚动，减小字体
    //         fontSize.value = Math.max(fontSize.value - 1, 8); // 设置最小字体大小为8
    //       }
          
    //       // 更新终端字体大小
    //       if (terminal) {
    //         terminal.options.fontSize = fontSize.value;
    //         // 调整终端大小以适应新的字体大小
    //         fitAddon?.fit();
    //         emit('resize', { cols: terminal.cols, rows: terminal.rows });
    //       }
        // 只在按下Ctrl键时才触发缩放
        if (event.ctrlKey) {
          event.preventDefault(); // 阻止默认的滚动行为
          
          // 根据滚轮方向调整字体大小
          if (event.deltaY < 0) {
            // 向上滚动，增大字体
            fontSize.value = Math.min(fontSize.value + 1, 40); // 设置最大字体大小为40
          } else {
            // 向下滚动，减小字体
            fontSize.value = Math.max(fontSize.value - 1, 8); // 设置最小字体大小为8
          }
          
          // 更新终端字体大小
          if (terminal) {
            terminal.options.fontSize = fontSize.value;
            // 调整终端大小以适应新的字体大小
            fitAddon?.fit();
            emit('resize', { cols: terminal.cols, rows: terminal.rows });
          }
        }
      });
    }
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
/* 恢复默认样式，让 xterm 内部处理滚动 */
.terminal-container {
  width: 100%;
  height: 100%; /* 高度需要由父容器控制 */
}

/* 移除之前添加的 :deep 样式 */

.terminal-container :deep(.xterm-viewport) {
  overflow-y: auto !important; /* 强制垂直滚动条只在需要时显示 */
}
</style>

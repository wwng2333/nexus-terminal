<template>
  <div class="audit-log-view">
    <h1>{{ $t('auditLog.title') }}</h1>

    <!-- TODO: Add filtering options (Action Type, Date Range) -->

    <div v-if="store.isLoading" class="loading-indicator">
      {{ $t('common.loading') }}
    </div>
    <div v-if="store.error" class="error-message">
      {{ store.error }}
    </div>

    <div v-if="!store.isLoading && !store.error">
      <div v-if="logs.length === 0" class="alert alert-info">
        {{ $t('auditLog.noLogs') }}
      </div>
      <div v-else>
        <table class="table table-striped table-hover">
          <thead>
            <tr>
              <th>{{ $t('auditLog.table.timestamp') }}</th>
              <th>{{ $t('auditLog.table.actionType') }}</th>
              <th>{{ $t('auditLog.table.details') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="log in logs" :key="log.id">
              <td>{{ formatTimestamp(log.timestamp) }}</td>
              <td>{{ translateActionType(log.action_type) }}</td>
              <td>
                <pre v-if="log.details">{{ formatDetails(log.details) }}</pre>
                <span v-else>-</span>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- Pagination Controls -->
        <nav aria-label="Audit Log Pagination" v-if="totalPages > 1">
          <ul class="pagination justify-content-center">
            <li class="page-item" :class="{ disabled: currentPage === 1 }">
              <a class="page-link" href="#" @click.prevent="changePage(currentPage - 1)">&laquo;</a>
            </li>
            <li v-for="page in paginationRange" :key="page" class="page-item" :class="{ active: page === currentPage, 'disabled': page === '...' }">
              <a v-if="page !== '...'" class="page-link" href="#" @click.prevent="changePage(page as number)">{{ page }}</a>
              <span v-else class="page-link">...</span>
            </li>
            <li class="page-item" :class="{ disabled: currentPage === totalPages }">
              <a class="page-link" href="#" @click.prevent="changePage(currentPage + 1)">&raquo;</a>
            </li>
          </ul>
        </nav>
         <div class="text-center text-muted mt-2">
            {{ $t('auditLog.paginationInfo', { currentPage, totalPages, totalLogs }) }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useAuditLogStore } from '../stores/audit.store';
import { AuditLogEntry, AuditLogActionType } from '../types/server.types';
import { useI18n } from 'vue-i18n';

const store = useAuditLogStore();
const { t } = useI18n();

const logs = computed(() => store.logs);
const totalLogs = computed(() => store.totalLogs);
const currentPage = computed(() => store.currentPage);
const logsPerPage = computed(() => store.logsPerPage);

const totalPages = computed(() => Math.ceil(totalLogs.value / logsPerPage.value));

onMounted(() => {
  store.fetchLogs();
});

const formatTimestamp = (timestamp: number): string => {
  // Convert seconds to milliseconds for Date constructor
  return new Date(timestamp * 1000).toLocaleString();
};

const translateActionType = (actionType: AuditLogActionType): string => {
    // Attempt to translate using a convention like auditLog.actions.ACTION_TYPE
    const key = `auditLog.actions.${actionType}`;
    const translated = t(key);
    // If translation is missing, return the original type
    return translated === key ? actionType : translated;
};

const formatDetails = (details: AuditLogEntry['details']): string => {
  if (!details) return '';
  if (typeof details === 'object' && details !== null) {
    if ('raw' in details && details.parseError) {
        return `[Parse Error] Raw: ${details.raw}`;
    }
    return JSON.stringify(details, null, 2); // Pretty print JSON
  }
  return String(details); // Should ideally not happen if backend sends JSON string
};

const changePage = (page: number) => {
  if (page >= 1 && page <= totalPages.value && page !== currentPage.value) {
    store.fetchLogs(page);
  }
};

// Simple pagination range logic (can be improved for many pages)
const paginationRange = computed(() => {
    const range: (number | string)[] = [];
    const delta = 2; // Number of pages around current page
    const left = currentPage.value - delta;
    const right = currentPage.value + delta + 1;
    let l: number | null = null; // Keep track of the last number added

    for (let i = 1; i <= totalPages.value; i++) {
        if (i === 1 || i === totalPages.value || (i >= left && i < right)) {
            range.push(i);
        }
    }

    const result: (number | string)[] = [];
    for (const pageNum of range) {
         // Ensure pageNum is treated as number for comparison/arithmetic
        const currentNum = pageNum as number;
        if (l !== null) {
            // Calculate difference explicitly as numbers
            if (currentNum - l === 2) {
                result.push(l + 1);
            } else if (currentNum - l > 1) { // Check if difference is greater than 1
                result.push('...');
            }
        }
        result.push(currentNum);
        l = currentNum; // Store the current number
    }
    return result;
});

</script>

<style scoped>
.audit-log-view {
  padding: var(--base-padding, 20px); /* 使用变量 */
  color: var(--text-color);
  background-color: var(--app-bg-color);
  min-height: calc(100vh - 60px); /* Example: Adjust based on header/footer height */
}

.audit-log-view h1 {
    margin-bottom: calc(var(--base-margin, 1rem) * 2); /* Add space below title */
    color: var(--text-color); /* Ensure title color */
}

.loading-indicator, .error-message {
  margin-top: var(--base-margin, 1rem); /* 使用变量 */
  text-align: center;
  color: var(--text-color-secondary); /* 使用次要文本颜色 */
}

.error-message {
  color: var(--bs-danger); /* 保留特定错误颜色 */
}

/* 表格容器，增加边框和圆角 */
.table-container {
    border: 1px solid var(--border-color, #dee2e6);
    border-radius: 5px;
    overflow: hidden; /* Ensures border-radius clips table corners */
    margin-top: var(--base-margin, 1rem);
    background-color: var(--app-bg-color); /* Ensure background */
}

/* 表格样式 */
.table {
    width: 100%;
    /* margin-top: var(--base-margin, 1rem); */ /* Moved margin to container */
    border-collapse: collapse; /* 移除单元格间距 */
    /* background-color: var(--app-bg-color); */ /* Background on container */
    color: var(--text-color); /* 确保文本颜色 */
    border: none; /* Remove table's own border if container has one */
}

.table th,
.table td {
    padding: 0.8rem 1rem; /* Slightly increase padding */
    vertical-align: middle; /* Align vertically in the middle */
    border-top: 1px solid var(--border-color, #dee2e6); /* 使用变量 */
    text-align: left; /* 确保左对齐 */
}

/* Remove top border for the first row */
.table tbody tr:first-child td {
    border-top: none;
}


.table thead th {
    padding: 0.8rem 1rem; /* Match cell padding */
    vertical-align: bottom;
    border-bottom: 2px solid var(--border-color, #dee2e6); /* 使用变量，加粗底部边框 */
    border-top: none; /* No top border for header */
    background-color: var(--header-bg-color, #f8f9fa); /* 使用变量 */
    color: var(--text-color); /* 确保表头文本颜色 */
    font-weight: 600; /* Slightly less bold */
    white-space: nowrap; /* Prevent header text wrapping */
}

/* 条纹样式 */
.table-striped tbody tr:nth-of-type(odd) {
     background-color: var(--header-bg-color, #f8f9fa); /* Use header bg for subtle stripe */
     /* Ensure text color remains readable */
     color: var(--text-color);
}
.table-striped tbody tr:nth-of-type(even) {
     background-color: var(--app-bg-color); /* Ensure even rows match app background */
}


/* 悬停样式 */
.table-hover tbody tr:hover {
    background-color: rgba(0, 0, 0, 0.05); /* Subtle hover effect */
    /* Or use a variable like --row-hover-bg-color */
    cursor: default; /* Indicate non-interactive rows */
}


pre {
  white-space: pre-wrap; /* Allow wrapping */
  word-break: break-all; /* Break long strings */
  background-color: var(--app-bg-color); /* Match app background */
  padding: calc(var(--base-padding, 0.5rem) * 0.8); /* Slightly smaller padding */
  border: 1px solid var(--border-color, #dee2e6); /* 添加边框 */
  border-radius: 4px; /* Consistent border radius */
  font-size: 0.85em; /* Slightly smaller font */
  color: var(--text-color); /* 确保文本颜色 */
  max-height: 150px; /* Limit height */
  overflow-y: auto; /* Add scroll if needed */
  margin: 0; /* Remove default margin */
}

/* 分页样式 */
.pagination {
    margin-top: calc(var(--base-margin, 1rem) * 1.5); /* 使用变量 */
}

.page-item .page-link {
    color: var(--link-color, #007bff); /* 使用变量 */
    background-color: var(--app-bg-color);
    border: 1px solid var(--border-color, #dee2e6);
    margin: 0 2px; /* Add small horizontal margin */
    border-radius: 4px; /* Add border radius */
    transition: background-color 0.15s ease-in-out, color 0.15s ease-in-out, border-color 0.15s ease-in-out; /* Smooth transition */
}

.page-item.active .page-link {
    z-index: 3;
    color: var(--button-text-color, #fff); /* 使用变量 */
    background-color: var(--button-bg-color, #007bff); /* 使用变量 */
    border-color: var(--button-bg-color, #007bff); /* 使用变量 */
}

.page-item.disabled .page-link {
    color: var(--text-color-secondary, #6c757d); /* 使用变量 */
    pointer-events: none;
    background-color: var(--app-bg-color);
    border-color: var(--border-color, #dee2e6);
    opacity: 0.65; /* Indicate disabled state */
}

.page-link:hover:not(.active) { /* Apply hover only if not active */
    color: var(--link-hover-color, #0056b3); /* 使用变量 */
    background-color: var(--header-bg-color, #e9ecef); /* 使用变量 */
    border-color: var(--border-color, #dee2e6);
}

/* Remove border from the pagination container itself */
.pagination {
    border: none;
}

/* Alert 样式 */
.alert-info {
    color: var(--text-color); /* 调整颜色使其更通用 */
    background-color: var(--header-bg-color, #e9ecef); /* 使用变量 */
    border-color: var(--border-color, #dee2e6); /* 使用变量 */
    padding: var(--base-padding, 1rem);
    margin-top: var(--base-margin, 1rem);
    border-radius: 0.25rem;
}

.text-muted {
     color: var(--text-color-secondary) !important; /* 确保覆盖 Bootstrap */
}
</style>

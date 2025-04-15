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
  padding: 20px;
}
.loading-indicator, .error-message {
  margin-top: 1rem;
  text-align: center;
}
.error-message {
  color: var(--bs-danger);
}
pre {
  white-space: pre-wrap; /* Allow wrapping */
  word-break: break-all; /* Break long strings */
  background-color: #f8f9fa;
  padding: 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.9em;
}
.pagination {
    margin-top: 1.5rem;
}
</style>

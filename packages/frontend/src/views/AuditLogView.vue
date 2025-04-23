<template>
  <div class="p-4 bg-background text-foreground"> <!-- Outer container with padding -->
    <div class="max-w-7xl mx-auto"> <!-- Inner container for max-width (slightly wider for table) and centering -->
      <h1 class="text-xl font-semibold text-foreground mb-4 pb-2 border-b border-border"> <!-- Title styling -->
        {{ $t('auditLog.title') }}
      </h1>

      <!-- TODO: Add filtering options (Action Type, Date Range) -->

      <div v-if="store.isLoading" class="p-4 text-center text-text-secondary italic"> <!-- Loading state -->
        {{ $t('common.loading') }}
      </div>
      <div v-if="store.error" class="p-4 mb-4 border-l-4 border-error bg-error/10 text-error rounded"> <!-- Error state -->
        {{ store.error }}
      </div>

      <div v-if="!store.isLoading && !store.error">
        <div v-if="logs.length === 0" class="p-4 mb-4 border-l-4 border-blue-400 bg-blue-100 text-blue-700 rounded"> <!-- No logs state -->
          {{ $t('auditLog.noLogs') }}
        </div>
        <div v-else>
          <div class="border border-border rounded-lg overflow-hidden shadow-sm mt-4 bg-background"> <!-- Table container -->
            <div class="overflow-x-auto"> <!-- Allow horizontal scroll -->
              <table class="min-w-full divide-y divide-border text-sm"> <!-- Table styling -->
                <thead class="bg-header">
                  <tr>
                    <th scope="col" class="px-6 py-3 text-left font-medium text-text-secondary tracking-wider whitespace-nowrap">{{ $t('auditLog.table.timestamp') }}</th>
                    <th scope="col" class="px-6 py-3 text-left font-medium text-text-secondary tracking-wider whitespace-nowrap">{{ $t('auditLog.table.actionType') }}</th>
                    <th scope="col" class="px-6 py-3 text-left font-medium text-text-secondary tracking-wider">{{ $t('auditLog.table.details') }}</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-border">
                  <tr v-for="log in logs" :key="log.id" class="hover:bg-header/50"> <!-- Table rows with hover -->
                    <td class="px-6 py-4 whitespace-nowrap">{{ formatTimestamp(log.timestamp) }}</td>
                    <td class="px-6 py-4 whitespace-nowrap">{{ translateActionType(log.action_type) }}</td>
                    <td class="px-6 py-4">
                      <pre v-if="log.details" class="whitespace-pre-wrap break-all bg-header/50 p-2 border border-border/50 rounded text-xs font-mono max-h-40 overflow-y-auto">{{ formatDetails(log.details) }}</pre> <!-- Details pre styling -->
                      <span v-else class="text-text-secondary">-</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <!-- Pagination Controls -->
          <nav aria-label="Audit Log Pagination" v-if="totalPages > 1" class="mt-6 flex justify-center">
            <ul class="inline-flex items-center -space-x-px">
              <li>
                <a href="#" @click.prevent="changePage(currentPage - 1)"
                   :class="['px-3 py-2 ml-0 leading-tight text-text-secondary bg-background border border-border rounded-l-lg hover:bg-header hover:text-foreground', { 'opacity-50 cursor-not-allowed pointer-events-none': currentPage === 1 }]">
                  &laquo;
                </a>
              </li>
              <li v-for="page in paginationRange" :key="page">
                <a v-if="page !== '...'" href="#" @click.prevent="changePage(page as number)"
                   :class="['px-3 py-2 leading-tight border border-border', page === currentPage ? 'text-button-text bg-button border-button hover:bg-button-hover' : 'text-text-secondary bg-background hover:bg-header hover:text-foreground']">
                  {{ page }}
                </a>
                <span v-else class="px-3 py-2 leading-tight text-text-secondary bg-background border border-border">...</span>
              </li>
              <li>
                <a href="#" @click.prevent="changePage(currentPage + 1)"
                   :class="['px-3 py-2 leading-tight text-text-secondary bg-background border border-border rounded-r-lg hover:bg-header hover:text-foreground', { 'opacity-50 cursor-not-allowed pointer-events-none': currentPage === totalPages }]">
                  &raquo;
                </a>
              </li>
            </ul>
          </nav>
           <div class="text-center text-text-secondary text-sm mt-3"> <!-- Pagination info -->
              {{ $t('auditLog.paginationInfo', { currentPage, totalPages, totalLogs }) }}
          </div>
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
/* Remove all scoped styles as they are now handled by Tailwind utility classes */
</style>

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
      <div v-else> <!-- Wrapper for v-else content -->
        <div class="table-container"> <!-- Add table container -->
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
      </div> <!-- End table container -->
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
      </div> <!-- This closes the v-else block starting implicitly at line 18 -->
    </div> <!-- This closes the v-if block starting at line 14 -->
  </div> <!-- This closes the root div -->
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
  padding: var(--base-padding, 20px);
  color: var(--text-color);
  background-color: var(--app-bg-color);
  min-height: calc(100vh - 60px); /* Adjust based on actual header/footer */
  max-width: 1400px; /* Limit max width for better readability on large screens */
  margin: 0 auto; /* Center the view */
}

.audit-log-view h1 {
    margin-bottom: calc(var(--base-margin, 1rem) * 1.5); /* Adjust space */
    padding-bottom: var(--base-margin, 1rem);
    border-bottom: 1px solid var(--border-color);
    font-size: 1.8rem;
    color: var(--text-color);
}

.loading-indicator, .error-message, .alert {
  margin-top: var(--base-margin, 1rem);
  padding: var(--base-padding, 1rem);
  border-radius: 6px; /* Consistent border radius */
  text-align: center;
}

.loading-indicator {
  color: var(--text-color-secondary);
  font-style: italic;
}

.error-message {
  color: #842029;
  background-color: #f8d7da;
  border: 1px solid #f5c2c7;
  border-left-width: 4px;
}

/* Table container with shadow and border */
.table-container {
    border: 1px solid var(--border-color, #dee2e6);
    border-radius: 8px; /* Match SettingsView */
    overflow: hidden; /* Clip table corners */
    margin-top: var(--base-margin, 1rem);
    background-color: var(--content-bg-color, var(--app-bg-color)); /* Match SettingsView */
    box-shadow: 0 2px 5px rgba(0,0,0,0.05); /* Match SettingsView */
    overflow-x: auto; /* Allow horizontal scroll on small screens */
}

/* Table base styles */
.table {
    width: 100%;
    border-collapse: collapse;
    color: var(--text-color);
    border: none; /* Container handles border */
    font-size: 0.95rem; /* Slightly larger font */
}

.table th,
.table td {
    padding: 0.9rem 1.1rem; /* Adjust padding */
    vertical-align: middle;
    border-top: 1px solid var(--border-color-light, var(--border-color)); /* Use lighter border */
    text-align: left;
}

/* Remove top border for the first body row */
.table tbody tr:first-child td {
    border-top: none;
}

/* Table header */
.table thead th {
    vertical-align: bottom;
    border-bottom: 2px solid var(--border-color, #dee2e6);
    border-top: none;
    background-color: var(--table-header-bg-color, var(--header-bg-color)); /* Use variable */
    color: var(--table-header-text-color, var(--text-color)); /* Use variable */
    font-weight: 600;
    white-space: nowrap;
}

/* Striped rows */
.table-striped tbody tr:nth-of-type(odd) {
     background-color: var(--table-stripe-bg-color, rgba(0,0,0,0.02)); /* More subtle stripe */
     color: var(--text-color);
}
.table-striped tbody tr:nth-of-type(even) {
     background-color: transparent; /* Use container background */
}

/* Hover effect */
.table-hover tbody tr:hover {
    background-color: var(--table-hover-bg-color, rgba(0,0,0,0.04)); /* Subtle hover */
    cursor: default;
}

/* Details <pre> styling */
pre {
  white-space: pre-wrap;
  word-break: break-all;
  background-color: var(--code-bg-color, var(--header-bg-color)); /* Use code background */
  padding: 0.6rem 0.8rem; /* Adjust padding */
  border: 1px solid var(--border-color-light, var(--border-color));
  border-radius: 5px; /* Consistent radius */
  font-size: 0.88em; /* Adjust font size */
  color: var(--code-text-color, var(--text-color)); /* Use code text color */
  max-height: 180px; /* Increase max height slightly */
  overflow-y: auto;
  margin: 0;
  font-family: var(--font-family-monospace); /* Use monospace font */
}

/* Pagination styling */
.pagination {
    margin-top: calc(var(--base-margin, 1rem) * 2); /* Increase top margin */
    justify-content: center; /* Ensure centered */
    border: none;
}

.page-item .page-link {
    color: var(--link-color, #007bff);
    background-color: var(--content-bg-color, var(--app-bg-color)); /* Match container bg */
    border: 1px solid var(--border-color, #dee2e6);
    margin: 0 3px; /* Adjust margin */
    border-radius: 5px; /* Match other elements */
    padding: 0.4rem 0.8rem; /* Adjust padding */
    transition: background-color 0.15s ease-in-out, color 0.15s ease-in-out, border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
    font-size: 0.9rem;
}

.page-item.active .page-link {
    z-index: 3;
    color: var(--button-text-color, #fff);
    background-color: var(--button-bg-color, #007bff);
    border-color: var(--button-bg-color, #007bff);
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.page-item.disabled .page-link {
    color: var(--text-color-secondary, #6c757d);
    pointer-events: none;
    background-color: var(--content-bg-color, var(--app-bg-color));
    border-color: var(--border-color, #dee2e6);
    opacity: 0.6; /* Adjust opacity */
}

.page-link:hover { /* Combined hover for active/inactive */
    z-index: 2;
}

.page-item:not(.active) .page-link:hover {
    color: var(--link-hover-color, #0056b3);
    background-color: var(--header-bg-color, #e9ecef);
    border-color: var(--border-color, #dee2e6);
}

/* Alert Info styling */
.alert-info {
    color: var(--info-text-color, #0c5460); /* Specific info color */
    background-color: var(--info-bg-color, #d1ecf1); /* Specific info background */
    border: 1px solid var(--info-border-color, #bee5eb); /* Specific info border */
    border-left-width: 4px; /* Add left accent border */
    text-align: left; /* Align text left */
}

.text-muted {
     color: var(--text-color-secondary) !important;
     font-size: 0.9rem;
}
</style>

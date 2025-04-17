<template>
  <div class="notification-settings">
    <h2>{{ $t('settings.notifications.title') }}</h2>

    <div v-if="store.isLoading" class="loading-indicator">
      {{ $t('common.loading') }}
    </div>
    <div v-if="store.error" class="error-message">
      {{ store.error }}
    </div>

    <div v-if="!store.isLoading && !store.error">
      <button @click="showAddForm = true" class="btn btn-primary mb-3">
        {{ $t('settings.notifications.addChannel') }}
      </button>

      <div v-if="settings.length === 0" class="alert alert-info">
        {{ $t('settings.notifications.noChannels') }}
      </div>

      <ul v-else class="list-group">
        <li v-for="setting in settings" :key="setting.id" class="list-group-item d-flex justify-content-between align-items-center">
          <div>
            <strong class="me-2">{{ setting.name }}</strong>
            <span class="badge bg-secondary me-1">{{ getChannelTypeName(setting.channel_type) }}</span>
            <span :class="['badge', setting.enabled ? 'bg-success' : 'bg-warning']">
              {{ setting.enabled ? $t('common.enabled') : $t('common.disabled') }}
            </span>
            <small class="d-block text-muted">{{ getEventNames(setting.enabled_events) }}</small>
          </div>
          <div>
            <button @click="editSetting(setting)" class="btn btn-sm btn-outline-secondary me-2">
              {{ $t('common.edit') }}
            </button>
            <button @click="confirmDelete(setting)" class="btn btn-sm btn-outline-danger">
              {{ $t('common.delete') }}
            </button>
          </div>
        </li>
      </ul>
    </div>

    <!-- Add/Edit Form Modal (Placeholder - will create NotificationSettingForm.vue next) -->
    <div v-if="showAddForm || editingSetting" class="modal-placeholder">
      <!-- Use a simple conditional rendering for the form for now -->
      <!-- TODO: Consider using a proper modal component for better UX -->
      <NotificationSettingForm
        v-if="showAddForm || editingSetting"
        :initial-data="editingSetting"
        @save="handleSave"
        @cancel="closeForm"
        class="mt-4"
      />
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useNotificationsStore } from '../stores/notifications.store';
import { NotificationSetting, NotificationChannelType, NotificationEvent } from '../types/server.types';
import NotificationSettingForm from './NotificationSettingForm.vue'; // Import the form component
import { useI18n } from 'vue-i18n';

const store = useNotificationsStore();
const { t } = useI18n();

const showAddForm = ref(false);
const editingSetting = ref<NotificationSetting | null>(null);

const settings = computed(() => store.settings);

onMounted(() => {
  store.fetchSettings();
});

const getChannelTypeName = (type: NotificationChannelType): string => {
  switch (type) {
    case 'webhook': return t('settings.notifications.types.webhook');
    case 'email': return t('settings.notifications.types.email');
    case 'telegram': return t('settings.notifications.types.telegram');
    default: return type;
  }
};

const getEventNames = (events: NotificationEvent[]): string => {
  if (!events || events.length === 0) return t('settings.notifications.noEventsEnabled');
  // TODO: Translate event names if needed
  return t('settings.notifications.triggers') + ': ' + events.join(', ');
};

const editSetting = (setting: NotificationSetting) => {
  editingSetting.value = { ...setting }; // Clone to avoid modifying store directly
  showAddForm.value = false; // Ensure add form is hidden
};

const confirmDelete = (setting: NotificationSetting) => {
  if (setting.id && confirm(t('settings.notifications.confirmDelete', { name: setting.name }))) {
    store.deleteSetting(setting.id);
  }
};

const closeForm = () => {
  showAddForm.value = false;
  editingSetting.value = null;
};

// TODO: Implement save logic when form component is ready
const handleSave = (savedSetting: NotificationSetting) => {
  console.log('Setting saved:', savedSetting);
  closeForm();
  // The store should have updated the list automatically after add/update
  // Optionally, you could force a refresh if needed: store.fetchSettings();
};

</script>

<style scoped>
.notification-settings {
  padding: var(--base-padding);
  /* Inherits text color and background from parent (NotificationsView) */
}

h2 {
  color: var(--text-color);
  margin-bottom: calc(var(--base-margin) * 2);
  padding-bottom: var(--base-margin);
  border-bottom: 1px solid var(--border-color);
}

.loading-indicator, .error-message, .alert-info {
  margin-top: var(--base-margin);
  padding: var(--base-padding);
  border-radius: 4px;
  color: var(--text-color-secondary);
  background-color: var(--header-bg-color); /* Use header bg for subtle background */
  border: 1px solid var(--border-color);
}

.error-message {
  color: #dc3545; /* Keep specific error color */
  border-color: #dc3545;
  background-color: #f8d7da; /* Light red background for errors */
}

.alert-info {
    color: var(--text-color); /* Use primary text color for info */
}

.btn { /* General button styling */
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
    margin: var(--base-margin) 0; /* Add some default margin */
}

.btn-primary {
    background-color: var(--button-bg-color);
    border: 1px solid var(--button-bg-color);
    color: var(--button-text-color);
}
.btn-primary:hover {
     background-color: var(--button-hover-bg-color);
     border-color: var(--button-hover-bg-color);
     color: var(--button-text-color);
}

.btn-outline-secondary {
    color: var(--text-color-secondary);
    border: 1px solid var(--border-color);
    background-color: transparent;
}
.btn-outline-secondary:hover {
    background-color: var(--header-bg-color);
    color: var(--text-color);
    border-color: var(--border-color);
}

.btn-outline-danger {
    color: #dc3545; /* Keep specific danger color */
    border: 1px solid #dc3545;
    background-color: transparent;
}
.btn-outline-danger:hover {
    background-color: #dc3545;
    color: var(--button-text-color);
    border-color: #dc3545;
}

.list-group {
    list-style: none;
    padding: 0;
    margin-top: var(--base-margin);
}

.list-group-item {
    background-color: var(--app-bg-color);
    border: 1px solid var(--border-color);
    color: var(--text-color);
    padding: var(--base-padding);
    margin-bottom: var(--base-margin); /* Space between items */
    border-radius: 4px;
    display: flex;
    justify-content: space-between;
    align-items: center;
}
.list-group-item:last-child {
    margin-bottom: 0;
}

.list-group-item strong {
    color: var(--text-color);
}

.list-group-item .text-muted {
    color: var(--text-color-secondary);
    font-size: 0.9em;
    margin-top: calc(var(--base-margin) / 2);
}

.badge {
    padding: 0.3em 0.6em;
    font-size: 0.8em;
    border-radius: 0.25rem;
    font-weight: bold;
}

.badge.bg-secondary {
    background-color: var(--text-color-secondary);
    color: var(--app-bg-color); /* Use app background for contrast */
}
.badge.bg-success {
    background-color: #198754; /* Keep specific success color */
    color: #fff;
}
.badge.bg-warning {
    background-color: #ffc107; /* Keep specific warning color */
    color: #000; /* Black text for better contrast on yellow */
}

.modal-placeholder {
  margin-top: calc(var(--base-margin) * 3);
  padding: var(--base-padding);
  border: 1px solid var(--border-color);
  background-color: var(--header-bg-color);
  border-radius: 4px;
}
</style>

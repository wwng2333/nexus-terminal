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
  padding: var(--base-padding, 1rem); /* 使用变量 */
  /* Inherits text color and background from parent */
}
.loading-indicator, .error-message {
  margin-top: var(--base-margin, 1rem); /* 使用变量 */
  color: var(--text-color-secondary); /* 使用次要文本颜色 */
}
.error-message {
  color: var(--bs-danger); /* 保留 Bootstrap 变量或特定错误颜色 */
}

/* Apply variables to list items if needed (assuming Bootstrap classes handle most styling) */
.list-group-item {
    background-color: var(--app-bg-color);
    border-color: var(--border-color);
    color: var(--text-color);
}
.list-group-item .text-muted {
    color: var(--text-color-secondary);
}
/* Apply variables to buttons if not handled by global styles or Bootstrap */
.btn-primary {
    background-color: var(--button-bg-color);
    border-color: var(--button-bg-color);
    color: var(--button-text-color);
}
.btn-primary:hover {
     background-color: var(--button-hover-bg-color);
     border-color: var(--button-hover-bg-color);
}
.btn-outline-secondary {
    color: var(--text-color-secondary);
    border-color: var(--border-color);
}
.btn-outline-secondary:hover {
    background-color: var(--header-bg-color); /* Example hover */
    color: var(--text-color);
}
.btn-outline-danger {
    color: var(--bs-danger); /* Keep specific color */
    border-color: var(--bs-danger);
}
.btn-outline-danger:hover {
    background-color: var(--bs-danger);
    color: var(--button-text-color);
}
/* Apply variables to badges if needed */
.badge.bg-secondary {
    background-color: var(--text-color-secondary);
    color: var(--button-text-color); /* Assuming high contrast needed */
}
/* Keep success/warning colors for status or define specific variables later */
/* .badge.bg-success {} */
/* .badge.bg-warning {} */


.modal-placeholder {
  margin-top: calc(var(--base-margin, 1rem) * 2); /* 使用变量 */
  padding: var(--base-padding, 1rem); /* 使用变量 */
  border: 1px dashed var(--border-color, #ccc); /* 使用变量 */
  background-color: var(--header-bg-color, #f8f9fa); /* 使用变量 */
}
</style>

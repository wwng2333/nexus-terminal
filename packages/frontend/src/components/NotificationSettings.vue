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
        <i class="fas fa-plus me-1"></i> {{ $t('settings.notifications.addChannel') }} <!-- Optional: Add icon -->
      </button>

      <div v-if="settings.length === 0" class="alert alert-info">
        {{ $t('settings.notifications.noChannels') }}
      </div>

      <!-- Use a container for the list -->
      <div v-else class="notification-list-container">
        <div v-for="setting in settings" :key="setting.id" class="notification-item">
          <div class="notification-item-details">
            <strong class="notification-name">{{ setting.name }}</strong>
            <div class="notification-badges">
                <span class="badge badge-channel-type me-1">{{ getChannelTypeName(setting.channel_type) }}</span>
                <span :class="['badge', setting.enabled ? 'badge-status-enabled' : 'badge-status-disabled']">
                {{ setting.enabled ? $t('common.enabled') : $t('common.disabled') }}
                </span>
            </div>
            <small class="notification-events">{{ getEventNames(setting.enabled_events) }}</small>
          </div>
          <div class="notification-item-actions">
            <button @click="editSetting(setting)" class="btn btn-sm btn-secondary me-2"> <!-- Changed to btn-secondary -->
              <i class="fas fa-pencil-alt"></i> {{ $t('common.edit') }} <!-- Optional: Add icon -->
            </button>
            <button @click="confirmDelete(setting)" class="btn btn-sm btn-danger"> <!-- Changed to btn-danger -->
               <i class="fas fa-trash-alt"></i> {{ $t('common.delete') }} <!-- Optional: Add icon -->
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Add/Edit Form Section -->
    <div v-if="showAddForm || editingSetting" class="form-section">
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
}

h2 {
  color: var(--text-color);
  margin-bottom: calc(var(--base-margin) * 1.5); /* Adjust margin */
  padding-bottom: var(--base-margin);
  border-bottom: 1px solid var(--border-color);
  font-size: 1.6rem; /* Adjust size */
}

.loading-indicator, .error-message, .alert-info {
  margin-top: var(--base-margin);
  padding: var(--base-padding);
  border-radius: 6px; /* Consistent radius */
  border: 1px solid transparent; /* Base border */
}

.loading-indicator {
  color: var(--text-color-secondary);
  font-style: italic;
  text-align: center;
}

.error-message {
  color: #842029;
  background-color: #f8d7da;
  border-color: #f5c2c7;
  border-left: 4px solid #842029;
}

.alert-info {
    color: var(--info-text-color, #0c5460);
    background-color: var(--info-bg-color, #d1ecf1);
    border-color: var(--info-border-color, #bee5eb);
    border-left: 4px solid var(--info-border-color, #bee5eb);
}

/* Add Channel Button */
.btn-primary {
    margin-bottom: calc(var(--base-margin) * 1.5) !important; /* Ensure spacing below button */
    /* Inherits base btn styles */
}

/* Notification List Container */
.notification-list-container {
    margin-top: var(--base-margin);
    display: grid; /* Use grid for layout */
    gap: var(--base-margin); /* Space between items */
}

/* Individual Notification Item (Card-like) */
.notification-item {
    background-color: var(--content-bg-color, var(--app-bg-color));
    border: 1px solid var(--border-color);
    color: var(--text-color);
    padding: var(--base-padding);
    border-radius: 8px; /* Rounded corners */
    display: flex;
    justify-content: space-between;
    align-items: flex-start; /* Align items to the top */
    gap: var(--base-margin); /* Space between details and actions */
    box-shadow: 0 1px 3px rgba(0,0,0,0.04); /* Subtle shadow */
    transition: box-shadow 0.2s ease;
}
.notification-item:hover {
    box-shadow: 0 3px 8px rgba(0,0,0,0.06); /* Slightly larger shadow on hover */
}

.notification-item-details {
    flex-grow: 1; /* Allow details to take up available space */
}

.notification-name {
    font-weight: 600; /* Make name slightly bolder */
    font-size: 1.1rem;
    color: var(--text-color);
    display: block; /* Ensure it takes its own line */
    margin-bottom: calc(var(--base-margin) / 4);
}

.notification-badges {
    margin-bottom: calc(var(--base-margin) / 2);
}

.notification-events {
    color: var(--text-color-secondary);
    font-size: 0.9em;
    display: block; /* Ensure it takes its own line */
    margin-top: calc(var(--base-margin) / 2);
}

.notification-item-actions {
    display: flex;
    align-items: center; /* Align buttons vertically */
    flex-shrink: 0; /* Prevent actions from shrinking */
}

/* Badge Styling */
.badge {
    padding: 0.3em 0.7em; /* Adjust padding */
    font-size: 0.75rem; /* Adjust size */
    border-radius: 4px; /* Slightly rounded */
    font-weight: 600;
    text-transform: uppercase; /* Optional: Uppercase text */
    letter-spacing: 0.5px; /* Optional: Add letter spacing */
    line-height: 1; /* Ensure consistent height */
}

.badge-channel-type {
    background-color: var(--secondary-button-bg-color, var(--header-bg-color));
    color: var(--secondary-button-text-color, var(--text-color));
    border: 1px solid var(--border-color);
}
.badge-status-enabled {
    background-color: var(--success-bg-color, #d1e7dd); /* Use variable or fallback */
    color: var(--success-text-color, #0f5132);
    border: 1px solid var(--success-border-color, #badbcc);
}
.badge-status-disabled {
    background-color: var(--warning-bg-color, #fff3cd); /* Use variable or fallback */
    color: var(--warning-text-color, #664d03);
    border: 1px solid var(--warning-border-color, #ffecb5);
}


/* Action Buttons within list item */
.notification-item-actions .btn {
    margin: 0; /* Remove default btn margin */
    /* Use btn-sm for smaller buttons */
}
.notification-item-actions .btn-secondary {
    /* Uses base btn-secondary styles */
}
.notification-item-actions .btn-danger {
     /* Uses base btn-danger styles */
}


/* Form Section Styling */
.form-section {
  margin-top: calc(var(--base-margin) * 2); /* More space before form */
  padding: calc(var(--base-padding) * 1.5); /* More padding */
  border: 1px solid var(--border-color);
  background-color: var(--content-bg-color, var(--app-bg-color)); /* Match item background */
  border-radius: 8px; /* Consistent radius */
  box-shadow: 0 2px 5px rgba(0,0,0,0.05); /* Consistent shadow */
}

/* Inherited Button Styles (Ensure consistency with SettingsView/AuditLogView) */
.btn {
  padding: 0.5rem 1rem;
  border-radius: 5px;
  cursor: pointer;
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease, transform 0.1s ease;
  font-weight: 600;
  font-size: 0.95rem;
  line-height: 1.5;
  border: 1px solid transparent;
}
.btn:hover:not(:disabled) {
  transform: translateY(-1px);
}
.btn:active:not(:disabled) {
    transform: translateY(0px);
}
.btn:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}
.btn-primary {
    background-color: var(--button-bg-color);
    border-color: var(--button-bg-color);
    color: var(--button-text-color);
}
.btn-primary:hover:not(:disabled) {
     background-color: var(--button-hover-bg-color);
     border-color: var(--button-hover-bg-color);
}
.btn-secondary {
    background-color: var(--secondary-button-bg-color, var(--header-bg-color));
    color: var(--secondary-button-text-color, var(--text-color));
    border: 1px solid var(--border-color);
}
.btn-secondary:hover:not(:disabled) {
    background-color: var(--secondary-button-hover-bg-color, var(--border-color));
    border-color: var(--border-color);
}
.btn-danger {
  background-color: var(--danger-color, #dc3545);
  color: white;
  border-color: transparent;
}
.btn-danger:hover:not(:disabled) {
  background-color: var(--danger-hover-color, #bb2d3b);
  border-color: transparent;
}
.btn-sm { /* Small button variant */
    padding: 0.25rem 0.6rem;
    font-size: 0.85rem;
}
.mb-3 { /* Bootstrap margin bottom utility */
    margin-bottom: var(--base-margin) !important;
}
.me-1 { margin-right: 0.25rem !important; }
.me-2 { margin-right: 0.5rem !important; }
</style>

<template>
  <form @submit.prevent="handleSubmit" class="notification-setting-form">
    <h3>{{ isEditing ? $t('settings.notifications.form.editTitle') : $t('settings.notifications.form.addTitle') }}</h3>

    <div class="mb-3">
      <label for="setting-name" class="form-label">{{ $t('settings.notifications.form.name') }}</label>
      <input type="text" id="setting-name" v-model="formData.name" class="form-control" required>
    </div>

    <div class="mb-3 form-check">
      <input type="checkbox" id="setting-enabled" v-model="formData.enabled" class="form-check-input">
      <label for="setting-enabled" class="form-check-label">{{ $t('common.enabled') }}</label>
    </div>

    <div class="mb-3">
      <label for="setting-channel-type" class="form-label">{{ $t('settings.notifications.form.channelType') }}</label>
      <select id="setting-channel-type" v-model="formData.channel_type" class="form-select" required :disabled="isEditing">
        <option value="webhook">{{ $t('settings.notifications.types.webhook') }}</option>
        <option value="email">{{ $t('settings.notifications.types.email') }}</option>
        <option value="telegram">{{ $t('settings.notifications.types.telegram') }}</option>
      </select>
       <small v-if="isEditing" class="text-muted">{{ $t('settings.notifications.form.channelTypeEditNote') }}</small>
    </div>

    <!-- Channel Specific Config -->
    <div v-if="formData.channel_type === 'webhook'" class="channel-config mb-3 p-3 border rounded">
      <h4>{{ $t('settings.notifications.types.webhook') }} {{ $t('common.settings') }}</h4>
      <div class="mb-3">
        <label for="webhook-url" class="form-label">URL</label>
        <input type="url" id="webhook-url" v-model="webhookConfig.url" class="form-control" required>
      </div>
       <div class="mb-3">
        <label for="webhook-method" class="form-label">{{ $t('settings.notifications.form.webhookMethod') }}</label>
        <select id="webhook-method" v-model="webhookConfig.method" class="form-select">
            <option value="POST">POST</option>
            <option value="GET">GET</option>
            <option value="PUT">PUT</option>
        </select>
      </div>
       <div class="mb-3">
        <label for="webhook-headers" class="form-label">{{ $t('settings.notifications.form.webhookHeaders') }} (JSON)</label>
        <textarea id="webhook-headers" v-model="webhookHeadersString" class="form-control" rows="3" placeholder='{"Content-Type": "application/json", "Authorization": "Bearer ..."}'></textarea>
        <small v-if="headerError" class="text-danger">{{ headerError }}</small>
      </div>
       <div class="mb-3">
        <label for="webhook-body" class="form-label">{{ $t('settings.notifications.form.webhookBodyTemplate') }}</label>
        <textarea id="webhook-body" v-model="webhookConfig.bodyTemplate" class="form-control" rows="3" :placeholder="$t('settings.notifications.form.webhookBodyPlaceholder')"></textarea>
         <small class="text-muted">{{ $t('settings.notifications.form.templateHelp') }}</small>
      </div>
    </div>

    <div v-if="formData.channel_type === 'email'" class="channel-config mb-3 p-3 border rounded">
       <h4>{{ $t('settings.notifications.types.email') }} {{ $t('common.settings') }}</h4>
       <div class="mb-3">
        <label for="email-to" class="form-label">{{ $t('settings.notifications.form.emailTo') }}</label>
        <input type="email" id="email-to" v-model="emailConfig.to" class="form-control" required placeholder="recipient1@example.com, recipient2@example.com">
         <small class="text-muted">{{ $t('settings.notifications.form.emailToHelp') }}</small>
      </div>
       <div class="mb-3">
        <label for="email-subject" class="form-label">{{ $t('settings.notifications.form.emailSubjectTemplate') }}</label>
        <input type="text" id="email-subject" v-model="emailConfig.subjectTemplate" class="form-control" :placeholder="$t('settings.notifications.form.emailSubjectPlaceholder')">
         <small class="text-muted">{{ $t('settings.notifications.form.templateHelp') }}</small>
      </div>
      <!-- SMTP Settings -->
      <div class="mb-3">
        <label for="smtp-host" class="form-label">{{ $t('settings.notifications.form.smtpHost') }}</label>
        <input type="text" id="smtp-host" v-model="emailConfig.smtpHost" class="form-control" required>
      </div>
      <div class="row">
        <div class="col-md-6 mb-3">
          <label for="smtp-port" class="form-label">{{ $t('settings.notifications.form.smtpPort') }}</label>
          <input type="number" id="smtp-port" v-model.number="emailConfig.smtpPort" class="form-control" required>
        </div>
        <div class="col-md-6 mb-3 d-flex align-items-end">
           <div class="form-check">
             <input type="checkbox" id="smtp-secure" v-model="emailConfig.smtpSecure" class="form-check-input">
             <label for="smtp-secure" class="form-check-label">{{ $t('settings.notifications.form.smtpSecure') }} (TLS)</label>
           </div>
        </div>
      </div>
      <div class="mb-3">
        <label for="smtp-user" class="form-label">{{ $t('settings.notifications.form.smtpUser') }}</label>
        <input type="text" id="smtp-user" v-model="emailConfig.smtpUser" class="form-control">
      </div>
      <div class="mb-3">
        <label for="smtp-pass" class="form-label">{{ $t('settings.notifications.form.smtpPass') }}</label>
        <input type="password" id="smtp-pass" v-model="emailConfig.smtpPass" class="form-control">
      </div>
       <div class="mb-3">
        <label for="smtp-from" class="form-label">{{ $t('settings.notifications.form.smtpFrom') }}</label>
        <input type="email" id="smtp-from" v-model="emailConfig.from" class="form-control" required placeholder="sender@example.com">
         <small class="text-muted">{{ $t('settings.notifications.form.smtpFromHelp') }}</small>
      </div>
      <!-- Removed duplicate test button from here -->
    </div>

    <div v-if="formData.channel_type === 'telegram'" class="channel-config mb-3 p-3 border rounded">
       <h4>{{ $t('settings.notifications.types.telegram') }} {{ $t('common.settings') }}</h4>
       <div class="mb-3">
        <label for="telegram-token" class="form-label">{{ $t('settings.notifications.form.telegramToken') }}</label>
        <input type="password" id="telegram-token" v-model="telegramConfig.botToken" class="form-control" required>
         <small class="text-muted">{{ $t('settings.notifications.form.telegramTokenHelp') }}</small>
      </div>
       <div class="mb-3">
        <label for="telegram-chatid" class="form-label">{{ $t('settings.notifications.form.telegramChatId') }}</label>
        <input type="text" id="telegram-chatid" v-model="telegramConfig.chatId" class="form-control" required>
      </div>
       <div class="mb-3">
        <label for="telegram-message" class="form-label">{{ $t('settings.notifications.form.telegramMessageTemplate') }}</label>
        <textarea id="telegram-message" v-model="telegramConfig.messageTemplate" class="form-control" rows="3" :placeholder="$t('settings.notifications.form.telegramMessagePlaceholder')"></textarea>
         <small class="text-muted">{{ $t('settings.notifications.form.templateHelp') }}</small>
      </div>
       <!-- Test button moved below -->
    </div>

    <!-- Unified Test Button Area -->
    <div class="mb-3 text-center">
        <!-- Show button if editing OR if adding and required fields are filled -->
        <button
            v-if="isEditing || canTestUnsaved"
            type="button"
            @click="handleTestNotification"
            class="btn btn-outline-secondary btn-sm"
            :disabled="testingNotification"
        >
            <span v-if="testingNotification" class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
            {{ testingNotification ? $t('common.testing') : $t('settings.notifications.form.testButton') }}
        </button>
        <!-- Show hint if adding and required fields are NOT filled -->
        <small v-else class="d-block mt-2 text-muted">
            {{ $t('settings.notifications.form.fillRequiredToTest') }}
        </small>
        <!-- Show test result message if available -->
        <small v-if="testResult" :class="['d-block mt-2', testResult.success ? 'text-success' : 'text-danger']">
            {{ testResult.message }}
        </small>
    </div>


    <!-- Enabled Events -->
    <div class="mb-3">
        <label class="form-label">{{ $t('settings.notifications.form.enabledEvents') }}</label>
        <div class="row">
            <div v-for="event in allNotificationEvents" :key="event" class="col-md-4 col-sm-6">
                <div class="form-check">
                    <input
                        type="checkbox"
                        :id="'event-' + event"
                        :value="event"
                        v-model="formData.enabled_events"
                        class="form-check-input"
                    >
                    <label :for="'event-' + event" class="form-check-label">{{ getEventDisplayName(event) }}</label>
                </div>
            </div>
        </div>
    </div>


    <div class="d-flex justify-content-end">
      <button type="button" @click="handleCancel" class="btn btn-secondary me-2">{{ $t('common.cancel') }}</button>
      <button type="submit" class="btn btn-primary" :disabled="store.isLoading || !!headerError || testingNotification">
        {{ store.isLoading ? $t('common.saving') : $t('common.save') }}
      </button>
    </div>
     <div v-if="formError" class="alert alert-danger mt-3">{{ formError }}</div>
     <div v-if="testError" class="alert alert-danger mt-3">{{ testError }}</div>
  </form>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, PropType, nextTick } from 'vue';
import { useNotificationsStore } from '../stores/notifications.store';
import {
    NotificationSetting,
    NotificationSettingData,
    NotificationChannelType,
    NotificationEvent,
    WebhookConfig,
    EmailConfig, // Keep this, but we'll add SMTP fields
    TelegramConfig
} from '../types/server.types';
import { useI18n } from 'vue-i18n';

// Extend EmailConfig for SMTP fields
interface SmtpEmailConfig extends EmailConfig {
    smtpHost?: string;
    smtpPort?: number;
    smtpSecure?: boolean;
    smtpUser?: string;
    smtpPass?: string;
    from?: string; // Add 'from' address
}

const props = defineProps({
  initialData: {
    type: Object as PropType<NotificationSetting | null>,
    default: null,
  },
});

const emit = defineEmits(['save', 'cancel']);

const store = useNotificationsStore();
const { t } = useI18n();
const formError = ref<string | null>(null);
const headerError = ref<string | null>(null);
const testError = ref<string | null>(null);
const testingNotification = ref(false);
const testResult = ref<{ success: boolean; message: string } | null>(null);


const isEditing = computed(() => !!props.initialData?.id);

// Computed property to check if necessary fields for testing unsaved config are filled
const canTestUnsaved = computed(() => {
    if (isEditing.value) return true; // Always allow testing saved settings

    switch (formData.channel_type) {
        case 'webhook':
            return !!webhookConfig.value.url && !headerError.value;
        case 'email':
            return !!emailConfig.value.to && !!emailConfig.value.smtpHost && !!emailConfig.value.smtpPort && !!emailConfig.value.from;
        case 'telegram':
            return !!telegramConfig.value.botToken && !!telegramConfig.value.chatId;
        default:
            return false;
    }
});


// Define all possible events
const allNotificationEvents: NotificationEvent[] = [
    'LOGIN_SUCCESS', 'LOGIN_FAILURE', 'CONNECTION_ADDED', 'CONNECTION_UPDATED', 'CONNECTION_DELETED',
    'SETTINGS_UPDATED', 'PROXY_ADDED', 'PROXY_UPDATED', 'PROXY_DELETED', 'TAG_ADDED', 'TAG_UPDATED',
    'TAG_DELETED', 'API_KEY_ADDED', 'API_KEY_DELETED', 'PASSKEY_ADDED', 'PASSKEY_DELETED',
    'IP_BLACKLISTED', // Add the new event here
    'SERVER_ERROR'
];

// Reactive form data structure
const getDefaultFormData = (): Omit<NotificationSetting, 'id' | 'created_at' | 'updated_at' | 'config'> & { config: any } => ({
  name: '',
  enabled: true,
  channel_type: 'webhook',
  config: {}, // Will be populated based on channel_type
  enabled_events: ['LOGIN_FAILURE', 'SERVER_ERROR'], // Sensible defaults
});

const formData = reactive(getDefaultFormData());

// Specific config refs for easier v-model binding
const webhookConfig = ref<WebhookConfig>({ url: '', method: 'POST', headers: {}, bodyTemplate: '' });
const emailConfig = ref<SmtpEmailConfig>({ // Use extended type
    to: '',
    subjectTemplate: '',
    smtpHost: '',
    smtpPort: 587, // Default port
    smtpSecure: true, // Default to true (TLS)
    smtpUser: '',
    smtpPass: '',
    from: ''
});
const telegramConfig = ref<TelegramConfig>({ botToken: '', chatId: '', messageTemplate: '' });
const webhookHeadersString = ref('{}'); // For textarea binding

// Watch for initialData changes (when editing)
watch(() => props.initialData, (newData) => {
  if (newData) {
    Object.assign(formData, newData);
    // Populate specific config refs based on channel type
    if (newData.channel_type === 'webhook') {
        webhookConfig.value = { ...(newData.config as WebhookConfig) };
        webhookHeadersString.value = JSON.stringify(webhookConfig.value.headers || {}, null, 2);
    } else if (newData.channel_type === 'email') {
        // Ensure all fields are present, providing defaults if missing from saved config
        const savedConfig = newData.config as SmtpEmailConfig;
        emailConfig.value = {
            to: savedConfig.to || '',
            subjectTemplate: savedConfig.subjectTemplate || '',
            smtpHost: savedConfig.smtpHost || '',
            smtpPort: savedConfig.smtpPort || 587,
            smtpSecure: savedConfig.smtpSecure === undefined ? true : savedConfig.smtpSecure, // Default true if undefined
            smtpUser: savedConfig.smtpUser || '',
            smtpPass: savedConfig.smtpPass || '', // Password might not be sent back, handle appropriately
            from: savedConfig.from || ''
        };
    } else if (newData.channel_type === 'telegram') {
        telegramConfig.value = { ...(newData.config as TelegramConfig) };
    }
  } else {
    // Reset form if initialData becomes null (e.g., switching from edit to add)
    Object.assign(formData, getDefaultFormData());
    webhookConfig.value = { url: '', method: 'POST', headers: {}, bodyTemplate: '' };
    // Reset email config with defaults
    emailConfig.value = {
        to: '', subjectTemplate: '', smtpHost: '', smtpPort: 587, smtpSecure: true, smtpUser: '', smtpPass: '', from: ''
    };
    telegramConfig.value = { botToken: '', chatId: '', messageTemplate: '' };
    webhookHeadersString.value = '{}';
  }
   headerError.value = null; // Reset header error on data change
   testError.value = null; // Reset test error
   testResult.value = null; // Reset test result
   testingNotification.value = false; // Reset testing state
}, { immediate: true });

// Watch channel type change to reset specific config
watch(() => formData.channel_type, (newType, oldType) => {
    if (newType !== oldType && !isEditing.value) { // Only reset if not editing or type changes during add mode
        webhookConfig.value = { url: '', method: 'POST', headers: {}, bodyTemplate: '' };
        emailConfig.value = {
             to: '', subjectTemplate: '', smtpHost: '', smtpPort: 587, smtpSecure: true, smtpUser: '', smtpPass: '', from: ''
        };
        telegramConfig.value = { botToken: '', chatId: '', messageTemplate: '' };
        webhookHeadersString.value = '{}';
        headerError.value = null;
        testError.value = null;
        testResult.value = null;
        testingNotification.value = false;
    }
    // Always reset test state when type changes
    testError.value = null;
    testResult.value = null;
    testingNotification.value = false;
});

// Watch header string to validate JSON
watch(webhookHeadersString, (newVal) => {
    if (formData.channel_type !== 'webhook') return;
    try {
        const parsed = JSON.parse(newVal || '{}');
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            throw new Error('Headers must be a JSON object.');
        }
        webhookConfig.value.headers = parsed;
        headerError.value = null;
    } catch (e: any) {
        headerError.value = t('settings.notifications.form.invalidJson') + `: ${e.message}`;
    }
});

// Watch for changes in email config to clear previous test results
watch(emailConfig, () => {
    testResult.value = null;
    testError.value = null;
}, { deep: true });


const getEventDisplayName = (event: NotificationEvent): string => {
    // Use i18n key, fallback to formatted name if key not found
    const i18nKey = `settings.notifications.events.${event}`;
    const translated = t(i18nKey);
    // If translation returns the key itself, it means translation is missing
    if (translated === i18nKey) {
        console.warn(`Missing translation for notification event: ${i18nKey}`);
        return event.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase()); // Fallback
    }
    return translated;
};

const handleSubmit = async () => {
  formError.value = null;
  if (headerError.value) return; // Don't submit if headers are invalid

  // Assign the correct config based on channel type
  if (formData.channel_type === 'webhook') {
    formData.config = webhookConfig.value;
  } else if (formData.channel_type === 'email') {
    formData.config = emailConfig.value;
  } else if (formData.channel_type === 'telegram') {
    formData.config = telegramConfig.value;
  }

  let result: NotificationSetting | null = null;
  if (isEditing.value && props.initialData?.id) {
    result = await store.updateSetting(props.initialData.id, formData);
  } else {
    result = await store.addSetting(formData);
  }

  if (result) {
    emit('save', result);
  } else {
    formError.value = store.error || t('common.errorOccurred');
  }
};

const handleCancel = () => {
  emit('cancel');
};

const handleTestNotification = async () => {
    // Allow testing if editing OR if adding and required fields are filled
    if (!isEditing.value && !canTestUnsaved.value) return;

    testingNotification.value = true;
    testError.value = null;
    testResult.value = null;

    let testConfig: any = {};
    // Prepare the config based on the current channel type
    switch (formData.channel_type) {
        case 'webhook':
            testConfig = { ...webhookConfig.value };
            // Ensure headers are parsed correctly before sending
            try {
                 testConfig.headers = JSON.parse(webhookHeadersString.value || '{}');
                 if (typeof testConfig.headers !== 'object' || testConfig.headers === null || Array.isArray(testConfig.headers)) {
                    throw new Error('Headers must be a JSON object.');
                 }
            } catch (e: any) {
                 testResult.value = { success: false, message: t('settings.notifications.form.invalidJson') + `: ${e.message}` };
                 testingNotification.value = false;
                 return;
            }
            break;
        case 'email':
            testConfig = { ...emailConfig.value };
            break;
        case 'telegram':
            testConfig = { ...telegramConfig.value };
            break;
        default:
            console.error("Unknown channel type for testing:", formData.channel_type);
            testResult.value = { success: false, message: "未知渠道类型无法测试" };
            testingNotification.value = false;
            return;
    }

    try {
        let result: { success: boolean; message: string };
        if (isEditing.value && props.initialData?.id) {
            // Test existing setting
            result = await store.testSetting(props.initialData.id, testConfig);
        } else {
            // Test unsaved setting
            result = await store.testUnsavedSetting(formData.channel_type, testConfig);
        }
        testResult.value = { success: true, message: result.message || t('settings.notifications.form.testSuccess') };
    } catch (error: any) {
        console.error("Test notification error:", error);
        const message = error?.response?.data?.message || error.message || t('settings.notifications.form.testFailed');
        testResult.value = { success: false, message: message };
        // Optionally set testError if you want a separate display area for errors vs results
        // testError.value = message;
    } finally {
        testingNotification.value = false;
        // Automatically clear the result message after a few seconds
        await nextTick(); // Ensure DOM is updated before setting timeout
        setTimeout(() => {
            testResult.value = null;
        }, 5000); // Clear after 5 seconds
    }
};

</script>

<style scoped>
.notification-setting-form {
  padding: var(--base-padding);
  background-color: var(--app-bg-color); /* Use app background */
  border: 1px solid var(--border-color); /* Add border consistent with theme */
  border-radius: 4px;
  color: var(--text-color);
  /* Removed box-shadow for a flatter look, can be added back if desired */
}

h3 {
  color: var(--text-color);
  margin-bottom: calc(var(--base-margin) * 2);
  padding-bottom: var(--base-margin);
  border-bottom: 1px solid var(--border-color);
  font-size: 1.25rem; /* Slightly larger heading */
}

.mb-3 { /* Bootstrap margin bottom class */
  margin-bottom: calc(var(--base-margin) * 1.5) !important; /* Use variable, increase slightly */
}

.form-label {
  display: block;
  margin-bottom: calc(var(--base-margin) / 2);
  color: var(--text-color);
  font-weight: bold;
}

.form-control, .form-select, .form-check-input {
  background-color: var(--app-bg-color);
  color: var(--text-color);
  border: 1px solid var(--border-color);
  padding: 0.5rem 0.75rem;
  border-radius: 4px;
  width: 100%; /* Ensure inputs take full width */
  box-sizing: border-box; /* Include padding and border in element's total width */
}
.form-control:focus, .form-select:focus {
    border-color: var(--link-active-color); /* Highlight focus */
    outline: 0;
    box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25); /* Optional focus shadow */
}

textarea.form-control {
    min-height: 80px; /* Give textareas more space */
}

.form-check {
  display: flex; /* Align checkbox and label */
  align-items: center;
  padding-left: 0; /* Reset Bootstrap padding */
}
.form-check-input {
  width: auto; /* Don't force checkbox to full width */
  margin-right: 0.5rem; /* Space between checkbox and label */
  margin-top: 0; /* Align vertically */
  border: 1px solid var(--border-color); /* Ensure border is visible */
}
.form-check-label {
  margin-bottom: 0; /* Reset label margin */
  font-weight: normal; /* Normal weight for checkbox labels */
}

.text-muted {
  color: var(--text-color-secondary);
  font-size: 0.85em;
  display: block; /* Ensure it takes its own line */
  margin-top: calc(var(--base-margin) / 2);
}
.text-danger {
    color: #dc3545; /* Keep specific danger color */
}
.text-success {
    color: #198754; /* Keep specific success color */
}

.channel-config {
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: var(--base-padding);
  margin-top: var(--base-margin);
  background-color: var(--header-bg-color); /* Slightly different background */
}

.channel-config h4 {
    font-size: 1rem;
    font-weight: bold;
    margin-bottom: var(--base-margin);
    color: var(--text-color);
    padding-bottom: calc(var(--base-margin) / 2);
    border-bottom: 1px dashed var(--border-color); /* Dashed separator */
}

/* Button styling (reuse from NotificationSettings or define globally) */
.btn {
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
    font-weight: bold;
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
.btn-primary:disabled {
    opacity: 0.65;
    cursor: not-allowed;
}
.btn-secondary {
    background-color: var(--text-color-secondary);
    border: 1px solid var(--text-color-secondary);
    color: var(--app-bg-color);
}
.btn-secondary:hover {
    background-color: var(--text-color);
    border-color: var(--text-color);
    color: var(--app-bg-color);
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
.btn-sm {
    padding: 0.25rem 0.5rem;
    font-size: 0.875rem;
}

.spinner-border-sm {
    width: 1rem;
    height: 1rem;
    border-width: 0.2em;
    vertical-align: -0.125em; /* Align spinner better with text */
}

.alert { /* General alert styling */
    padding: var(--base-padding);
    margin-top: var(--base-margin);
    border: 1px solid transparent;
    border-radius: 4px;
}
.alert-danger {
    color: #842029;
    background-color: #f8d7da;
    border-color: #f5c2c7;
}
</style>

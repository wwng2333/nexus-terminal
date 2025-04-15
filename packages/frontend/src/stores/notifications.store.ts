import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import axios from 'axios'; // Assuming axios is globally available or installed
import { NotificationSetting, NotificationSettingData, NotificationChannelType } from '../types/server.types'; // Import NotificationChannelType

export const useNotificationsStore = defineStore('notifications', () => {
    const settings = ref<NotificationSetting[]>([]);
    const isLoading = ref(false);
    const error = ref<string | null>(null);

    const fetchSettings = async () => {
        isLoading.value = true;
        error.value = null;
        try {
            const response = await axios.get<NotificationSetting[]>('/api/v1/notifications');
            settings.value = response.data;
        } catch (err: any) {
            console.error('Error fetching notification settings:', err);
            error.value = err.response?.data?.message || '获取通知设置失败';
            settings.value = []; // Clear settings on error
        } finally {
            isLoading.value = false;
        }
    };

    const addSetting = async (settingData: NotificationSettingData): Promise<NotificationSetting | null> => {
        isLoading.value = true;
        error.value = null;
        try {
            const response = await axios.post<NotificationSetting>('/api/v1/notifications', settingData);
            settings.value.push(response.data);
            return response.data;
        } catch (err: any) {
            console.error('Error adding notification setting:', err);
            error.value = err.response?.data?.message || '添加通知设置失败';
            return null;
        } finally {
            isLoading.value = false;
        }
    };

    const updateSetting = async (id: number, settingData: Partial<NotificationSettingData>): Promise<NotificationSetting | null> => {
        isLoading.value = true;
        error.value = null;
        try {
            const response = await axios.put<NotificationSetting>(`/api/v1/notifications/${id}`, settingData);
            const index = settings.value.findIndex(s => s.id === id);
            if (index !== -1) {
                settings.value[index] = response.data;
            } else {
                // If not found locally, maybe fetch again or just add it
                settings.value.push(response.data);
            }
            return response.data;
        } catch (err: any) {
            console.error(`Error updating notification setting ${id}:`, err);
            error.value = err.response?.data?.message || '更新通知设置失败';
            return null;
        } finally {
            isLoading.value = false;
        }
    };

    const deleteSetting = async (id: number): Promise<boolean> => {
        isLoading.value = true;
        error.value = null;
        try {
            await axios.delete(`/api/v1/notifications/${id}`);
            settings.value = settings.value.filter(s => s.id !== id);
            return true;
        } catch (err: any) {
            console.error(`Error deleting notification setting ${id}:`, err);
            error.value = err.response?.data?.message || '删除通知设置失败';
            return false;
        } finally {
            isLoading.value = false;
        }
    };

    const testSetting = async (id: number, config: any): Promise<{ success: boolean; message: string }> => {
        // Note: We don't set isLoading here as it might interfere with the main form submission state.
        // The component handles its own 'testingNotification' state.
        error.value = null; // Clear previous general errors
        try {
            // Send the config to test in the request body
            const response = await axios.post<{ message: string }>(`/api/v1/notifications/${id}/test`, { config });
            return { success: true, message: response.data.message || '测试成功' };
        } catch (err: any) {
            console.error(`Error testing notification setting ${id}:`, err);
            // Don't set the main 'error' ref here, let the component handle test-specific errors/results.
            // Throw the error so the component's catch block can handle it.
            throw err; // Re-throw the error to be caught in the component
        }
        // No finally block needed here as loading state is managed in the component
    };

    // Test an unsaved setting configuration
    const testUnsavedSetting = async (channelType: NotificationChannelType, config: any): Promise<{ success: boolean; message: string }> => {
        error.value = null;
        try {
            // Send the channel type and config in the request body
            const response = await axios.post<{ message: string }>(`/api/v1/notifications/test-unsaved`, { channel_type: channelType, config });
            return { success: true, message: response.data.message || '测试成功' };
        } catch (err: any) {
            console.error(`Error testing unsaved notification setting:`, err);
            throw err; // Re-throw the error to be caught in the component
        }
    };


    // Computed property to get settings by type (example)
    const webhookSettings = computed(() => settings.value.filter(s => s.channel_type === 'webhook'));
    const emailSettings = computed(() => settings.value.filter(s => s.channel_type === 'email'));
    const telegramSettings = computed(() => settings.value.filter(s => s.channel_type === 'telegram'));

    return {
        settings,
        isLoading,
        error,
        fetchSettings,
        addSetting,
        updateSetting,
        deleteSetting,
        testSetting,
        testUnsavedSetting, // Add the new function here
        webhookSettings,
        emailSettings,
        telegramSettings,
    };
});

<template>
  <div class="notifications-view">
    <!-- <h1>{{ $t('nav.notifications') }}</h1> --> <!-- Add nav.notifications to i18n later -->
    <h1>通知管理</h1> <!-- Temporary title -->
    <NotificationSettings />
  </div>
</template>

<script setup lang="ts">
import NotificationSettings from '../components/NotificationSettings.vue';
</script>

<style scoped>
.notifications-view {
  padding: var(--base-padding, 20px); /* 使用变量 */
  color: var(--text-color);
  background-color: var(--app-bg-color);
}
</style>

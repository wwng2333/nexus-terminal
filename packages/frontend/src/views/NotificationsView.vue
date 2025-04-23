<template>
  <div class="p-4 bg-background text-foreground"> <!-- Outer container with padding -->
    <div class="max-w-6xl mx-auto"> <!-- Inner container for max-width and centering -->
      <!-- Removed temporary h1 title -->
      <NotificationSettings />
    </div>
  </div>
</template>

<script setup lang="ts">
import NotificationSettings from '../components/NotificationSettings.vue';
</script>

<style scoped>
/* Remove scoped styles as they are now handled by Tailwind utility classes */
</style>

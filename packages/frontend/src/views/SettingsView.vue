
<template>
  <div class="p-4 bg-background text-foreground min-h-screen"> <!-- Outer container -->
    <div class="max-w-7xl mx-auto"> <!-- Inner container for max-width -->
      <h1 class="text-2xl font-semibold text-foreground mb-6 pb-3 border-b border-border"> <!-- Main Title -->
        {{ $t('settings.title') }}
      </h1>

      <!-- General Settings Loading/Error -->
      <div v-if="settingsLoading" class="p-4 text-center text-text-secondary italic"> <!-- Loading state -->
        {{ $t('common.loading') }}
      </div>
      <div v-if="settingsError" class="p-4 mb-4 border-l-4 border-error bg-error/10 text-error rounded"> <!-- Error state -->
        {{ settingsError }}
      </div>

      <!-- Settings Sections Grid -->
      <div v-if="!settingsLoading && !settingsError" class="grid grid-cols-1 lg:grid-cols-3 gap-6">

        <!-- Column 1: Security -->
        <div class="lg:col-span-2 space-y-6"> <!-- Security takes 2 columns on large screens -->
          <div class="bg-background border border-border rounded-lg shadow-sm overflow-hidden">
            <h2 class="text-lg font-semibold text-foreground px-6 py-4 border-b border-border bg-header/50">{{ $t('settings.category.security') }}</h2>
            <div class="p-6 space-y-6">
              <!-- Change Password -->
              <div class="settings-section-content">
                <h3 class="text-base font-semibold text-foreground mb-3">{{ $t('settings.changePassword.title') }}</h3>
                <form @submit.prevent="handleChangePassword" class="space-y-4">
                  <div>
                    <label for="currentPassword" class="block text-sm font-medium text-text-secondary mb-1">{{ $t('settings.changePassword.currentPassword') }}</label>
                    <input type="password" id="currentPassword" v-model="currentPassword" required
                           class="w-full px-3 py-2 border border-border rounded-md shadow-sm bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary">
                  </div>
                  <div>
                    <label for="newPassword" class="block text-sm font-medium text-text-secondary mb-1">{{ $t('settings.changePassword.newPassword') }}</label>
                    <input type="password" id="newPassword" v-model="newPassword" required
                           class="w-full px-3 py-2 border border-border rounded-md shadow-sm bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary">
                  </div>
                  <div>
                    <label for="confirmPassword" class="block text-sm font-medium text-text-secondary mb-1">{{ $t('settings.changePassword.confirmPassword') }}</label>
                    <input type="password" id="confirmPassword" v-model="confirmPassword" required
                           class="w-full px-3 py-2 border border-border rounded-md shadow-sm bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary">
                  </div>
                  <div class="flex items-center justify-between">
                    <button type="submit" :disabled="changePasswordLoading"
                            class="px-4 py-2 bg-button text-button-text rounded-md shadow-sm hover:bg-button-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed transition duration-150 ease-in-out text-sm font-medium">
                      {{ changePasswordLoading ? $t('common.loading') : $t('settings.changePassword.submit') }}
                    </button>
                    <p v-if="changePasswordMessage" :class="['text-sm', changePasswordSuccess ? 'text-success' : 'text-error']">{{ changePasswordMessage }}</p>
                  </div>
                </form>
              </div>
              <hr class="border-border/50">
              <!-- Passkey -->
              <div class="settings-section-content">
                 <h3 class="text-base font-semibold text-foreground mb-3">{{ $t('settings.passkey.title') }}</h3>
                 <p class="text-sm text-text-secondary mb-4">{{ $t('settings.passkey.description') }}</p>
                 <div class="mb-4">
                   <label for="passkey-name" class="block text-sm font-medium text-text-secondary mb-1">{{ $t('settings.passkey.nameLabel') }}:</label>
                   <input type="text" id="passkey-name" v-model="passkeyName" :placeholder="$t('settings.passkey.namePlaceholder')" required
                          class="w-full px-3 py-2 border border-border rounded-md shadow-sm bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary">
                 </div>
                 <div class="flex items-center justify-between">
                    <button @click="handleRegisterPasskey"
                            class="px-4 py-2 bg-button text-button-text rounded-md shadow-sm hover:bg-button-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed transition duration-150 ease-in-out text-sm font-medium">
                      {{ $t('settings.passkey.registerButton') }}
                    </button>
                    <p v-if="passkeyMessage" class="text-sm text-success">{{ passkeyMessage }}</p>
                    <p v-if="passkeyError" class="text-sm text-error">{{ passkeyError }}</p>
                 </div>
              </div>
              <hr class="border-border/50">
              <!-- 2FA -->
              <div class="settings-section-content">
                 <h3 class="text-base font-semibold text-foreground mb-3">{{ $t('settings.twoFactor.title') }}</h3>
                 <div v-if="twoFactorEnabled">
                   <p class="p-3 mb-3 border-l-4 border-success bg-success/10 text-success text-sm rounded">{{ $t('settings.twoFactor.status.enabled') }}</p>
                   <form @submit.prevent="handleDisable2FA" class="space-y-4">
                     <div>
                       <label for="disablePassword" class="block text-sm font-medium text-text-secondary mb-1">{{ $t('settings.twoFactor.disable.passwordPrompt') }}</label>
                       <input type="password" id="disablePassword" v-model="disablePassword" required
                              class="w-full px-3 py-2 border border-border rounded-md shadow-sm bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary">
                     </div>
                     <div class="flex items-center justify-between">
                        <button type="submit" :disabled="twoFactorLoading"
                                class="px-4 py-2 bg-error text-white rounded-md shadow-sm hover:bg-error/80 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-error disabled:opacity-50 disabled:cursor-not-allowed transition duration-150 ease-in-out text-sm font-medium">
                          {{ twoFactorLoading ? $t('common.loading') : $t('settings.twoFactor.disable.button') }}
                        </button>
                     </div>
                   </form>
                 </div>
                 <div v-else>
                   <p class="text-sm text-text-secondary mb-4">{{ $t('settings.twoFactor.status.disabled') }}</p>
                   <button v-if="!isSettingUp2FA" @click="handleSetup2FA" :disabled="twoFactorLoading"
                           class="px-4 py-2 bg-button text-button-text rounded-md shadow-sm hover:bg-button-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed transition duration-150 ease-in-out text-sm font-medium">
                     {{ twoFactorLoading ? $t('common.loading') : $t('settings.twoFactor.enable.button') }}
                   </button>
                   <div v-if="isSettingUp2FA && setupData" class="mt-4 space-y-4 p-4 border border-border rounded-md bg-header/30">
                     <p class="text-sm text-text-secondary">{{ $t('settings.twoFactor.setup.scanQrCode') }}</p>
                     <img :src="setupData.qrCodeUrl" alt="QR Code" class="block mx-auto max-w-[180px] border border-border p-1 bg-white rounded">
                     <p class="text-sm text-text-secondary">{{ $t('settings.twoFactor.setup.orEnterSecret') }} <code class="bg-header/50 p-1 px-2 border border-border/50 rounded font-mono text-sm">{{ setupData.secret }}</code></p>
                     <form @submit.prevent="handleVerifyAndActivate2FA" class="space-y-4">
                       <div>
                         <label for="verificationCode" class="block text-sm font-medium text-text-secondary mb-1">{{ $t('settings.twoFactor.setup.enterCode') }}</label>
                         <input type="text" id="verificationCode" v-model="verificationCode" required pattern="\d{6}" title="请输入 6 位数字验证码"
                                class="w-full px-3 py-2 border border-border rounded-md shadow-sm bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary">
                       </div>
                       <div class="flex items-center space-x-3">
                         <button type="submit" :disabled="twoFactorLoading"
                                 class="px-4 py-2 bg-button text-button-text rounded-md shadow-sm hover:bg-button-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed transition duration-150 ease-in-out text-sm font-medium">
                           {{ twoFactorLoading ? $t('common.loading') : $t('settings.twoFactor.setup.verifyButton') }}
                         </button>
                         <button type="button" @click="cancelSetup" :disabled="twoFactorLoading"
                                 class="px-4 py-2 bg-transparent text-text-secondary border border-border rounded-md shadow-sm hover:bg-border hover:text-foreground focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed transition duration-150 ease-in-out text-sm font-medium">
                           {{ $t('common.cancel') }}
                         </button>
                       </div>
                     </form>
                   </div>
                 </div>
                 <p v-if="twoFactorMessage" :class="['mt-3 text-sm', twoFactorSuccess ? 'text-success' : 'text-error']">{{ twoFactorMessage }}</p>
              </div>
              <hr class="border-border/50">
              <!-- IP Whitelist -->
              <div class="settings-section-content">
                 <h3 class="text-base font-semibold text-foreground mb-3">{{ $t('settings.ipWhitelist.title') }}</h3>
                 <p class="text-sm text-text-secondary mb-4">{{ $t('settings.ipWhitelist.description') }}</p>
                 <form @submit.prevent="handleUpdateIpWhitelist" class="space-y-4">
                   <div>
                     <label for="ipWhitelist" class="block text-sm font-medium text-text-secondary mb-1">{{ $t('settings.ipWhitelist.label') }}</label>
                     <textarea id="ipWhitelist" v-model="ipWhitelistInput" rows="4"
                               class="w-full px-3 py-2 border border-border rounded-md shadow-sm bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary font-mono text-sm"></textarea>
                     <small class="block mt-1 text-xs text-text-secondary">{{ $t('settings.ipWhitelist.hint') }}</small>
                   </div>
                   <div class="flex items-center justify-between">
                      <button type="submit" :disabled="ipWhitelistLoading"
                              class="px-4 py-2 bg-button text-button-text rounded-md shadow-sm hover:bg-button-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed transition duration-150 ease-in-out text-sm font-medium">
                        {{ ipWhitelistLoading ? $t('common.saving') : $t('settings.ipWhitelist.saveButton') }}
                      </button>
                      <p v-if="ipWhitelistMessage" :class="['text-sm', ipWhitelistSuccess ? 'text-success' : 'text-error']">{{ ipWhitelistMessage }}</p>
                   </div>
                 </form>
              </div>
            </div>
          </div>

          <!-- IP Blacklist (Full Width within Security Column) -->
           <div class="bg-background border border-border rounded-lg shadow-sm overflow-hidden">
             <h2 class="text-lg font-semibold text-foreground px-6 py-4 border-b border-border bg-header/50">IP 黑名单管理</h2>
             <div class="p-6 space-y-6">
                <p class="text-sm text-text-secondary">配置登录失败次数限制和自动封禁时长。本地地址 (127.0.0.1, ::1) 不会被封禁。</p>
                <!-- Blacklist config form -->
                <form @submit.prevent="handleUpdateBlacklistSettings" class="flex flex-wrap items-end gap-4 pt-4 border-t border-border/50">
                   <div class="flex-grow min-w-[150px]">
                     <label for="maxLoginAttempts" class="block text-sm font-medium text-text-secondary mb-1">最大失败次数:</label>
                     <input type="number" id="maxLoginAttempts" v-model="blacklistSettingsForm.maxLoginAttempts" min="1" required
                            class="w-full px-3 py-2 border border-border rounded-md shadow-sm bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary">
                   </div>
                   <div class="flex-grow min-w-[150px]">
                     <label for="loginBanDuration" class="block text-sm font-medium text-text-secondary mb-1">封禁时长 (秒):</label>
                     <input type="number" id="loginBanDuration" v-model="blacklistSettingsForm.loginBanDuration" min="1" required
                            class="w-full px-3 py-2 border border-border rounded-md shadow-sm bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary">
                   </div>
                   <div class="flex-shrink-0">
                      <button type="submit" :disabled="blacklistSettingsLoading"
                              class="px-4 py-2 bg-button text-button-text rounded-md shadow-sm hover:bg-button-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed transition duration-150 ease-in-out text-sm font-medium">
                        {{ blacklistSettingsLoading ? $t('common.saving') : '保存配置' }}
                      </button>
                   </div>
                   <p v-if="blacklistSettingsMessage" :class="['w-full mt-2 text-sm', blacklistSettingsSuccess ? 'text-success' : 'text-error']">{{ blacklistSettingsMessage }}</p>
                </form>
                <hr class="border-border/50">
                <!-- Blacklist table -->
                <h3 class="text-base font-semibold text-foreground">当前已封禁的 IP 地址</h3>
                <div v-if="ipBlacklist.loading" class="p-4 text-center text-text-secondary italic">正在加载黑名单...</div>
                <div v-if="ipBlacklist.error" class="p-3 border-l-4 border-error bg-error/10 text-error text-sm rounded">{{ ipBlacklist.error }}</div>
                <div v-if="!ipBlacklist.loading && !ipBlacklist.error">
                  <div v-if="ipBlacklist.entries.length > 0" class="overflow-x-auto border border-border rounded-lg shadow-sm bg-background">
                    <table class="min-w-full divide-y divide-border text-sm">
                       <thead class="bg-header">
                         <tr>
                           <th scope="col" class="px-4 py-2 text-left font-medium text-text-secondary tracking-wider whitespace-nowrap">IP 地址</th>
                           <th scope="col" class="px-4 py-2 text-left font-medium text-text-secondary tracking-wider whitespace-nowrap">失败次数</th>
                           <th scope="col" class="px-4 py-2 text-left font-medium text-text-secondary tracking-wider whitespace-nowrap">最后尝试时间</th>
                           <th scope="col" class="px-4 py-2 text-left font-medium text-text-secondary tracking-wider whitespace-nowrap">封禁截止时间</th>
                           <th scope="col" class="px-4 py-2 text-left font-medium text-text-secondary tracking-wider whitespace-nowrap">操作</th>
                         </tr>
                       </thead>
                       <tbody class="divide-y divide-border">
                         <tr v-for="entry in ipBlacklist.entries" :key="entry.ip" class="hover:bg-header/50">
                           <td class="px-4 py-2 whitespace-nowrap">{{ entry.ip }}</td>
                           <td class="px-4 py-2 whitespace-nowrap">{{ entry.attempts }}</td>
                           <td class="px-4 py-2 whitespace-nowrap">{{ new Date(entry.last_attempt_at * 1000).toLocaleString() }}</td>
                           <td class="px-4 py-2 whitespace-nowrap">{{ entry.blocked_until ? new Date(entry.blocked_until * 1000).toLocaleString() : 'N/A' }}</td>
                           <td class="px-4 py-2 whitespace-nowrap">
                             <button
                               @click="handleDeleteIp(entry.ip)"
                               :disabled="blacklistDeleteLoading && blacklistToDeleteIp === entry.ip"
                               class="px-2 py-1 bg-error text-white rounded text-xs font-medium hover:bg-error/80 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-error disabled:opacity-50 disabled:cursor-not-allowed transition duration-150 ease-in-out"
                             >
                               {{ (blacklistDeleteLoading && blacklistToDeleteIp === entry.ip) ? '删除中...' : '移除' }}
                             </button>
                           </td>
                         </tr>
                       </tbody>
                    </table>
                  </div>
                  <p v-else class="p-4 text-center text-text-secondary italic">当前没有 IP 地址在黑名单中。</p>
                   <p v-if="blacklistDeleteError" class="mt-3 text-sm text-error">{{ blacklistDeleteError }}</p>
                </div>
             </div>
           </div>
        </div>

        <!-- Column 2: Appearance, Workspace, System -->
        <div class="lg:col-span-1 space-y-6">
          <!-- Appearance -->
          <div class="bg-background border border-border rounded-lg shadow-sm overflow-hidden">
            <h2 class="text-lg font-semibold text-foreground px-6 py-4 border-b border-border bg-header/50">{{ $t('settings.category.appearance') }}</h2>
            <div class="p-6 space-y-6">
              <!-- Language -->
              <div class="settings-section-content">
                 <h3 class="text-base font-semibold text-foreground mb-3">{{ $t('settings.language.title') }}</h3>
                 <form @submit.prevent="handleUpdateLanguage" class="space-y-4">
                   <div>
                     <label for="languageSelect" class="block text-sm font-medium text-text-secondary mb-1">{{ $t('settings.language.selectLabel') }}</label>
                     <select id="languageSelect" v-model="selectedLanguage"
                             class="w-full px-3 py-2 border border-border rounded-md shadow-sm bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary appearance-none bg-no-repeat bg-right pr-8"
                             style="background-image: url('data:image/svg+xml,%3csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 16 16\'%3e%3cpath fill=\'none\' stroke=\'%236c757d\' stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M2 5l6 6 6-6\'/%3e%3c/svg%3e'); background-position: right 0.75rem center; background-size: 16px 12px;">
                       <option value="en">English</option>
                       <option value="zh">中文</option>
                     </select>
                   </div>
                   <div class="flex items-center justify-between">
                      <button type="submit" :disabled="languageLoading"
                              class="px-4 py-2 bg-button text-button-text rounded-md shadow-sm hover:bg-button-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed transition duration-150 ease-in-out text-sm font-medium">
                        {{ languageLoading ? $t('common.saving') : $t('settings.language.saveButton') }}
                      </button>
                      <p v-if="languageMessage" :class="['text-sm', languageSuccess ? 'text-success' : 'text-error']">{{ languageMessage }}</p>
                   </div>
                 </form>
              </div>
              <hr class="border-border/50">
              <!-- Style Customizer -->
              <div class="settings-section-content">
                 <h3 class="text-base font-semibold text-foreground mb-3">{{ $t('settings.appearance.title') }}</h3>
                 <p class="text-sm text-text-secondary mb-4">{{ $t('settings.appearance.description') }}</p>
                 <button @click="openStyleCustomizer"
                         class="px-4 py-2 bg-button text-button-text rounded-md shadow-sm hover:bg-button-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed transition duration-150 ease-in-out text-sm font-medium">
                   {{ t('settings.appearance.customizeButton') }}
                 </button>
              </div>
            </div>
          </div>

          <!-- Workspace -->
          <div class="bg-background border border-border rounded-lg shadow-sm overflow-hidden">
            <h2 class="text-lg font-semibold text-foreground px-6 py-4 border-b border-border bg-header/50">{{ $t('settings.workspace.title') }}</h2>
            <div class="p-6 space-y-6">
              <!-- Popup Editor -->
              <div class="settings-section-content">
                 <h3 class="text-base font-semibold text-foreground mb-3">{{ $t('settings.popupEditor.title') }}</h3>
                 <form @submit.prevent="handleUpdatePopupEditorSetting" class="space-y-4">
                     <div class="flex items-center">
                         <input type="checkbox" id="showPopupEditor" v-model="popupEditorEnabled"
                                class="h-4 w-4 rounded border-border text-primary focus:ring-primary mr-2 cursor-pointer">
                         <label for="showPopupEditor" class="text-sm text-foreground cursor-pointer select-none">{{ $t('settings.popupEditor.enableLabel') }}</label>
                     </div>
                     <div class="flex items-center justify-between">
                        <button type="submit" :disabled="popupEditorLoading"
                                class="px-4 py-2 bg-button text-button-text rounded-md shadow-sm hover:bg-button-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed transition duration-150 ease-in-out text-sm font-medium">
                          {{ popupEditorLoading ? $t('common.saving') : $t('settings.popupEditor.saveButton') }}
                        </button>
                        <p v-if="popupEditorMessage" :class="['text-sm', popupEditorSuccess ? 'text-success' : 'text-error']">{{ popupEditorMessage }}</p>
                     </div>
                 </form>
              </div>
              <hr class="border-border/50">
              <!-- Share Tabs -->
              <div class="settings-section-content">
                 <h3 class="text-base font-semibold text-foreground mb-3">{{ $t('settings.shareEditorTabs.title') }}</h3>
                 <form @submit.prevent="handleUpdateShareTabsSetting" class="space-y-4">
                     <div class="flex items-center">
                         <input type="checkbox" id="shareEditorTabs" v-model="shareTabsEnabled"
                                class="h-4 w-4 rounded border-border text-primary focus:ring-primary mr-2 cursor-pointer">
                         <label for="shareEditorTabs" class="text-sm text-foreground cursor-pointer select-none">{{ $t('settings.shareEditorTabs.enableLabel') }}</label>
                     </div>
                     <p class="text-xs text-text-secondary mt-1">{{ $t('settings.shareEditorTabs.description') }}</p>
                     <div class="flex items-center justify-between">
                        <button type="submit" :disabled="shareTabsLoading"
                                class="px-4 py-2 bg-button text-button-text rounded-md shadow-sm hover:bg-button-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed transition duration-150 ease-in-out text-sm font-medium">
                          {{ shareTabsLoading ? $t('common.saving') : $t('settings.shareEditorTabs.saveButton') }}
                        </button>
                        <p v-if="shareTabsMessage" :class="['text-sm', shareTabsSuccess ? 'text-success' : 'text-error']">{{ shareTabsMessage }}</p>
                     </div>
                 </form>
              </div>
              <hr class="border-border/50">
              <!-- Auto Copy -->
              <div class="settings-section-content">
                 <h3 class="text-base font-semibold text-foreground mb-3">{{ $t('settings.autoCopyOnSelect.title') }}</h3>
                 <form @submit.prevent="handleUpdateAutoCopySetting" class="space-y-4">
                     <div class="flex items-center">
                         <input type="checkbox" id="autoCopyOnSelect" v-model="autoCopyEnabled"
                                class="h-4 w-4 rounded border-border text-primary focus:ring-primary mr-2 cursor-pointer">
                         <label for="autoCopyOnSelect" class="text-sm text-foreground cursor-pointer select-none">{{ $t('settings.autoCopyOnSelect.enableLabel') }}</label>
                     </div>
                     <div class="flex items-center justify-between">
                        <button type="submit" :disabled="autoCopyLoading"
                                class="px-4 py-2 bg-button text-button-text rounded-md shadow-sm hover:bg-button-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed transition duration-150 ease-in-out text-sm font-medium">
                          {{ autoCopyLoading ? $t('common.saving') : $t('settings.autoCopyOnSelect.saveButton') }}
                        </button>
                        <p v-if="autoCopyMessage" :class="['text-sm', autoCopySuccess ? 'text-success' : 'text-error']">{{ autoCopyMessage }}</p>
                     </div>
                 </form>
              </div>
              <hr class="border-border/50">
              <!-- Persistent Sidebar -->
              <div class="settings-section-content">
                 <h3 class="text-base font-semibold text-foreground mb-3">{{ $t('settings.workspace.sidebarPersistentTitle') }}</h3>
                 <form @submit.prevent="handleUpdateWorkspaceSidebarSetting" class="space-y-4">
                     <div class="flex items-center">
                         <input type="checkbox" id="workspaceSidebarPersistent" v-model="workspaceSidebarPersistentEnabled"
                                class="h-4 w-4 rounded border-border text-primary focus:ring-primary mr-2 cursor-pointer">
                         <label for="workspaceSidebarPersistent" class="text-sm text-foreground cursor-pointer select-none">{{ $t('settings.workspace.sidebarPersistentLabel') }}</label>
                     </div>
                     <p class="text-xs text-text-secondary mt-1">{{ $t('settings.workspace.sidebarPersistentDescription') }}</p>
                     <div class="flex items-center justify-between">
                        <button type="submit" :disabled="workspaceSidebarPersistentLoading"
                                class="px-4 py-2 bg-button text-button-text rounded-md shadow-sm hover:bg-button-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed transition duration-150 ease-in-out text-sm font-medium">
                          {{ workspaceSidebarPersistentLoading ? $t('common.saving') : $t('common.save') }}
                        </button>
                        <p v-if="workspaceSidebarPersistentMessage" :class="['text-sm', workspaceSidebarPersistentSuccess ? 'text-success' : 'text-error']">{{ workspaceSidebarPersistentMessage }}</p>
                     </div>
                 </form>
              </div>
            </div>
          </div>

          <!-- System -->
          <div class="bg-background border border-border rounded-lg shadow-sm overflow-hidden">
            <h2 class="text-lg font-semibold text-foreground px-6 py-4 border-b border-border bg-header/50">{{ $t('settings.category.system') }}</h2>
            <div class="p-6 space-y-6">
              <!-- Docker -->
              <div class="settings-section-content">
                 <h3 class="text-base font-semibold text-foreground mb-3">{{ t('settings.docker.title') }}</h3>
                 <form @submit.prevent="handleUpdateDockerSettings" class="space-y-4">
                   <div>
                     <label for="dockerInterval" class="block text-sm font-medium text-text-secondary mb-1">{{ t('settings.docker.refreshIntervalLabel') }}</label>
                     <input type="number" id="dockerInterval" v-model.number="dockerInterval" min="1" step="1" required
                            class="w-full px-3 py-2 border border-border rounded-md shadow-sm bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary">
                      <small class="block mt-1 text-xs text-text-secondary">{{ t('settings.docker.refreshIntervalHint') }}</small>
                   </div>
                   <div class="flex items-center">
                     <input type="checkbox" id="dockerExpandDefault" v-model="dockerExpandDefault"
                            class="h-4 w-4 rounded border-border text-primary focus:ring-primary mr-2 cursor-pointer">
                     <label for="dockerExpandDefault" class="text-sm text-foreground cursor-pointer select-none">{{ t('settings.docker.defaultExpandLabel') }}</label>
                   </div>
                   <div class="flex items-center justify-between">
                      <button type="submit" :disabled="dockerSettingsLoading"
                              class="px-4 py-2 bg-button text-button-text rounded-md shadow-sm hover:bg-button-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed transition duration-150 ease-in-out text-sm font-medium">
                        {{ dockerSettingsLoading ? $t('common.saving') : t('settings.docker.saveButton') }}
                      </button>
                      <p v-if="dockerSettingsMessage" :class="['text-sm', dockerSettingsSuccess ? 'text-success' : 'text-error']">{{ dockerSettingsMessage }}</p>
                   </div>
                 </form>
              </div>
              <hr class="border-border/50">
              <!-- Status Monitor -->
              <div class="settings-section-content">
                 <h3 class="text-base font-semibold text-foreground mb-3">{{ t('settings.statusMonitor.title') }}</h3>
                 <form @submit.prevent="handleUpdateStatusMonitorInterval" class="space-y-4">
                   <div>
                     <label for="statusMonitorInterval" class="block text-sm font-medium text-text-secondary mb-1">{{ t('settings.statusMonitor.refreshIntervalLabel') }}</label>
                     <input type="number" id="statusMonitorInterval" v-model.number="statusMonitorIntervalLocal" min="1" step="1" required
                            class="w-full px-3 py-2 border border-border rounded-md shadow-sm bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary">
                     <small class="block mt-1 text-xs text-text-secondary">{{ t('settings.statusMonitor.refreshIntervalHint') }}</small>
                   </div>
                   <div class="flex items-center justify-between">
                      <button type="submit" :disabled="statusMonitorLoading"
                              class="px-4 py-2 bg-button text-button-text rounded-md shadow-sm hover:bg-button-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed transition duration-150 ease-in-out text-sm font-medium">
                        {{ statusMonitorLoading ? $t('common.saving') : t('settings.statusMonitor.saveButton') }}
                      </button>
                      <p v-if="statusMonitorMessage" :class="['text-sm', statusMonitorSuccess ? 'text-success' : 'text-error']">{{ statusMonitorMessage }}</p>
                   </div>
                 </form>
              </div>
            </div>
          </div>
        </div>

      </div> <!-- End Settings Sections Grid -->
    </div> <!-- End Inner container -->
  </div> <!-- End Outer container -->
</template>

<script setup lang="ts">
import { ref, onMounted, computed, reactive, watch } from 'vue';
import { useAuthStore } from '../stores/auth.store';
import { useSettingsStore } from '../stores/settings.store';
import { useAppearanceStore } from '../stores/appearance.store'; // 导入外观 store
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
// setLocale is handled by the store now
import apiClient from '../utils/apiClient'; // 使用统一的 apiClient
import { isAxiosError } from 'axios'; // 单独导入 isAxiosError
import { startRegistration } from '@simplewebauthn/browser';

const authStore = useAuthStore();
const settingsStore = useSettingsStore();
const appearanceStore = useAppearanceStore(); // 实例化外观 store
const { t } = useI18n();

// --- Reactive state from store ---
// 使用 storeToRefs 获取响应式 getter，包括 language
const { settings, isLoading: settingsLoading, error: settingsError, showPopupFileEditorBoolean, shareFileEditorTabsBoolean, autoCopyOnSelectBoolean, dockerDefaultExpandBoolean, statusMonitorIntervalSecondsNumber, language: storeLanguage, workspaceSidebarPersistentBoolean } = storeToRefs(settingsStore); // +++ 添加 workspaceSidebarPersistentBoolean getter +++

// --- Local state for forms ---
const ipWhitelistInput = ref('');
// 使用 store 的 language getter 初始化 selectedLanguage
const selectedLanguage = ref<'en' | 'zh'>(storeLanguage.value);
const blacklistSettingsForm = reactive({ // Renamed to avoid conflict with store state name
    maxLoginAttempts: '5', // 初始值将在 watcher 中被 store 值覆盖
    loginBanDuration: '300', // 初始值将在 watcher 中被 store 值覆盖
});
const popupEditorEnabled = ref(true); // 本地状态，用于 v-model
const workspaceSidebarPersistentEnabled = ref(false); // 新增：侧边栏固定设置的本地状态

// --- Local UI feedback state ---
const ipWhitelistLoading = ref(false);
const ipWhitelistMessage = ref('');
const ipWhitelistSuccess = ref(false);
const languageLoading = ref(false);
const languageMessage = ref('');
const languageSuccess = ref(false);
const blacklistSettingsLoading = ref(false);
const blacklistSettingsMessage = ref('');
const blacklistSettingsSuccess = ref(false);
const popupEditorLoading = ref(false);
const popupEditorMessage = ref('');
const popupEditorSuccess = ref(false);
const shareTabsEnabled = ref(true); // 本地状态，用于共享标签页 v-model
const shareTabsLoading = ref(false);
const shareTabsMessage = ref('');
const shareTabsSuccess = ref(false);
const autoCopyEnabled = ref(false); // 本地状态，用于选中即复制 v-model
const autoCopyLoading = ref(false);
const autoCopyMessage = ref('');
const autoCopySuccess = ref(false);
const dockerInterval = ref(2); // 本地状态，用于 Docker 刷新间隔 v-model
const dockerExpandDefault = ref(false); // 本地状态，用于 Docker 默认展开 v-model
const dockerSettingsLoading = ref(false);
const dockerSettingsMessage = ref('');
const dockerSettingsSuccess = ref(false);
const statusMonitorIntervalLocal = ref(3); // 本地状态，用于状态监控间隔 v-model
const statusMonitorLoading = ref(false);
const statusMonitorMessage = ref('');
const statusMonitorSuccess = ref(false);
const workspaceSidebarPersistentLoading = ref(false); // 新增
const workspaceSidebarPersistentMessage = ref(''); // 新增
const workspaceSidebarPersistentSuccess = ref(false); // 新增


// --- Watcher to sync local form state with store state ---
watch(settings, (newSettings, oldSettings) => {
  // Initialize only if settings were previously null or undefined
  const isInitialLoad = !oldSettings;

  ipWhitelistInput.value = newSettings.ipWhitelist || '';
  // selectedLanguage.value = newSettings.language || 'en'; // <-- 移除这一行，selectedLanguage 现在由 v-model 更新
  blacklistSettingsForm.maxLoginAttempts = newSettings.maxLoginAttempts || '5';
  blacklistSettingsForm.loginBanDuration = newSettings.loginBanDuration || '300';

  // 始终将本地布尔状态与 store 的布尔 getter 同步 (除了 language)
  popupEditorEnabled.value = showPopupFileEditorBoolean.value;
  shareTabsEnabled.value = shareFileEditorTabsBoolean.value;
  autoCopyEnabled.value = autoCopyOnSelectBoolean.value; // 同步选中即复制状态
  dockerInterval.value = parseInt(newSettings.dockerStatusIntervalSeconds || '2', 10); // 同步 Docker 间隔
  dockerExpandDefault.value = dockerDefaultExpandBoolean.value; // 同步 Docker 默认展开状态
  statusMonitorIntervalLocal.value = statusMonitorIntervalSecondsNumber.value; // 同步状态监控间隔
  workspaceSidebarPersistentEnabled.value = workspaceSidebarPersistentBoolean.value; // 新增：同步侧边栏固定设置

}, { deep: true, immediate: true }); // immediate: true to run on initial load

// --- Popup Editor setting method ---
const handleUpdatePopupEditorSetting = async () => {
    popupEditorLoading.value = true;
    popupEditorMessage.value = '';
    popupEditorSuccess.value = false;
    try {
        // 将布尔值转换为字符串 'true' 或 'false' 来存储
        const valueToSave = popupEditorEnabled.value ? 'true' : 'false';
        await settingsStore.updateSetting('showPopupFileEditor', valueToSave);
        popupEditorMessage.value = t('settings.popupEditor.success.saved'); // 需要添加翻译
        popupEditorSuccess.value = true;
    } catch (error: any) {
        console.error('更新弹窗编辑器设置失败:', error);
        popupEditorMessage.value = error.message || t('settings.popupEditor.error.saveFailed'); // 需要添加翻译
        popupEditorSuccess.value = false;
        // 保存失败时，不需要手动恢复，v-model 应该保持用户最后的操作状态
        // popupEditorEnabled.value = showPopupFileEditorBoolean.value; // <-- 移除恢复逻辑
    } finally {
        popupEditorLoading.value = false;
    }
};

// --- Share Editor Tabs setting method ---
const handleUpdateShareTabsSetting = async () => {
    shareTabsLoading.value = true;
    shareTabsMessage.value = '';
    shareTabsSuccess.value = false;
    try {
        const valueToSave = shareTabsEnabled.value ? 'true' : 'false';
        await settingsStore.updateSetting('shareFileEditorTabs', valueToSave);
        shareTabsMessage.value = t('settings.shareEditorTabs.success.saved'); // 需要添加翻译
        shareTabsSuccess.value = true;
    } catch (error: any) {
        console.error('更新共享编辑器标签页设置失败:', error);
        shareTabsMessage.value = error.message || t('settings.shareEditorTabs.error.saveFailed'); // 需要添加翻译
        shareTabsSuccess.value = false;
        // 保存失败时，不需要手动恢复
        // shareTabsEnabled.value = shareFileEditorTabsBoolean.value; // <-- 移除恢复逻辑
    } finally {
        shareTabsLoading.value = false;
    }
};

// --- Auto Copy on Select setting method ---
const handleUpdateAutoCopySetting = async () => {
    autoCopyLoading.value = true;
    autoCopyMessage.value = '';
    autoCopySuccess.value = false;
    try {
        const valueToSave = autoCopyEnabled.value ? 'true' : 'false';
        await settingsStore.updateSetting('autoCopyOnSelect', valueToSave);
        autoCopyMessage.value = t('settings.autoCopyOnSelect.success.saved'); // 需要添加翻译
        autoCopySuccess.value = true;
    } catch (error: any) {
        console.error('更新自动复制设置失败:', error);
        autoCopyMessage.value = error.message || t('settings.autoCopyOnSelect.error.saveFailed'); // 需要添加翻译
        autoCopySuccess.value = false;
    } finally {
        autoCopyLoading.value = false;
    }
};

// --- Docker settings method ---
const handleUpdateDockerSettings = async () => {
    dockerSettingsLoading.value = true;
    dockerSettingsMessage.value = '';
    dockerSettingsSuccess.value = false;
    try {
        const intervalValue = dockerInterval.value;
        if (isNaN(intervalValue) || intervalValue < 1) {
            throw new Error(t('settings.docker.error.invalidInterval')); // 需要添加翻译
        }
        await settingsStore.updateMultipleSettings({
            dockerStatusIntervalSeconds: String(intervalValue), // 保存为字符串
            dockerDefaultExpand: dockerExpandDefault.value ? 'true' : 'false' // 保存为字符串 'true'/'false'
        });
        dockerSettingsMessage.value = t('settings.docker.success.saved'); // 需要添加翻译
        dockerSettingsSuccess.value = true;
    } catch (error: any) {
        console.error('更新 Docker 设置失败:', error);
        dockerSettingsMessage.value = error.message || t('settings.docker.error.saveFailed'); // 需要添加翻译
        dockerSettingsSuccess.value = false;
    } finally {
        dockerSettingsLoading.value = false;
    }
};

// --- Status Monitor interval setting method ---
const handleUpdateStatusMonitorInterval = async () => {
    statusMonitorLoading.value = true;
    statusMonitorMessage.value = '';
    statusMonitorSuccess.value = false;
    try {
        const intervalValue = statusMonitorIntervalLocal.value;
        if (isNaN(intervalValue) || intervalValue < 1 || !Number.isInteger(intervalValue)) {
            throw new Error(t('settings.statusMonitor.error.invalidInterval')); // 需要添加翻译
        }
        await settingsStore.updateSetting('statusMonitorIntervalSeconds', String(intervalValue)); // 保存为字符串
        statusMonitorMessage.value = t('settings.statusMonitor.success.saved'); // 需要添加翻译
        statusMonitorSuccess.value = true;
    } catch (error: any) {
        console.error('更新状态监控间隔失败:', error);
        statusMonitorMessage.value = error.message || t('settings.statusMonitor.error.saveFailed'); // 需要添加翻译
        statusMonitorSuccess.value = false;
    } finally {
        statusMonitorLoading.value = false;
    }
};

// --- Workspace Sidebar Persistent setting method ---
const handleUpdateWorkspaceSidebarSetting = async () => {
    workspaceSidebarPersistentLoading.value = true;
    workspaceSidebarPersistentMessage.value = '';
    workspaceSidebarPersistentSuccess.value = false;
    try {
        const valueToSave = workspaceSidebarPersistentEnabled.value ? 'true' : 'false';
        await settingsStore.updateSetting('workspaceSidebarPersistent', valueToSave);
        workspaceSidebarPersistentMessage.value = t('settings.workspace.success.sidebarPersistentSaved'); // 需要添加翻译
        workspaceSidebarPersistentSuccess.value = true;
    } catch (error: any) {
        console.error('更新侧边栏固定设置失败:', error);
        workspaceSidebarPersistentMessage.value = error.message || t('settings.workspace.error.sidebarPersistentSaveFailed'); // 需要添加翻译
        workspaceSidebarPersistentSuccess.value = false;
    } finally {
        workspaceSidebarPersistentLoading.value = false;
    }
};

// --- 外观设置 ---
const openStyleCustomizer = () => {
    appearanceStore.toggleStyleCustomizer(true);
};

// --- Passkey state & methods --- (Keep as is)
const passkeyName = ref('');
const passkeyMessage = ref<string | null>(null);
const passkeyError = ref<string | null>(null);
const handleRegisterPasskey = async () => {
  passkeyMessage.value = null;
  passkeyError.value = null;
  if (!passkeyName.value) {
    passkeyError.value = t('settings.passkey.error.nameRequired');
    return;
  }
  try {
    const optionsResponse = await apiClient.post('/auth/passkey/register-options'); // 使用 apiClient
    const options = optionsResponse.data;
    let registrationResponse = await startRegistration(options);
    await apiClient.post('/auth/passkey/verify-registration', { registrationResponse, name: passkeyName.value }); // 使用 apiClient
    passkeyMessage.value = t('settings.passkey.success.registered');
    passkeyName.value = '';
  } catch (error: any) {
    console.error('Passkey 注册流程出错:', error);
    if (error.name === 'NotAllowedError') {
        passkeyError.value = t('settings.passkey.error.cancelled');
    } else if (isAxiosError(error) && error.response) { // 使用导入的 isAxiosError
      passkeyError.value = t('settings.passkey.error.verificationFailed', { message: error.response.data.message || 'Server error' });
    } else {
       passkeyError.value = t('settings.passkey.error.genericRegistration', { message: error.message || t('settings.passkey.error.unknown') });
    }
  }
};

// --- Change Password state & methods --- (Keep as is)
const currentPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const changePasswordLoading = ref(false);
const changePasswordMessage = ref('');
const changePasswordSuccess = ref(false);
const handleChangePassword = async () => {
  changePasswordMessage.value = '';
  changePasswordSuccess.value = false;
  if (newPassword.value !== confirmPassword.value) {
    changePasswordMessage.value = t('settings.changePassword.error.passwordsDoNotMatch');
    return;
  }
  changePasswordLoading.value = true;
  try {
    await authStore.changePassword(currentPassword.value, newPassword.value);
    changePasswordMessage.value = t('settings.changePassword.success');
    changePasswordSuccess.value = true;
    currentPassword.value = '';
    newPassword.value = '';
    confirmPassword.value = '';
  } catch (error: any) {
    console.error('修改密码失败:', error);
    changePasswordMessage.value = error.message || t('settings.changePassword.error.generic');
    changePasswordSuccess.value = false;
  } finally {
    changePasswordLoading.value = false;
  }
};

// --- 2FA state & methods --- (Keep as is)
const twoFactorEnabled = ref(false);
const twoFactorLoading = ref(false);
const twoFactorMessage = ref('');
const twoFactorSuccess = ref(false);
const setupData = ref<{ secret: string; qrCodeUrl: string } | null>(null);
const verificationCode = ref('');
const disablePassword = ref('');
const isSettingUp2FA = computed(() => setupData.value !== null);
const checkTwoFactorStatus = async () => {
  await authStore.checkAuthStatus();
  twoFactorEnabled.value = authStore.user?.isTwoFactorEnabled ?? false;
};
const handleSetup2FA = async () => {
  twoFactorMessage.value = ''; twoFactorSuccess.value = false; twoFactorLoading.value = true;
  setupData.value = null; verificationCode.value = '';
  try {
    const response = await apiClient.post<{ secret: string; qrCodeUrl: string }>('/auth/2fa/setup'); // 使用 apiClient
    setupData.value = response.data;
  } catch (error: any) {
    console.error('开始设置 2FA 失败:', error);
    twoFactorMessage.value = error.response?.data?.message || t('settings.twoFactor.error.setupFailed');
  } finally { twoFactorLoading.value = false; }
};
const handleVerifyAndActivate2FA = async () => {
  if (!setupData.value || !verificationCode.value) {
    twoFactorMessage.value = t('settings.twoFactor.error.codeRequired'); return;
  }
  twoFactorMessage.value = ''; twoFactorSuccess.value = false; twoFactorLoading.value = true;
  try {
    await apiClient.post('/auth/2fa/verify', { token: verificationCode.value }); // 使用 apiClient
    twoFactorMessage.value = t('settings.twoFactor.success.activated');
    twoFactorSuccess.value = true; twoFactorEnabled.value = true;
    setupData.value = null; verificationCode.value = '';
  } catch (error: any) {
    console.error('验证并激活 2FA 失败:', error);
    twoFactorMessage.value = error.response?.data?.message || t('settings.twoFactor.error.verificationFailed');
  } finally { twoFactorLoading.value = false; }
};
const handleDisable2FA = async () => {
  if (!disablePassword.value) {
    twoFactorMessage.value = t('settings.twoFactor.error.passwordRequiredForDisable'); return;
  }
  twoFactorMessage.value = ''; twoFactorSuccess.value = false; twoFactorLoading.value = true;
  try {
    await apiClient.delete('/auth/2fa', { data: { password: disablePassword.value } }); // 使用 apiClient
    twoFactorMessage.value = t('settings.twoFactor.success.disabled');
    twoFactorSuccess.value = true; twoFactorEnabled.value = false;
    disablePassword.value = '';
  } catch (error: any) {
    console.error('禁用 2FA 失败:', error);
    twoFactorMessage.value = error.response?.data?.message || t('settings.twoFactor.error.disableFailed');
  } finally { twoFactorLoading.value = false; }
};
const cancelSetup = () => {
    setupData.value = null; verificationCode.value = ''; twoFactorMessage.value = '';
};

// --- Language settings method --- (Refactored)
const handleUpdateLanguage = async () => {
    languageLoading.value = true;
    languageMessage.value = '';
    languageSuccess.value = false;
    try {
        await settingsStore.updateSetting('language', selectedLanguage.value);
        languageMessage.value = t('settings.language.success.saved');
        languageSuccess.value = true;
    } catch (error: any) {
        console.error('更新语言设置失败:', error);
        languageMessage.value = error.message || t('settings.language.error.saveFailed');
        languageSuccess.value = false;
    } finally {
        languageLoading.value = false;
    }
};

// --- IP Whitelist method --- (Refactored)
const handleUpdateIpWhitelist = async () => {
    ipWhitelistLoading.value = true;
    ipWhitelistMessage.value = '';
    ipWhitelistSuccess.value = false;
    try {
        await settingsStore.updateSetting('ipWhitelist', ipWhitelistInput.value.trim());
        ipWhitelistMessage.value = t('settings.ipWhitelist.success.saved');
        ipWhitelistSuccess.value = true;
    } catch (error: any) {
        console.error('更新 IP 白名单失败:', error);
        ipWhitelistMessage.value = error.message || t('settings.ipWhitelist.error.saveFailed');
        ipWhitelistSuccess.value = false;
    } finally {
        ipWhitelistLoading.value = false;
    }
};

// --- IP Blacklist state & methods --- (Keep fetch/delete as is, update uses store)
const ipBlacklist = reactive({
    entries: [] as any[],
    total: 0,
    loading: false,
    error: null as string | null,
    currentPage: 1,
    limit: 10,
});
const blacklistToDeleteIp = ref<string | null>(null);
const blacklistDeleteLoading = ref(false);
const blacklistDeleteError = ref<string | null>(null);

const fetchIpBlacklist = async (page = 1) => {
    ipBlacklist.loading = true;
    ipBlacklist.error = null;
    const offset = (page - 1) * ipBlacklist.limit;
    try {
        // Assuming fetchIpBlacklist is still needed from authStore
        const data = await authStore.fetchIpBlacklist(ipBlacklist.limit, offset);
        ipBlacklist.entries = data.entries;
        ipBlacklist.total = data.total;
        ipBlacklist.currentPage = page;
    } catch (error: any) {
        ipBlacklist.error = error.message || '获取黑名单失败';
    } finally {
        ipBlacklist.loading = false;
    }
};

const handleDeleteIp = async (ip: string) => {
    blacklistToDeleteIp.value = ip;
    if (confirm(`确定要从黑名单中移除 IP 地址 "${ip}" 吗？`)) {
        blacklistDeleteLoading.value = true;
        blacklistDeleteError.value = null;
        try {
            // Assuming deleteIpFromBlacklist is still needed from authStore
            await authStore.deleteIpFromBlacklist(ip);
            await fetchIpBlacklist(ipBlacklist.currentPage);
        } catch (error: any) {
            blacklistDeleteError.value = error.message || '删除失败';
        } finally {
            blacklistDeleteLoading.value = false;
            blacklistToDeleteIp.value = null;
        }
    } else {
        blacklistToDeleteIp.value = null;
    }
};

// Update Blacklist Config method (Refactored)
const handleUpdateBlacklistSettings = async () => {
    blacklistSettingsLoading.value = true;
    blacklistSettingsMessage.value = '';
    blacklistSettingsSuccess.value = false;
    try {
        const maxAttempts = parseInt(blacklistSettingsForm.maxLoginAttempts, 10);
        const banDuration = parseInt(blacklistSettingsForm.loginBanDuration, 10);
        if (isNaN(maxAttempts) || maxAttempts <= 0) {
            throw new Error('最大失败次数必须是正整数。');
        }
        if (isNaN(banDuration) || banDuration <= 0) {
            throw new Error('封禁时长必须是正整数（秒）。');
        }
        await settingsStore.updateMultipleSettings({
            maxLoginAttempts: blacklistSettingsForm.maxLoginAttempts,
            loginBanDuration: blacklistSettingsForm.loginBanDuration,
        });
        blacklistSettingsMessage.value = '黑名单配置已成功更新。';
        blacklistSettingsSuccess.value = true;
    } catch (error: any) {
        console.error('更新黑名单配置失败:', error);
        blacklistSettingsMessage.value = error.message || '更新黑名单配置失败';
        blacklistSettingsSuccess.value = false;
    } finally {
        blacklistSettingsLoading.value = false;
    }
};

// --- Lifecycle Hooks ---
onMounted(async () => {
  await checkTwoFactorStatus(); // Check 2FA status
  await fetchIpBlacklist(); // Fetch current blacklist entries
  // Initial settings (including language, whitelist, blacklist config) are loaded in main.ts via settingsStore.loadInitialSettings()
});

</script>

<style scoped>
/* Remove all scoped styles as they are now handled by Tailwind utility classes */
</style>
]]>

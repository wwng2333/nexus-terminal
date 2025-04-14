<script setup lang="ts">
import { ref, onMounted, watch, computed, onBeforeUnmount, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import MonacoEditor from './MonacoEditor.vue'; // 导入 Monaco Editor 组件

// --- Interfaces ---
interface FileAttributes {
    size: number;
    uid: number;
    gid: number;
    mode: number;
    atime: number;
    mtime: number;
    isDirectory: boolean;
    isFile: boolean;
    isSymbolicLink: boolean;
}

interface FileListItem {
    filename: string;
    longname: string;
    attrs: FileAttributes;
}

interface UploadItem {
    id: string;
    file: File;
    filename: string;
    progress: number;
    error?: string;
    status: 'pending' | 'uploading' | 'paused' | 'success' | 'error' | 'cancelled';
}

// --- Props ---
const props = defineProps<{
  ws: WebSocket | null;
  isConnected: boolean;
}>();

// --- Composables & Refs ---
const { t } = useI18n();
const route = useRoute();
const currentPath = ref<string>('.');
const fileList = ref<FileListItem[]>([]);
const isLoading = ref<boolean>(false);
const error = ref<string | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const uploads = ref<Record<string, UploadItem>>({});
const selectedItems = ref(new Set<string>());
const lastClickedIndex = ref(-1);
const contextMenuVisible = ref(false);
const contextMenuPosition = ref({ x: 0, y: 0 });
const contextMenuItems = ref<Array<{ label: string; action: () => void; disabled?: boolean }>>([]);
const contextTargetItem = ref<FileListItem | null>(null);
const isDraggingOver = ref(false); // State for drag-over visual feedback
const sortKey = ref<keyof FileListItem | 'type' | 'size' | 'mtime'>('filename'); // Default sort key
const sortDirection = ref<'asc' | 'desc'>('asc'); // Default sort direction

// --- Editor State ---
const isEditorVisible = ref(false);
const editingFilePath = ref<string | null>(null);
const editingFileContent = ref<string>('');
const editingFileLanguage = ref<string>('plaintext'); // Language for Monaco
const editingFileEncoding = ref<'utf8' | 'base64'>('utf8'); // How content was received
const isEditorLoading = ref<boolean>(false);
const editorError = ref<string | null>(null);
const isSaving = ref<boolean>(false);
const saveStatus = ref<'idle' | 'saving' | 'success' | 'error'>('idle');
const saveError = ref<string | null>(null);


// --- Helper Functions ---
const joinPath = (base: string, name: string): string => {
    if (base === '/') return `/${name}`;
    return `${base}/${name}`;
};

const sortFiles = (a: FileListItem, b: FileListItem): number => {
    if (a.attrs.isDirectory && !b.attrs.isDirectory) return -1;
    if (!a.attrs.isDirectory && b.attrs.isDirectory) return 1;
    return a.filename.localeCompare(b.filename);
};

const formatSize = (size: number): string => {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

const formatMode = (mode: number): string => {
  const perm = mode & 0o777; let str = '';
  str += (perm & 0o400) ? 'r' : '-'; str += (perm & 0o200) ? 'w' : '-'; str += (perm & 0o100) ? 'x' : '-';
  str += (perm & 0o040) ? 'r' : '-'; str += (perm & 0o020) ? 'w' : '-'; str += (perm & 0o010) ? 'x' : '-';
  str += (perm & 0o004) ? 'r' : '-'; str += (perm & 0o002) ? 'w' : '-'; str += (perm & 0o001) ? 'x' : '-';
  return str;
};

// --- Editor Helper Functions ---
const getLanguageFromFilename = (filename: string): string => {
  const extension = filename.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'js': return 'javascript';
    case 'ts': return 'typescript';
    case 'json': return 'json';
    case 'html': return 'html';
    case 'css': return 'css';
    case 'scss': return 'scss';
    case 'less': return 'less';
    case 'py': return 'python';
    case 'java': return 'java';
    case 'c': return 'c';
    case 'cpp': return 'cpp';
    case 'cs': return 'csharp';
    case 'go': return 'go';
    case 'php': return 'php';
    case 'rb': return 'ruby';
    case 'rs': return 'rust';
    case 'sql': return 'sql';
    case 'sh': return 'shell';
    case 'yaml': case 'yml': return 'yaml';
    case 'md': return 'markdown';
    case 'xml': return 'xml';
    case 'ini': return 'ini';
    case 'bat': return 'bat';
    case 'dockerfile': return 'dockerfile';
    default: return 'plaintext';
  }
};

const closeEditor = () => {
  isEditorVisible.value = false;
  editingFilePath.value = null;
  editingFileContent.value = '';
  editorError.value = null;
  isEditorLoading.value = false;
  saveStatus.value = 'idle'; // Reset save status on close
  saveError.value = null;
};

const handleSaveFile = () => {
  if (!props.ws || props.ws.readyState !== WebSocket.OPEN || !editingFilePath.value || isSaving.value) {
    return;
  }
  isSaving.value = true;
  saveStatus.value = 'saving';
  saveError.value = null;

  // Determine encoding: prefer original encoding if possible, otherwise default to utf8
  // For simplicity now, we always send as utf8. If base64 was received,
  // it means the backend couldn't decode it, so sending back utf8 might be problematic.
  // A more robust solution would involve detecting if content was modified from original base64.
  // For now, assume content is valid UTF-8 after editing.
  const contentToSave = editingFileContent.value;
  const encodingToSend: 'utf8' | 'base64' = 'utf8'; // Always send UTF8 for now

  // If the original was base64 and content hasn't changed significantly (heuristic),
  // maybe send base64 back? This is complex. Let's stick to UTF-8 for V1.1.

  props.ws.send(JSON.stringify({
    type: 'sftp:writefile',
    payload: {
      path: editingFilePath.value,
      content: contentToSave,
      encoding: encodingToSend,
    }
  }));

  // Timeout for saving status display
  setTimeout(() => {
    if (saveStatus.value === 'saving') { // If still saving after timeout, assume error (no response)
        saveStatus.value = 'error';
        saveError.value = t('fileManager.errors.saveTimeout');
        isSaving.value = false;
        // Reset status after a while
        setTimeout(() => {
            if (saveStatus.value === 'error') saveStatus.value = 'idle'; saveError.value = null;
        }, 3000);
    }
  }, 20000); // Increased to 20 second timeout
};


// --- Context Menu Logic ---
const showContextMenu = (event: MouseEvent, item?: FileListItem) => {
  event.preventDefault();
  const targetItem = item || null;

  // Adjust selection based on right-click target
  if (targetItem && !event.ctrlKey && !event.metaKey && !event.shiftKey && !selectedItems.value.has(targetItem.filename)) {
      selectedItems.value.clear();
      selectedItems.value.add(targetItem.filename);
      lastClickedIndex.value = fileList.value.findIndex(f => f.filename === targetItem.filename);
  } else if (!targetItem) {
      selectedItems.value.clear();
      lastClickedIndex.value = -1;
  }

  contextTargetItem.value = targetItem;
  let menu: Array<{ label: string; action: () => void; disabled?: boolean }> = [];
  const selectionSize = selectedItems.value.size;
  const clickedItemIsSelected = targetItem && selectedItems.value.has(targetItem.filename);

  // Build context menu items
  if (selectionSize > 1 && clickedItemIsSelected) {
      menu = [
          { label: t('fileManager.actions.deleteMultiple', { count: selectionSize }), action: handleDeleteClick },
          { label: t('fileManager.actions.refresh'), action: () => loadDirectory(currentPath.value) },
      ];
  } else if (targetItem && targetItem.filename !== '..') {
      menu = [
          { label: t('fileManager.actions.rename'), action: () => handleRenameClick(targetItem) },
          { label: t('fileManager.actions.changePermissions'), action: () => handleChangePermissionsClick(targetItem) },
          { label: t('fileManager.actions.delete'), action: handleDeleteClick },
      ];
      if (targetItem.attrs.isFile) {
          menu.splice(1, 0, { label: t('fileManager.actions.download', { name: targetItem.filename }), action: () => triggerDownload(targetItem) });
      }
       menu.push({ label: t('fileManager.actions.refresh'), action: () => loadDirectory(currentPath.value) });
  } else if (!targetItem) {
      menu = [
          { label: t('fileManager.actions.newFolder'), action: handleNewFolderClick },
          { label: t('fileManager.actions.upload'), action: triggerFileUpload },
          { label: t('fileManager.actions.refresh'), action: () => loadDirectory(currentPath.value) },
      ];
  } else { // Clicked on '..'
        menu = [ { label: t('fileManager.actions.refresh'), action: () => loadDirectory(currentPath.value) } ];
   }

   contextMenuItems.value = menu;

   // Calculate initial position
   let posX = event.clientX;
   let posY = event.clientY;

   // Estimate menu dimensions (adjust if necessary based on actual menu size)
   const estimatedMenuWidth = 180;
   const estimatedMenuHeight = 200; // Adjust based on max items

   // Adjust position if menu would go off-screen
   if (posX + estimatedMenuWidth > window.innerWidth) {
       posX = window.innerWidth - estimatedMenuWidth - 5; // Adjust and add small padding
   }
   if (posY + estimatedMenuHeight > window.innerHeight) {
       posY = window.innerHeight - estimatedMenuHeight - 5; // Adjust and add small padding
   }
    // Ensure position is not negative
   posX = Math.max(0, posX);
   posY = Math.max(0, posY);


   contextMenuPosition.value = { x: posX, y: posY };
   contextMenuVisible.value = true;

   // Add global listener to hide menu, using capture phase and once
  nextTick(() => {
      document.removeEventListener('click', hideContextMenu, { capture: true }); // Clean up just in case
      document.addEventListener('click', hideContextMenu, { capture: true, once: true });
  });
};

const hideContextMenu = () => {
  if (!contextMenuVisible.value) return; // Prevent unnecessary runs
  contextMenuVisible.value = false;
  contextMenuItems.value = [];
  contextTargetItem.value = null;
  // Explicitly remove listener just in case 'once' didn't fire or was removed prematurely
  document.removeEventListener('click', hideContextMenu, { capture: true });
};


// --- WebSocket Message Handling ---
watch(() => props.ws, (newWs, oldWs) => {
    console.log('[FileManager] WebSocket prop changed.');
    if (oldWs) {
        console.log('[FileManager] Removing message listener from old WebSocket.');
        oldWs.removeEventListener('message', handleWebSocketMessage);
    }
    if (newWs) {
        console.log('[FileManager] Adding message listener to new WebSocket.');
        newWs.addEventListener('message', handleWebSocketMessage);
        if (props.isConnected) {
            console.log('[FileManager] WebSocket connected, loading initial directory.');
            loadDirectory(currentPath.value);
        }
    } else {
        console.log('[FileManager] WebSocket prop is now null.');
    }
}, { immediate: true });

watch(() => props.isConnected, (connected) => {
    if (connected && props.ws && fileList.value.length === 0) loadDirectory(currentPath.value);
    else if (!connected) {
        fileList.value = []; selectedItems.value.clear(); lastClickedIndex.value = -1;
        error.value = t('fileManager.errors.websocketNotConnected'); isLoading.value = false;
        Object.keys(uploads.value).forEach(uploadId => {
            const upload = uploads.value[uploadId];
            if (upload && ['pending', 'uploading', 'paused'].includes(upload.status)) cancelUpload(uploadId, false);
        });
    }
});

const handleWebSocketMessage = (event: MessageEvent) => {
    console.log('[FileManager] Received WebSocket message:', event.data.substring(0, 200)); // Log incoming message
    try {
        const message = JSON.parse(event.data);
        // Destructure only common top-level keys
        const { type, payload, path } = message;
        // Extract uploadId specifically where needed from payload or top-level
        const uploadIdFromPayload = message.uploadId || payload?.uploadId; // Check top-level first, then payload

        // Log specific message types relevant to FileManager
        if (type.startsWith('sftp:')) {
             console.log(`[FileManager] Processing SFTP message: ${type}`, { path, uploadId: uploadIdFromPayload, payload: type === 'sftp:readfile:success' ? '...' : payload });
        }


        if (type === 'sftp:readdir:success' && path === currentPath.value) {
            fileList.value = payload.sort(sortFiles); selectedItems.value.clear(); lastClickedIndex.value = -1; error.value = null; isLoading.value = false;
        } else if (type === 'sftp:readdir:error' && path === currentPath.value) {
            error.value = payload; isLoading.value = false; fileList.value = []; selectedItems.value.clear(); lastClickedIndex.value = -1;
        }
        // Use uploadIdFromPayload for all upload-related messages
        else if (type === 'sftp:upload:ready' && uploadIdFromPayload) {
            const upload = uploads.value[uploadIdFromPayload];
            if (upload && upload.status === 'pending') {
                if (upload.file.size === 0) { upload.status = 'uploading'; props.ws?.send(JSON.stringify({ type: 'sftp:upload:chunk', payload: { uploadId: uploadIdFromPayload, data: '', isLast: true } })); upload.progress = 100; }
                else { upload.status = 'uploading'; sendFileChunks(uploadIdFromPayload, upload.file); }
            }
        } else if (type === 'sftp:upload:success' && uploadIdFromPayload) {
            const upload = uploads.value[uploadIdFromPayload];
            // *** Log entry into the success block ***
            console.log(`[FileManager] Entered sftp:upload:success block for ID: ${uploadIdFromPayload}`);
            if (upload) {
                console.log(`[FileManager] Found upload task for ID: ${uploadIdFromPayload}. Current status: ${upload.status}`);
                upload.status = 'success'; // Mark as success
                upload.progress = 100;
                loadDirectory(currentPath.value); // Refresh directory list

                console.log(`[FileManager] Before removal - uploads[${uploadIdFromPayload}]:`, uploads.value[uploadIdFromPayload]);
                console.log(`[FileManager] Before removal - All upload keys:`, Object.keys(uploads.value));

                // Create a new object excluding the completed upload to ensure reactivity update
                const newUploads = { ...uploads.value };
                delete newUploads[uploadIdFromPayload];
                uploads.value = newUploads; // Assign the new object back

                nextTick(() => {
                    console.log(`[FileManager] After removal (nextTick) - uploads[${uploadIdFromPayload}]:`, uploads.value[uploadIdFromPayload]); // Should be undefined
                    console.log(`[FileManager] After removal (nextTick) - All upload keys:`, Object.keys(uploads.value));
                });

            } else {
                 console.warn(`[FileManager] Received upload success for unknown ID: ${uploadIdFromPayload}`);
            }
        } else if (type === 'sftp:upload:error' && uploadIdFromPayload) {
             const upload = uploads.value[uploadIdFromPayload];
             if (upload) {
                 upload.status = 'error';
                 upload.error = payload;
                 // Keep the error message visible for a while
                 setTimeout(() => { if (uploads.value[uploadIdFromPayload]?.status === 'error') delete uploads.value[uploadIdFromPayload]; }, 5000);
             }
        } else if (type === 'sftp:upload:pause' && uploadIdFromPayload) {
             const upload = uploads.value[uploadIdFromPayload]; if (upload && upload.status === 'uploading') upload.status = 'paused';
        } else if (type === 'sftp:upload:resume' && uploadIdFromPayload) {
             const upload = uploads.value[uploadIdFromPayload]; if (upload && upload.status === 'paused') { upload.status = 'uploading'; console.warn("Resuming upload..."); sendFileChunks(uploadIdFromPayload, upload.file); }
        } else if (type === 'sftp:upload:cancelled' && uploadIdFromPayload) {
             const upload = uploads.value[uploadIdFromPayload];
             if (upload) {
                 upload.status = 'cancelled';
                 // Keep the cancelled message visible for a while
                 setTimeout(() => { if (uploads.value[uploadIdFromPayload]?.status === 'cancelled') delete uploads.value[uploadIdFromPayload]; }, 3000);
             }
        }
        else if (type === 'sftp:mkdir:success' || type === 'sftp:rmdir:success' || type === 'sftp:unlink:success' || type === 'sftp:rename:success' || type === 'sftp:chmod:success') {
            loadDirectory(currentPath.value); error.value = null;
        } else if (type === 'sftp:mkdir:error') { error.value = `${t('fileManager.errors.createFolderFailed')}: ${payload}`; }
        else if (type === 'sftp:rmdir:error' || type === 'sftp:unlink:error') { error.value = `${t('fileManager.errors.deleteFailed')}: ${payload}`; }
        else if (type === 'sftp:rename:error') { error.value = `${t('fileManager.errors.renameFailed')}: ${payload}`; }
        else if (type === 'sftp:chmod:error') { error.value = `${t('fileManager.errors.chmodFailed')}: ${payload}`; }
        // --- Handle Editor File Content ---
        else if (type === 'sftp:readfile:success' && path === editingFilePath.value) {
            isEditorLoading.value = false;
            editorError.value = null;
            editingFileEncoding.value = payload.encoding;
            if (payload.encoding === 'base64') {
                try {
                    // Try decoding base64 content
                    editingFileContent.value = atob(payload.content);
                } catch (decodeError) {
                    console.error("Base64 decode error:", decodeError);
                    editorError.value = t('fileManager.errors.fileDecodeError');
                    editingFileContent.value = `// ${t('fileManager.errors.fileDecodeError')}\n${payload.content}`; // Show raw base64 as fallback
                }
            } else {
                editingFileContent.value = payload.content;
            }
        } else if (type === 'sftp:readfile:error' && path === editingFilePath.value) {
            isEditorLoading.value = false;
            editorError.value = `${t('fileManager.errors.readFileFailed')}: ${payload}`;
            editingFileContent.value = `// ${editorError.value}`; // Show error in editor
        }
        // --- Handle Editor Save Status ---
        else if (type === 'sftp:writefile:success' && path === editingFilePath.value) {
            isSaving.value = false;
            saveStatus.value = 'success';
            saveError.value = null;
            // Optionally close editor on successful save, or just show status
            // closeEditor();
            // Reset status after a short delay
            setTimeout(() => { if (saveStatus.value === 'success') saveStatus.value = 'idle'; }, 2000);
        } else if (type === 'sftp:writefile:error' && path === editingFilePath.value) {
            isSaving.value = false;
            saveStatus.value = 'error';
            saveError.value = `${t('fileManager.errors.saveFailed')}: ${payload}`;
             // Reset status after a while
            setTimeout(() => {
                if (saveStatus.value === 'error') saveStatus.value = 'idle'; saveError.value = null;
            }, 5000);
        }


    } catch (e) { console.error("Error handling WebSocket message:", e); /* Log other errors */ }
};

// --- Directory Loading & Navigation ---
const loadDirectory = (path: string) => {
    if (!props.ws || props.ws.readyState !== WebSocket.OPEN) { error.value = t('fileManager.errors.websocketNotConnected'); return; }
    isLoading.value = true; error.value = null;
    props.ws.send(JSON.stringify({ type: 'sftp:readdir', payload: { path } }));
    currentPath.value = path;
};

// --- Item Click & Selection Logic ---
const handleItemClick = (event: MouseEvent, item: FileListItem) => {
    // Do not hide context menu here, let the global listener or menu item click handle it.

    const itemIndex = fileList.value.findIndex(f => f.filename === item.filename);
    if (itemIndex === -1 && item.filename !== '..') return;

    if (event.ctrlKey || event.metaKey) {
        if (item.filename === '..') return;
        if (selectedItems.value.has(item.filename)) selectedItems.value.delete(item.filename);
        else selectedItems.value.add(item.filename);
        lastClickedIndex.value = itemIndex;
    } else if (event.shiftKey && lastClickedIndex.value !== -1) {
        if (item.filename === '..') return;
        selectedItems.value.clear();
        const start = Math.min(lastClickedIndex.value, itemIndex);
        const end = Math.max(lastClickedIndex.value, itemIndex);
        for (let i = start; i <= end; i++) {
            if (fileList.value[i]) selectedItems.value.add(fileList.value[i].filename);
        }
    } else {
        selectedItems.value.clear();
        if (item.filename !== '..') {
             selectedItems.value.add(item.filename);
             lastClickedIndex.value = itemIndex;
        } else {
             lastClickedIndex.value = -1;
        }

        if (item.attrs.isDirectory) {
            const newPath = item.filename === '..'
                ? currentPath.value.substring(0, currentPath.value.lastIndexOf('/')) || '/'
                : joinPath(currentPath.value, item.filename);
            loadDirectory(newPath);
        } else if (item.attrs.isFile) {
            // --- Open file in editor ---
            if (!props.ws || props.ws.readyState !== WebSocket.OPEN) {
                editorError.value = t('fileManager.errors.websocketNotConnected');
                isEditorVisible.value = true; // Show editor pane with error
                return;
            }
            const filePath = joinPath(currentPath.value, item.filename);
            editingFilePath.value = filePath;
            editingFileLanguage.value = getLanguageFromFilename(item.filename);
            editingFileContent.value = ''; // Clear previous content
            isEditorLoading.value = true;
            editorError.value = null;
            isEditorVisible.value = true;
            props.ws.send(JSON.stringify({ type: 'sftp:readfile', payload: { path: filePath } }));
        }
    }
};

const triggerDownload = (item: FileListItem) => {
    const currentConnectionId = route.params.connectionId as string;
    if (!currentConnectionId) { error.value = t('fileManager.errors.missingConnectionId'); return; }
    const downloadPath = joinPath(currentPath.value, item.filename);
    const downloadUrl = `/api/v1/sftp/download?connectionId=${currentConnectionId}&remotePath=${encodeURIComponent(downloadPath)}`;
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.setAttribute('download', item.filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

// --- Drag and Drop Upload Logic ---
const handleDragEnter = (event: DragEvent) => {
    // Check if files are being dragged
    if (event.dataTransfer?.types.includes('Files')) {
        isDraggingOver.value = true;
    }
};

const handleDragOver = (event: DragEvent) => {
    // Necessary to allow drop
    event.preventDefault();
    if (event.dataTransfer && event.dataTransfer.types.includes('Files')) { // Added null check
        event.dataTransfer.dropEffect = 'copy'; // Show copy cursor
        isDraggingOver.value = true; // Ensure state is true
    } else if (event.dataTransfer) { // Added null check
        event.dataTransfer.dropEffect = 'none';
    }
};

const handleDragLeave = (event: DragEvent) => {
    // Check if the leave event is going outside the container or onto a child element
    const target = event.relatedTarget as Node | null;
    const container = (event.currentTarget as HTMLElement);
    if (!target || !container.contains(target)) {
       isDraggingOver.value = false;
    }
};

const handleDrop = (event: DragEvent) => {
    isDraggingOver.value = false;
    if (!event.dataTransfer?.files || !props.ws || props.ws.readyState !== WebSocket.OPEN) {
        return;
    }
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) {
        console.log(`[FileManager] Dropped ${files.length} files.`);
        files.forEach(startFileUpload); // Use existing function to handle each file
    }
};

// --- File Upload Logic ---
const triggerFileUpload = () => { fileInputRef.value?.click(); };
const handleFileSelected = (event: Event) => {
    const input = event.target as HTMLInputElement;
    if (!input.files || !props.ws || props.ws.readyState !== WebSocket.OPEN) return;
    Array.from(input.files).forEach(startFileUpload);
    input.value = '';
};
const startFileUpload = (file: File) => {
    if (!props.ws) return;
    const uploadId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const remotePath = joinPath(currentPath.value, file.name);
    if (fileList.value.some(item => item.filename === file.name && !item.attrs.isDirectory)) {
        if (!confirm(t('fileManager.prompts.confirmOverwrite', { name: file.name }))) return;
    }
    uploads.value[uploadId] = { id: uploadId, file, filename: file.name, progress: 0, status: 'pending' };
    props.ws.send(JSON.stringify({ type: 'sftp:upload:start', payload: { uploadId, remotePath, size: file.size } }));
};
const sendFileChunks = (uploadId: string, file: File, startByte = 0) => {
    const upload = uploads.value[uploadId];
    if (!props.ws || props.ws.readyState !== WebSocket.OPEN || !upload || upload.status !== 'uploading') return;
    const chunkSize = 1024 * 64;
    const reader = new FileReader();
    let offset = startByte;
    reader.onload = (e) => {
        const currentUpload = uploads.value[uploadId];
        if (!props.ws || props.ws.readyState !== WebSocket.OPEN || !currentUpload || currentUpload.status !== 'uploading') return;
        const chunkBase64 = (e.target?.result as string).split(',')[1];
        const isLast = offset + chunkSize >= file.size;
        props.ws.send(JSON.stringify({ type: 'sftp:upload:chunk', payload: { uploadId, data: chunkBase64, isLast } }));
        offset += chunkSize;
        currentUpload.progress = Math.min(100, Math.round((offset / file.size) * 100));
        if (!isLast) nextTick(readNextChunk);
    };
    reader.onerror = () => { if (uploads.value[uploadId]) { uploads.value[uploadId].status = 'error'; uploads.value[uploadId].error = t('fileManager.errors.readFileError'); } };
    const readNextChunk = () => { if (offset < file.size && uploads.value[uploadId]?.status === 'uploading') reader.readAsDataURL(file.slice(offset, offset + chunkSize)); };
    if (file.size > 0) readNextChunk();
};
const cancelUpload = (uploadId: string, notifyBackend = true) => {
    const upload = uploads.value[uploadId];
    if (upload && ['pending', 'uploading', 'paused'].includes(upload.status)) {
        upload.status = 'cancelled';
        if (notifyBackend && props.ws?.readyState === WebSocket.OPEN) props.ws.send(JSON.stringify({ type: 'sftp:upload:cancel', payload: { uploadId } }));
        setTimeout(() => { if (uploads.value[uploadId]?.status === 'cancelled') delete uploads.value[uploadId]; }, 3000);
    }
};

// --- SFTP Action Handlers ---
const handleDeleteClick = () => {
    if (!props.ws || props.ws.readyState !== WebSocket.OPEN || selectedItems.value.size === 0) return;
    const itemsToDelete = Array.from(selectedItems.value)
                               .map(filename => fileList.value.find(f => f.filename === filename))
                               .filter((item): item is FileListItem => item !== undefined);
    if (itemsToDelete.length === 0) return;
    const names = itemsToDelete.map(i => i.filename).join(', ');
    const confirmMsg = itemsToDelete.length > 1
        ? t('fileManager.prompts.confirmDeleteMultiple', { count: itemsToDelete.length, names: names })
        : itemsToDelete[0].attrs.isDirectory
            ? t('fileManager.prompts.confirmDeleteFolder', { name: itemsToDelete[0].filename })
            : t('fileManager.prompts.confirmDeleteFile', { name: itemsToDelete[0].filename });
    if (confirm(confirmMsg)) {
        itemsToDelete.forEach(item => {
            const targetPath = joinPath(currentPath.value, item.filename);
            const actionType = item.attrs.isDirectory ? 'sftp:rmdir' : 'sftp:unlink';
            props.ws!.send(JSON.stringify({ type: actionType, payload: { path: targetPath } }));
        });
    }
};
const handleRenameClick = (item: FileListItem) => {
    if (!props.ws || props.ws.readyState !== WebSocket.OPEN || !item) return;
    const newName = prompt(t('fileManager.prompts.enterNewName', { oldName: item.filename }), item.filename);
    if (newName && newName !== item.filename) {
        const oldPath = joinPath(currentPath.value, item.filename);
        const newPath = joinPath(currentPath.value, newName);
        props.ws.send(JSON.stringify({ type: 'sftp:rename', payload: { oldPath, newPath } }));
    }
};
const handleChangePermissionsClick = (item: FileListItem) => {
    if (!props.ws || props.ws.readyState !== WebSocket.OPEN || !item) return;
    const currentModeOctal = (item.attrs.mode & 0o777).toString(8).padStart(3, '0');
    const newModeStr = prompt(t('fileManager.prompts.enterNewPermissions', { name: item.filename, currentMode: currentModeOctal }), currentModeOctal);
    if (newModeStr) {
        if (!/^[0-7]{3,4}$/.test(newModeStr)) { alert(t('fileManager.errors.invalidPermissionsFormat')); return; }
        const newMode = parseInt(newModeStr, 8);
        const targetPath = joinPath(currentPath.value, item.filename);
        props.ws.send(JSON.stringify({ type: 'sftp:chmod', payload: { targetPath, mode: newMode } }));
    }
};
const handleNewFolderClick = () => {
    if (!props.ws || props.ws.readyState !== WebSocket.OPEN) return;
    const folderName = prompt(t('fileManager.prompts.enterFolderName'));
    if (folderName) {
        const newFolderPath = joinPath(currentPath.value, folderName);
        props.ws.send(JSON.stringify({ type: 'sftp:mkdir', payload: { path: newFolderPath } }));
    }
};

// --- Sorting Logic ---
const sortedFileList = computed(() => {
    const list = [...fileList.value]; // Create a shallow copy to avoid mutating original
    const key = sortKey.value;
    const direction = sortDirection.value === 'asc' ? 1 : -1;

    list.sort((a, b) => {
        // Always keep directories first when sorting by anything other than type
        if (key !== 'type') {
            if (a.attrs.isDirectory && !b.attrs.isDirectory) return -1;
            if (!a.attrs.isDirectory && b.attrs.isDirectory) return 1;
        }

        let valA: string | number | boolean;
        let valB: string | number | boolean;

        switch (key) {
            case 'type':
                // Sort by type: Directory > Symlink > File
                valA = a.attrs.isDirectory ? 0 : (a.attrs.isSymbolicLink ? 1 : 2);
                valB = b.attrs.isDirectory ? 0 : (b.attrs.isSymbolicLink ? 1 : 2);
                break;
            case 'filename':
                valA = a.filename.toLowerCase();
                valB = b.filename.toLowerCase();
                break;
            case 'size':
                valA = a.attrs.isFile ? a.attrs.size : -1; // Treat dirs as -1 size for sorting
                valB = b.attrs.isFile ? b.attrs.size : -1;
                break;
            case 'mtime':
                valA = a.attrs.mtime;
                valB = b.attrs.mtime;
                break;
            default: // Should not happen with defined keys, but fallback to filename
                valA = a.filename.toLowerCase();
                valB = b.filename.toLowerCase();
        }

        if (valA < valB) return -1 * direction;
        if (valA > valB) return 1 * direction;

        // Secondary sort by filename if primary values are equal
        if (key !== 'filename') {
            return a.filename.localeCompare(b.filename);
        }

        return 0;
    });
    return list;
});

const handleSort = (key: keyof FileListItem | 'type' | 'size' | 'mtime') => {
    if (sortKey.value === key) {
        sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc';
    } else {
        sortKey.value = key;
        sortDirection.value = 'asc';
    }
};

// --- Lifecycle Hooks ---
onMounted(() => {
    console.log('[FileManager] Component mounted.');
    if (props.isConnected && props.ws) {
        console.log('[FileManager] Mounted with active connection, loading initial directory.');
        loadDirectory(currentPath.value);
    }
});
onBeforeUnmount(() => {
    console.log('[FileManager] Component unmounting.');
    if (props.ws) {
        console.log('[FileManager] Removing message listener on unmount.');
        props.ws.removeEventListener('message', handleWebSocketMessage);
    }
    Object.keys(uploads.value).forEach(uploadId => {
        const upload = uploads.value[uploadId];
        if (upload && ['pending', 'uploading', 'paused'].includes(upload.status)) cancelUpload(uploadId);
    });
    // Ensure listener is removed on unmount if it somehow persists
    document.removeEventListener('click', hideContextMenu, { capture: true });
});

</script>

<template>
  <div class="file-manager"> <!-- Removed @click handler -->
    <div class="toolbar">
        <div class="path-bar">
          {{ t('fileManager.currentPath') }}: <strong>{{ currentPath }}</strong>
          <button @click="loadDirectory(currentPath)" :disabled="isLoading || !isConnected" :title="t('fileManager.actions.refresh')">🔄</button>
          <!-- Pass event to handleItemClick for '..' -->
          <button @click="handleItemClick($event, { filename: '..', longname: '', attrs: { isDirectory: true, isFile: false, isSymbolicLink: false, size: 0, uid: 0, gid: 0, mode: 0, atime: 0, mtime: 0 } })" :disabled="isLoading || !isConnected || currentPath === '/'" :title="t('fileManager.actions.parentDirectory')">⬆️</button>
        </div>
        <div class="actions-bar">
             <input type="file" ref="fileInputRef" @change="handleFileSelected" multiple style="display: none;" />
             <button @click="triggerFileUpload" :disabled="isLoading || !isConnected" :title="t('fileManager.actions.uploadFile')">📤 {{ t('fileManager.actions.upload') }}</button>
             <button @click="handleNewFolderClick" :disabled="isLoading || !isConnected" :title="t('fileManager.actions.newFolder')">➕ {{ t('fileManager.actions.newFolder') }}</button>
        </div>
    </div>

    <!-- File List Container -->
    <div
      class="file-list-container"
      :class="{ 'drag-over': isDraggingOver }"
      @dragenter.prevent="handleDragEnter"
      @dragover.prevent="handleDragOver"
      @dragleave.prevent="handleDragLeave"
      @drop.prevent="handleDrop"
    >
        <div v-if="isLoading && fileList.length === 0" class="loading">{{ t('fileManager.loading') }}</div>
        <div v-else-if="error" class="error">{{ t('fileManager.errors.generic') }}: {{ error }}</div>

        <table v-if="sortedFileList.length > 0 || currentPath !== '/'" @contextmenu.prevent>
          <thead>
            <tr>
              <th @click="handleSort('type')" class="sortable">
                {{ t('fileManager.headers.type') }}
                <span v-if="sortKey === 'type'">{{ sortDirection === 'asc' ? '▲' : '▼' }}</span>
              </th>
              <th @click="handleSort('filename')" class="sortable">
                {{ t('fileManager.headers.name') }}
                <span v-if="sortKey === 'filename'">{{ sortDirection === 'asc' ? '▲' : '▼' }}</span>
              </th>
              <th @click="handleSort('size')" class="sortable">
                {{ t('fileManager.headers.size') }}
                <span v-if="sortKey === 'size'">{{ sortDirection === 'asc' ? '▲' : '▼' }}</span>
              </th>
              <th>{{ t('fileManager.headers.permissions') }}</th> <!-- Permissions not sortable for now -->
              <th @click="handleSort('mtime')" class="sortable">
                {{ t('fileManager.headers.modified') }}
                <span v-if="sortKey === 'mtime'">{{ sortDirection === 'asc' ? '▲' : '▼' }}</span>
              </th>
              <!-- Removed Actions Header -->
            </tr>
          </thead>
          <tbody @contextmenu.prevent="showContextMenu($event)">
            <!-- '..' entry -->
            <tr v-if="currentPath !== '/'"
                class="clickable"
                @click="handleItemClick($event, { filename: '..', attrs: { isDirectory: true } } as FileListItem)"
                @contextmenu.prevent.stop="showContextMenu($event, { filename: '..', attrs: { isDirectory: true } } as FileListItem)" >
              <td>📁</td>
              <td>..</td>
              <td></td><td></td><td></td><td></td> <!-- Empty cells -->
            </tr>
            <!-- File list entries -->
            <tr v-for="(item, index) in sortedFileList"
                :key="item.filename"
                @click="handleItemClick($event, item)"
                :class="{ clickable: item.attrs.isDirectory || item.attrs.isFile, selected: selectedItems.has(item.filename) }"
                @contextmenu.prevent.stop="showContextMenu($event, item)">
              <td>{{ item.attrs.isDirectory ? '📁' : (item.attrs.isSymbolicLink ? '🔗' : '📄') }}</td>
              <td>{{ item.filename }}</td>
              <td>{{ item.attrs.isFile ? formatSize(item.attrs.size) : '' }}</td>
              <td>{{ formatMode(item.attrs.mode) }}</td>
              <td>{{ new Date(item.attrs.mtime).toLocaleString() }}</td>
              <!-- Removed Actions Cell -->
            </tr>
          </tbody>
        </table>
         <div v-else-if="!isLoading && !error" class="no-files">{{ t('fileManager.emptyDirectory') }}</div>
     </div>

     <!-- Upload Popup -->
     <div v-if="Object.keys(uploads).length > 0" class="upload-popup">
        <h4>{{ t('fileManager.uploadTasks') }}:</h4>
        <ul>
            <li v-for="upload in uploads" :key="upload.id">
                <span>{{ upload.filename }} ({{ t(`fileManager.uploadStatus.${upload.status}`) }})</span>
                <progress v-if="upload.status === 'uploading' || upload.status === 'pending'" :value="upload.progress" max="100"></progress>
                <span v-if="upload.status === 'uploading'"> {{ upload.progress }}%</span>
                <span v-if="upload.status === 'error'" class="error"> {{ t('fileManager.errors.generic') }}: {{ upload.error }}</span>
                <span v-if="upload.status === 'success'"> ✅</span>
                <span v-if="upload.status === 'cancelled'"> ❌ {{ t('fileManager.uploadStatus.cancelled') }}</span>
                <button v-if="['pending', 'uploading', 'paused'].includes(upload.status)" @click="cancelUpload(upload.id)" class="cancel-btn">{{ t('fileManager.actions.cancel') }}</button>
            </li>
        </ul>
    </div>

    <!-- Context Menu -->
    <div v-if="contextMenuVisible"
         class="context-menu"
         :style="{ top: `${contextMenuPosition.y}px`, left: `${contextMenuPosition.x}px` }"
         @click.stop> <!-- Add @click.stop here -->
      <ul>
        <li v-for="(menuItem, index) in contextMenuItems"
            :key="index"
            @click.stop="menuItem.action(); hideContextMenu()"
            :class="{ disabled: menuItem.disabled }">
          {{ menuItem.label }}
        </li>
      </ul>
    </div>

    <!-- Monaco Editor Overlay -->
    <div v-if="isEditorVisible" class="editor-overlay">
      <div class="editor-header">
        <span>{{ t('fileManager.editingFile') }}: {{ editingFilePath }}</span>
        <div class="editor-actions">
           <span v-if="saveStatus === 'saving'" class="save-status saving">{{ t('fileManager.saving') }}...</span>
           <span v-if="saveStatus === 'success'" class="save-status success">✅ {{ t('fileManager.saveSuccess') }}</span>
           <span v-if="saveStatus === 'error'" class="save-status error">❌ {{ t('fileManager.saveError') }}: {{ saveError }}</span>
           <button @click="handleSaveFile" :disabled="isSaving || isEditorLoading || !!editorError" class="save-btn">
             {{ isSaving ? t('fileManager.saving') : t('fileManager.actions.save') }}
           </button>
           <button @click="closeEditor" class="close-editor-btn">✖</button>
        </div>
      </div>
      <div v-if="isEditorLoading" class="editor-loading">{{ t('fileManager.loadingFile') }}</div>
      <div v-else-if="editorError" class="editor-error">{{ editorError }}</div>
      <MonacoEditor
        v-else
        v-model="editingFileContent"
        :language="editingFileLanguage"
        theme="vs-dark"
        class="editor-instance"
      />
      <!-- Save button added above -->
    </div>

  </div>
</template>

<style scoped>
/* Styles remain the same, but add .selected style */
.file-manager { height: 100%; display: flex; flex-direction: column; font-family: sans-serif; font-size: 0.9rem; overflow: hidden; }
.toolbar { display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; background-color: #f0f0f0; border-bottom: 1px solid #ccc; flex-wrap: wrap; }
.path-bar { white-space: nowrap; overflow-x: auto; flex-grow: 1; margin-right: 1rem; }
.path-bar button { margin-left: 0.5rem; background: none; border: none; cursor: pointer; font-size: 1.1em; padding: 0.1rem 0.3rem; }
.path-bar button:disabled { opacity: 0.5; cursor: not-allowed; }
.actions-bar button { padding: 0.3rem 0.6rem; cursor: pointer; margin-left: 0.5rem; }
.actions-bar button:disabled { opacity: 0.5; cursor: not-allowed; }
.upload-popup { position: fixed; bottom: 1rem; right: 1rem; background-color: white; border: 1px solid #ccc; border-radius: 5px; box-shadow: 0 2px 5px rgba(0,0,0,0.2); padding: 0.8rem; max-width: 300px; max-height: 200px; overflow-y: auto; z-index: 1001; }
.upload-popup h4 { margin: 0 0 0.5rem 0; font-size: 0.9em; border-bottom: 1px solid #eee; padding-bottom: 0.3rem; }
.upload-popup ul { list-style: none; padding: 0; margin: 0; }
.upload-popup li { margin-bottom: 0.4rem; font-size: 0.85em; display: flex; align-items: center; flex-wrap: wrap; }
.upload-popup progress { margin: 0 0.5rem; width: 80px; height: 0.8em; }
.upload-popup .error { color: red; margin-left: 0.5rem; flex-basis: 100%; font-size: 0.8em; }
.upload-popup .cancel-btn { margin-left: auto; padding: 0.1rem 0.4rem; font-size: 0.8em; background-color: #f8d7da; border: 1px solid #f5c6cb; color: #721c24; cursor: pointer; }
.loading, .error, .no-files { padding: 1rem; text-align: center; color: #666; }
.error { color: red; }
.file-list-container { flex-grow: 1; overflow-y: auto; position: relative; /* Needed for overlay */ }
.file-list-container.drag-over {
  outline: 2px dashed #007bff; /* Blue dashed outline */
  outline-offset: -2px; /* Offset inside */
  background-color: rgba(0, 123, 255, 0.05); /* Light blue background tint */
}
.file-list-container.drag-over::before { /* Optional: Add text overlay */
    content: 'Drop files here to upload';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background-color: rgba(0, 0, 0, 0.6);
    color: white;
    padding: 10px 20px;
    border-radius: 5px;
    font-size: 1.1em;
    pointer-events: none; /* Allow drop event to pass through */
    z-index: 2; /* Above table */
}
table { width: 100%; border-collapse: collapse; }
thead { background-color: #f8f8f8; position: sticky; top: 0; z-index: 1; }
th, td { border: 1px solid #eee; padding: 0.4rem 0.6rem; text-align: left; white-space: nowrap; }
th.sortable { cursor: pointer; }
th.sortable:hover { background-color: #e9e9e9; }
/* Set a smaller default width for the first column (Type) */
th:first-child, td:first-child {
  width: 40px; /* Adjust as needed */
  text-align: center; /* Center the icon */
}
tbody tr:hover { background-color: #f5f5f5; }
tbody tr.clickable { cursor: pointer; user-select: none; /* Prevent text selection on click */ }
/* Removed .actions-cell style */
tbody tr.selected { background-color: #cce5ff; }
tbody tr.selected:hover { background-color: #b8daff; }
.context-menu { position: fixed; background-color: white; border: 1px solid #ccc; box-shadow: 2px 2px 5px rgba(0,0,0,0.2); z-index: 1002; min-width: 150px; }
.context-menu ul { list-style: none; padding: 5px 0; margin: 0; }
.context-menu li { padding: 8px 12px; cursor: pointer; }
.context-menu li:hover { background-color: #eee; }
.context-menu li.disabled { color: #aaa; cursor: not-allowed; background-color: white; }

/* Editor Styles */
.editor-overlay {
  position: absolute; /* Position over the file list */
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(40, 40, 40, 0.95); /* Dark semi-transparent background */
  z-index: 1000; /* Ensure it's above the file list but below popups */
  display: flex;
  flex-direction: column;
  color: #f0f0f0;
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 1rem;
  background-color: #333;
  border-bottom: 1px solid #555;
  font-size: 0.9em;
}

.close-editor-btn {
  background: none;
  border: none;
  color: #ccc;
  font-size: 1.2em;
  cursor: pointer;
  padding: 0.2rem 0.5rem;
}
.close-editor-btn:hover {
  color: white;
}

.editor-loading, .editor-error {
  padding: 2rem;
  text-align: center;
  font-size: 1.1em;
}
.editor-error {
    color: #ff8a8a;
}

.editor-actions {
    display: flex;
    align-items: center;
}

.save-btn {
    background-color: #4CAF50;
    color: white;
    border: none;
    padding: 0.4rem 0.8rem;
    margin-left: 1rem;
    cursor: pointer;
    border-radius: 3px;
    font-size: 0.9em;
}
.save-btn:disabled {
    background-color: #aaa;
    cursor: not-allowed;
}
.save-btn:hover:not(:disabled) {
    background-color: #45a049;
}

.save-status {
    margin-left: 1rem;
    font-size: 0.9em;
    padding: 0.2rem 0.5rem;
    border-radius: 3px;
}
.save-status.saving {
    color: #888;
}
.save-status.success {
    color: #4CAF50;
    background-color: #e8f5e9;
}
.save-status.error {
    color: #f44336;
    background-color: #ffebee;
}

.editor-instance {
  flex-grow: 1; /* Make editor take remaining space */
  min-height: 0; /* Important for flex-grow in flex column */
}

</style>

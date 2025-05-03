# Plan: Implement Independent Tags for Quick Commands

This plan outlines the steps to add a tagging and grouping feature for Quick Commands, ensuring the tag system is completely separate from the existing tag system used for SSH Connections.

## 1. Database Migration (`packages/backend/src/database/migrations.ts`)

*   **Goal:** Add two new tables to the database schema to manage quick command specific tags and their associations.
*   **Steps:**
    *   Analyze `migrations.ts` to understand the current migration process (Done - uses versioned migrations).
    *   Add a new migration (e.g., `id: 2`, `name: 'Create quick_command_tags table'`):
        *   SQL: `CREATE TABLE IF NOT EXISTS quick_command_tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')), updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')));`
        *   Include a `check` function using `tableExists(db, 'quick_command_tags')`.
    *   Add another new migration (e.g., `id: 3`, `name: 'Create quick_command_tag_associations table'`):
        *   SQL: `CREATE TABLE IF NOT EXISTS quick_command_tag_associations (quick_command_id INTEGER NOT NULL, tag_id INTEGER NOT NULL, PRIMARY KEY (quick_command_id, tag_id), FOREIGN KEY (quick_command_id) REFERENCES quick_commands(id) ON DELETE CASCADE, FOREIGN KEY (tag_id) REFERENCES quick_command_tags(id) ON DELETE CASCADE);`
        *   Include a `check` function using `tableExists(db, 'quick_command_tag_associations')`.

## 2. Database Schema (`packages/backend/src/database/schema.ts`)

*   **Goal:** Keep schema definitions consistent.
*   **Steps:**
    *   Add `createQuickCommandTagsTableSQL` constant with the SQL from Migration 2.
    *   Add `createQuickCommandTagAssociationsTableSQL` constant with the SQL from Migration 3.

## 3. Backend (`packages/backend`)

*   **Goal:** Create dedicated modules for managing quick command tags and integrate them with the existing quick command logic.

*   **New Module: Quick Command Tags**
    *   **`repositories/quick-command-tag.repository.ts`:**
        *   Define `QuickCommandTag` interface (`id`, `name`, `created_at`, `updated_at`).
        *   Implement CRUD functions for `quick_command_tags` table (`findAll`, `findById`, `create`, `update`, `delete`).
        *   Implement functions to manage `quick_command_tag_associations`:
            *   `setCommandTagAssociations(commandId: number, tagIds: number[]): Promise<boolean>` (Transactional: delete old, insert new).
            *   `findTagsByCommandId(commandId: number): Promise<QuickCommandTag[]>` (JOIN `quick_command_tag_associations` and `quick_command_tags`).
            *   (Optional) `addTagAssociation`, `removeTagAssociation`.
    *   **`services/quick-command-tag.service.ts`:**
        *   Inject `QuickCommandTagRepository`.
        *   Implement business logic for managing quick command tags (validation, orchestration).
    *   **`quick-command-tags/quick-command-tag.controller.ts` & `quick-command-tags/quick-command-tag.routes.ts`:**
        *   Create new API endpoints (e.g., `POST /quick-command-tags`, `GET /quick-command-tags`, `PUT /quick-command-tags/:id`, `DELETE /quick-command-tags/:id`).
        *   Inject `QuickCommandTagService`.
        *   Handle HTTP requests/responses.

*   **Modify Module: Quick Commands**
    *   **`repositories/quick-commands.repository.ts`:**
        *   Update `QuickCommand` interface (or create `QuickCommandWithTags`) to include `tagIds: number[]` (referencing `quick_command_tags.id`).
        *   Modify `getAllQuickCommands` and `findQuickCommandById`: Use `LEFT JOIN quick_command_tag_associations` and `GROUP_CONCAT` to fetch `tag_ids_str`, parse into `tagIds` array.
    *   **`services/quick-commands.service.ts`:**
        *   Inject **new** `QuickCommandTagRepository` or `QuickCommandTagService`.
        *   Modify `addQuickCommand` signature: accept `tagIds?: number[]`. Implementation: call repo `addQuickCommand`, then call **new** repo/service `setCommandTagAssociations`.
        *   Modify `updateQuickCommand` signature: accept `tagIds?: number[]`. Implementation: call repo `updateQuickCommand`, then call **new** repo/service `setCommandTagAssociations`.
        *   Modify `getAllQuickCommands` return type to include `tagIds`.
    *   **`quick-commands/quick-commands.controller.ts`:**
        *   Modify `addQuickCommand` and `updateQuickCommand` request validation to accept optional `tagIds: number[]`.
        *   Pass `tagIds` to the service layer.
        *   Ensure `getAllQuickCommands` response includes `tagIds`.

## 4. Frontend (`packages/frontend`)

*   **Goal:** Create a dedicated state management for quick command tags and update the UI to display grouped commands and allow tag selection.

*   **Types (`types/quick-commands.types.ts` or similar):**
    *   Update `QuickCommand` interface to include `tagIds: number[]`.

*   **New Store (`stores/quickCommandTags.store.ts`):**
    *   Define `QuickCommandTag` interface (matching backend).
    *   State: `tags: ref<QuickCommandTag[]>`, `isLoading`, `error`.
    *   Actions: `fetchTags` (from `/quick-command-tags`), `addTag`, `updateTag`, `deleteTag`. Include caching logic if desired.

*   **Modify Store (`stores/quickCommands.store.ts`):**
    *   Inject **new** `useQuickCommandTagsStore`.
    *   State: Add `expandedGroups: ref<Record<string, boolean>>({})`.
    *   Actions:
        *   Add `toggleGroup(groupName: string)` action (manage `expandedGroups`, potentially save to localStorage).
        *   Modify `fetchQuickCommands`: Fetch data including `tagIds` from `/quick-commands`. Remove `sortBy` API parameter.
        *   Modify `addQuickCommand`, `updateQuickCommand`: Send `tagIds` in the request body.
        *   Modify `incrementUsage`: Adjust logic if sorting is now purely frontend within groups.
    *   Getters:
        *   **Rewrite** `filteredAndSortedCommands` (or create `filteredAndGroupedCommands`):
            *   Filter `quickCommandsList` by `searchTerm`.
            *   Use `quickCommandTagsStore.tags` to group filtered commands by `tagIds` (create "Untagged" group).
            *   Sort commands *within* each group based on `sortBy` state.
            *   Sort groups (e.g., alphabetically).
            *   Return nested structure: `Array<{ groupName: string; tagId: number | null; commands: QuickCommandFE[] }>`.
        *   **Add** `flatVisibleCommands`: Compute a flat list of commands only from currently expanded groups.
    *   Keyboard Navigation Actions (`selectNextCommand`, `selectPreviousCommand`): Modify to operate on `flatVisibleCommands` and `selectedIndex`.
    *   Caching: Re-evaluate or simplify caching strategy.

*   **Modify View (`views/QuickCommandsView.vue`):**
    *   `<template>`:
        *   Use nested `v-for` to iterate through grouped data from the store.
        *   Render clickable group headers with expand/collapse icons, bound to `expandedGroups` state and `toggleGroup` action.
        *   Render command items (`<li>`) within each group.
    *   `<script>`:
        *   Inject **new** `useQuickCommandTagsStore`.
        *   Bind template to new/modified store getters (`filteredAndGroupedCommands`, `expandedGroups`).
        *   Adjust keyboard navigation highlighting based on `flatVisibleCommands` and `selectedIndex`.
        *   Modify `scrollToSelected` to find the correct DOM element based on the selected command in `flatVisibleCommands`.

*   **Modify Component (`components/AddEditQuickCommandForm.vue`):**
    *   Inject **new** `useQuickCommandTagsStore`.
    *   Add a tag selection UI component (e.g., multi-select dropdown, chip input using `TagInput.vue` if adaptable, or a new component).
        *   Populate options using `quickCommandTagsStore.tags`.
        *   Allow creating new tags (calling `quickCommandTagsStore.addTag`).
        *   Bind selected `tagIds` to form state.
    *   Modify form submission logic to include `tagIds` when calling `quickCommandsStore.add/updateQuickCommand`.
'use strict';

var obsidian = require('obsidian');

const DEFAULT_SETTINGS = {
    directoryTagMappings: []
};
class FolderTagPlugin extends obsidian.Plugin {
    async onload() {
        await this.loadSettings();
        this.addSettingTab(new FolderTagSettingTab(this.app, this));
        this.registerEvent(this.app.vault.on("create", async (file) => {
            if (file instanceof obsidian.TFile && file.extension === "md") {
                await this.applyFolderTag(file, "create");
            }
        }));
        this.registerEvent(this.app.vault.on("rename", async (file, oldPath) => {
            if (file instanceof obsidian.TFile && file.extension === "md") {
                // Handle directory rename in settings
                await this.handleDirectoryRename(oldPath, file.path);
                // Apply folder tags for the moved file
                await this.applyFolderTag(file, "move", oldPath);
            }
        }));
    }
    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }
    async saveSettings() {
        await this.saveData(this.settings);
    }
    getFolderTags(file) {
        return this.getFolderTagsFromPath(file.path);
    }
    getFolderTagsFromPath(path) {
        const normalized = obsidian.normalizePath(path);
        const parts = normalized.split("/").slice(0, -1);
        if (!parts.length)
            return [];
        // Add each directory in the path as a separate tag
        return parts.map(part => part);
    }
    parseTagsFromString(tagsString) {
        return tagsString.split(",").map(t => t.trim()).filter(t => t.length > 0);
    }
    // -------------------------
    // Handle directory rename in settings
    // -------------------------
    async handleDirectoryRename(oldPath, newPath) {
        const oldDir = obsidian.normalizePath(oldPath).split("/").slice(0, -1).join("/");
        const newDir = obsidian.normalizePath(newPath).split("/").slice(0, -1).join("/");
        // Check if directory actually changed
        if (oldDir === newDir)
            return;
        // Track if any mappings were updated
        let updated = false;
        // Update any matching directory mappings
        for (const mapping of this.settings.directoryTagMappings) {
            const normalizedMapping = obsidian.normalizePath(mapping.directory);
            // Check if the mapping matches the old directory or is a subdirectory of it
            if (normalizedMapping === oldDir || normalizedMapping.startsWith(oldDir + "/")) {
                // Replace the old directory path with the new one
                const relativePath = normalizedMapping.substring(oldDir.length);
                mapping.directory = newDir + relativePath;
                updated = true;
            }
        }
        // Save settings if any mappings were updated
        if (updated) {
            await this.saveSettings();
            new obsidian.Notice("Directory mappings updated for renamed folder");
        }
    }
    getCustomDirectoryTags(path) {
        const normalized = obsidian.normalizePath(path);
        const customTags = [];
        // Get the directory path (remove the filename)
        const dirPath = normalized.split("/").slice(0, -1).join("/");
        // Check each directory in the path against custom mappings
        for (const mapping of this.settings.directoryTagMappings) {
            const normalizedDir = obsidian.normalizePath(mapping.directory);
            // Skip empty directory mappings
            if (!normalizedDir)
                continue;
            // Check if the file is within this directory
            // Either the dir path equals the mapping directory, or it's a subdirectory
            if (dirPath === normalizedDir || dirPath.startsWith(normalizedDir + "/")) {
                customTags.push(...mapping.tags);
            }
        }
        return customTags;
    }
    getAllTags(path) {
        const folderTags = this.getFolderTagsFromPath(path);
        const customTags = this.getCustomDirectoryTags(path);
        // Combine and deduplicate tags
        const allTags = [...folderTags, ...customTags];
        return [...new Set(allTags)];
    }
    // -------------------------
    // Apply folder tags
    // -------------------------
    async applyFolderTag(file, action, oldPath) {
        const folderTags = this.getAllTags(file.path);
        if (!folderTags.length)
            return;
        await this.app.fileManager.processFrontMatter(file, yaml => {
            if (!yaml || typeof yaml !== "object")
                return;
            let existingTags = [];
            if ("tags" in yaml) {
                if (Array.isArray(yaml.tags))
                    existingTags.push(...yaml.tags.map((t) => String(t).trim()));
                else if (typeof yaml.tags === "string")
                    existingTags.push(...yaml.tags.split(",").map((t) => t.trim()));
            }
            // Remove old folder tags if moving/rerunning
            if (action === "move" && oldPath) {
                // For move: remove tags based on the old file path
                const oldTags = this.getAllTags(oldPath);
                existingTags = existingTags.filter(t => !oldTags.includes(t));
            }
            else if (action === "rerun") {
                // For rerun: remove tags based on current path (to handle setting changes)
                // This ensures tags are refreshed when depth setting changes
                const currentTags = this.getAllTags(file.path);
                existingTags = existingTags.filter(t => !currentTags.includes(t));
            }
            // Add new folder tags
            folderTags.forEach(t => { if (!existingTags.includes(t))
                existingTags.push(t); });
            yaml.tags = existingTags;
        });
    }
    // -------------------------
    // Remove tags for a specific directory mapping
    // -------------------------
    async removeTagsForMapping(mapping) {
        const files = this.app.vault.getMarkdownFiles();
        let removedCount = 0;
        for (const file of files) {
            const normalized = obsidian.normalizePath(file.path);
            const dirPath = normalized.split("/").slice(0, -1).join("/");
            const normalizedDir = obsidian.normalizePath(mapping.directory);
            // Check if file is in this directory
            if (dirPath === normalizedDir || dirPath.startsWith(normalizedDir + "/")) {
                await this.app.fileManager.processFrontMatter(file, yaml => {
                    if (!yaml || typeof yaml !== "object")
                        return;
                    let existingTags = [];
                    if ("tags" in yaml) {
                        const val = yaml.tags;
                        if (Array.isArray(val))
                            existingTags.push(...val.map(v => String(v).trim()));
                        else if (typeof val === "string")
                            existingTags.push(...val.split(",").map(v => v.trim()));
                    }
                    const originalLength = existingTags.length;
                    // Remove only the tags from this mapping
                    existingTags = existingTags.filter(t => !mapping.tags.includes(t));
                    if (existingTags.length < originalLength) {
                        removedCount++;
                    }
                    if (existingTags.length === 0)
                        delete yaml.tags;
                    else
                        yaml.tags = existingTags;
                });
            }
        }
        return removedCount;
    }
    // -------------------------
    // Apply tags for a specific directory mapping to existing notes
    // -------------------------
    async applyTagsForMapping(mapping) {
        if (!mapping.directory || mapping.tags.length === 0) {
            return 0;
        }
        const files = this.app.vault.getMarkdownFiles();
        let appliedCount = 0;
        for (const file of files) {
            const normalized = obsidian.normalizePath(file.path);
            const dirPath = normalized.split("/").slice(0, -1).join("/");
            const normalizedDir = obsidian.normalizePath(mapping.directory);
            // Check if file is in this directory
            if (dirPath === normalizedDir || dirPath.startsWith(normalizedDir + "/")) {
                await this.app.fileManager.processFrontMatter(file, yaml => {
                    if (!yaml || typeof yaml !== "object")
                        return;
                    let existingTags = [];
                    if ("tags" in yaml) {
                        const val = yaml.tags;
                        if (Array.isArray(val))
                            existingTags.push(...val.map(v => String(v).trim()));
                        else if (typeof val === "string")
                            existingTags.push(...val.split(",").map(v => v.trim()));
                    }
                    const originalLength = existingTags.length;
                    // Add tags from this mapping
                    mapping.tags.forEach(tag => {
                        if (!existingTags.includes(tag)) {
                            existingTags.push(tag);
                        }
                    });
                    if (existingTags.length > originalLength) {
                        appliedCount++;
                    }
                    yaml.tags = existingTags;
                });
            }
        }
        return appliedCount;
    }
    // -------------------------
    // Update tags when mapping tags are changed
    // -------------------------
    async updateTagsForMapping(mapping, oldTags) {
        if (!mapping.directory) {
            return 0;
        }
        const files = this.app.vault.getMarkdownFiles();
        let updatedCount = 0;
        for (const file of files) {
            const normalized = obsidian.normalizePath(file.path);
            const dirPath = normalized.split("/").slice(0, -1).join("/");
            const normalizedDir = obsidian.normalizePath(mapping.directory);
            // Check if file is in this directory
            if (dirPath === normalizedDir || dirPath.startsWith(normalizedDir + "/")) {
                await this.app.fileManager.processFrontMatter(file, yaml => {
                    if (!yaml || typeof yaml !== "object")
                        return;
                    let existingTags = [];
                    if ("tags" in yaml) {
                        const val = yaml.tags;
                        if (Array.isArray(val))
                            existingTags.push(...val.map(v => String(v).trim()));
                        else if (typeof val === "string")
                            existingTags.push(...val.split(",").map(v => v.trim()));
                    }
                    let modified = false;
                    // Remove old tags
                    const beforeRemoval = existingTags.length;
                    existingTags = existingTags.filter(t => !oldTags.includes(t));
                    if (existingTags.length < beforeRemoval) {
                        modified = true;
                    }
                    // Add new tags
                    mapping.tags.forEach(tag => {
                        if (!existingTags.includes(tag)) {
                            existingTags.push(tag);
                            modified = true;
                        }
                    });
                    if (modified) {
                        updatedCount++;
                    }
                    if (existingTags.length === 0)
                        delete yaml.tags;
                    else
                        yaml.tags = existingTags;
                });
            }
        }
        return updatedCount;
    }
    // -------------------------
    // Clean and reapply all tags (recheck all settings and apply cleanly)
    // -------------------------
    async cleanAndReapplyAllTags() {
        const files = this.app.vault.getMarkdownFiles();
        let processedCount = 0;
        for (const file of files) {
            try {
                // Remove current folder tags and reapply them
                await this.applyFolderTag(file, "rerun");
                processedCount++;
            }
            catch (e) {
                console.error("Failed to process file:", file.path, e);
            }
        }
        return processedCount;
    }
    // -------------------------
    // Complete reset: remove all plugin-generated tags and clear custom mappings
    // -------------------------
    async completeReset() {
        const files = this.app.vault.getMarkdownFiles();
        let processedCount = 0;
        for (const file of files) {
            try {
                const allTags = this.getAllTags(file.path);
                if (!allTags.length)
                    continue;
                await this.app.fileManager.processFrontMatter(file, yaml => {
                    if (!yaml || typeof yaml !== "object")
                        return;
                    let existingTags = [];
                    if ("tags" in yaml) {
                        const val = yaml.tags;
                        if (Array.isArray(val))
                            existingTags.push(...val.map(v => String(v).trim()));
                        else if (typeof val === "string")
                            existingTags.push(...val.split(",").map(v => v.trim()));
                    }
                    // Remove all plugin-generated tags
                    existingTags = existingTags.filter(t => !allTags.includes(t));
                    if (existingTags.length === 0)
                        delete yaml.tags;
                    else
                        yaml.tags = existingTags;
                });
                processedCount++;
            }
            catch (e) {
                console.error("Failed to process file:", file.path, e);
            }
        }
        // Clear all custom directory mappings
        this.settings.directoryTagMappings = [];
        await this.saveSettings();
        return processedCount;
    }
}
// -------------------------
// Confirmation Modal
// -------------------------
class ConfirmationModal extends obsidian.Modal {
    constructor(app, message, onConfirm, onCancel) {
        super(app);
        this.message = message;
        this.onConfirm = onConfirm;
        this.onCancel = onCancel;
    }
    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h2", { text: "Confirm action" });
        contentEl.createEl("p", { text: this.message });
        const buttonContainer = contentEl.createDiv({ cls: "modal-button-container" });
        const confirmBtn = buttonContainer.createEl("button", {
            text: "Confirm",
            cls: "mod-cta"
        });
        confirmBtn.addEventListener("click", () => {
            this.close();
            this.onConfirm();
        });
        const cancelBtn = buttonContainer.createEl("button", {
            text: "Cancel"
        });
        cancelBtn.addEventListener("click", () => {
            this.close();
            if (this.onCancel) {
                this.onCancel();
            }
        });
    }
    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
// -------------------------
// Settings Tab
// -------------------------
class FolderTagSettingTab extends obsidian.PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    displayDirectoryMappings(containerEl) {
        this.plugin.settings.directoryTagMappings.forEach((mapping, index) => {
            // Store original values to detect changes
            const originalDirectory = mapping.directory;
            const originalTags = [...mapping.tags];
            new obsidian.Setting(containerEl)
                .setClass("directory-mapping-item")
                .addText(text => {
                text.setPlaceholder("Directory path (e.g., parent-folder/sub-folder)")
                    .setValue(mapping.directory);
                // Handle blur event for directory path
                text.inputEl.addEventListener('blur', async () => {
                    const newDirectory = text.getValue();
                    // Check if directory actually changed
                    if (newDirectory !== originalDirectory && originalDirectory) {
                        const message = `Change directory path?\n\nOld path: "${originalDirectory}"\nNew path: "${newDirectory}"\n\nThis will remove tags from notes in the old directory and apply them to the new directory.`;
                        new ConfirmationModal(this.app, message, async () => {
                            new obsidian.Notice("Updating directory mapping...");
                            // Remove tags from old directory
                            const oldMapping = {
                                directory: originalDirectory,
                                tags: mapping.tags
                            };
                            await this.plugin.removeTagsForMapping(oldMapping);
                            // Update directory and apply to new directory
                            mapping.directory = newDirectory;
                            await this.plugin.saveSettings();
                            if (newDirectory && mapping.tags.length > 0) {
                                const appliedCount = await this.plugin.applyTagsForMapping(mapping);
                                new obsidian.Notice(`Directory updated. Tags applied to ${appliedCount} note(s).`);
                            }
                            this.display();
                        }, () => {
                            // On cancel, restore original value
                            text.setValue(originalDirectory);
                            mapping.directory = originalDirectory;
                        }).open();
                    }
                    else {
                        mapping.directory = newDirectory;
                        await this.plugin.saveSettings();
                    }
                });
            })
                .addText(text => {
                text.setPlaceholder("Tags (comma-separated, e.g., python, server-script)")
                    .setValue(mapping.tags.join(", "));
                // Handle blur event for tags
                text.inputEl.addEventListener('blur', async () => {
                    const newTagsString = text.getValue();
                    const newTags = this.plugin.parseTagsFromString(newTagsString);
                    // Check if tags actually changed
                    const tagsChanged = JSON.stringify(originalTags.sort()) !== JSON.stringify(newTags.sort());
                    if (tagsChanged && originalTags.length > 0 && mapping.directory) {
                        const message = `Update tags?\n\nOld tags: [${originalTags.join(", ")}]\nNew tags: [${newTags.join(", ")}]\n\nThis will update all notes in "${mapping.directory}".`;
                        new ConfirmationModal(this.app, message, async () => {
                            new obsidian.Notice("Updating tags in notes...");
                            mapping.tags = newTags;
                            const updatedCount = await this.plugin.updateTagsForMapping(mapping, originalTags);
                            await this.plugin.saveSettings();
                            new obsidian.Notice(`Tags updated in ${updatedCount} note(s).`);
                            this.display();
                        }, () => {
                            // On cancel, restore original value
                            text.setValue(originalTags.join(", "));
                            mapping.tags = originalTags;
                        }).open();
                    }
                    else if (tagsChanged && originalTags.length === 0 && mapping.directory && newTags.length > 0) {
                        // First time adding tags - apply to existing notes automatically without confirmation
                        new obsidian.Notice("Applying tags to existing notes...");
                        mapping.tags = newTags;
                        await this.plugin.saveSettings();
                        const appliedCount = await this.plugin.applyTagsForMapping(mapping);
                        new obsidian.Notice(`Tags applied to ${appliedCount} note(s).`);
                        this.display();
                    }
                    else {
                        mapping.tags = newTags;
                        await this.plugin.saveSettings();
                    }
                });
            })
                .addButton(btn => btn
                .setButtonText("Remove")
                .setWarning()
                .onClick(async () => {
                const mappingToRemove = mapping;
                const message = `Remove directory mapping "${mappingToRemove.directory}" → [${mappingToRemove.tags.join(", ")}]?\n\nThis will also remove these tags from all notes in this directory.`;
                new ConfirmationModal(this.app, message, async () => {
                    new obsidian.Notice("Removing tags from notes...");
                    // Remove tags from notes first
                    const removedCount = await this.plugin.removeTagsForMapping(mappingToRemove);
                    // Then remove the mapping from settings
                    this.plugin.settings.directoryTagMappings.splice(index, 1);
                    await this.plugin.saveSettings();
                    new obsidian.Notice(`Mapping removed. Tags removed from ${removedCount} note(s).`);
                    this.display();
                }).open();
            }));
        });
    }
    display() {
        const { containerEl } = this;
        containerEl.empty();
        new obsidian.Setting(containerEl).setHeading().setName("Folder to tag");
        // Custom Directory Tags Section
        new obsidian.Setting(containerEl).setHeading().setName("Custom directory tags");
        new obsidian.Setting(containerEl)
            .setName("Directory tag mappings")
            .setDesc("Add custom tags for specific directories. Example: 'php-aws-sdk' → tags: 'php, aws'");
        this.displayDirectoryMappings(containerEl);
        new obsidian.Setting(containerEl)
            .addButton(btn => btn
            .setButtonText("Add directory mapping")
            .onClick(async () => {
            this.plugin.settings.directoryTagMappings.push({
                directory: "",
                tags: []
            });
            await this.plugin.saveSettings();
            this.display();
        }));
        // New operations section
        new obsidian.Setting(containerEl).setHeading().setName("Operations");
        new obsidian.Setting(containerEl)
            .setName("Clean and reapply all tags")
            .setDesc("Rechecks all settings and directory structure, then cleanly reapplies all tags to all notes")
            .addButton(btn => btn
            .setButtonText("Clean & Reapply")
            .setCta()
            .onClick(async () => {
            new obsidian.Notice("Cleaning and reapplying all tags...");
            const processedCount = await this.plugin.cleanAndReapplyAllTags();
            new obsidian.Notice(`Tags cleaned and reapplied to ${processedCount} note(s)!`);
        }));
        new obsidian.Setting(containerEl)
            .setName("Complete reset")
            .setDesc("Removes all plugin-generated tags from all notes and clears all custom directory mappings. This action cannot be undone.")
            .addButton(btn => btn
            .setButtonText("Complete Reset")
            .setWarning()
            .onClick(async () => {
            const message = "This will remove all plugin-generated tags from all notes and clear all custom directory mappings. This action cannot be undone.\n\nAre you sure you want to proceed?";
            new ConfirmationModal(this.app, message, async () => {
                new obsidian.Notice("Performing complete reset...");
                const processedCount = await this.plugin.completeReset();
                new obsidian.Notice(`Reset complete! Tags removed from ${processedCount} note(s) and all custom mappings cleared.`);
                this.display();
            }).open();
        }));
    }
}

module.exports = FolderTagPlugin;
//# sourceMappingURL=main.js.map

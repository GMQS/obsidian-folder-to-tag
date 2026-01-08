'use strict';

var obsidian = require('obsidian');

const DEFAULT_SETTINGS = {
    folderDepth: "1",
    tagPrefix: "",
    tagSuffix: "",
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
        const { folderDepth, tagPrefix, tagSuffix } = this.settings;
        let tags = [];
        switch (folderDepth) {
            case "1":
                tags.push(tagPrefix + parts[parts.length - 1] + tagSuffix);
                break;
            case "2split":
                if (parts.length >= 2) {
                    tags.push(tagPrefix + parts[parts.length - 1] + tagSuffix);
                    tags.push(tagPrefix + parts[parts.length - 2] + tagSuffix);
                }
                else {
                    tags.push(tagPrefix + parts[parts.length - 1] + tagSuffix);
                }
                break;
            case "2single":
                if (parts.length >= 2) {
                    tags.push(tagPrefix + parts[parts.length - 2] + "/" + parts[parts.length - 1] + tagSuffix);
                }
                else {
                    tags.push(tagPrefix + parts[parts.length - 1] + tagSuffix);
                }
                break;
            case "full":
                tags.push(tagPrefix + parts.join("/") + tagSuffix);
                break;
            case "allsplit":
                // Add each directory in the path as a separate tag
                parts.forEach(part => {
                    tags.push(tagPrefix + part + tagSuffix);
                });
                break;
        }
        return tags;
    }
    parseTagsFromString(tagsString) {
        return tagsString.split(",").map(t => t.trim()).filter(t => t.length > 0);
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
    // Remove folder tags
    // -------------------------
    async removeFolderTags(file) {
        const folderTags = this.getAllTags(file.path);
        if (!folderTags.length)
            return;
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
            existingTags = existingTags.filter(t => !folderTags.includes(t));
            if (existingTags.length === 0)
                delete yaml.tags;
            else
                yaml.tags = existingTags;
        });
    }
    // -------------------------
    // Remove only custom directory tags (safe removal)
    // -------------------------
    async removeCustomDirectoryTags(file) {
        const customTags = this.getCustomDirectoryTags(file.path);
        if (!customTags.length)
            return;
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
            // Only remove custom directory tags, preserve folder-based tags
            existingTags = existingTags.filter(t => !customTags.includes(t));
            if (existingTags.length === 0)
                delete yaml.tags;
            else
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
}
// -------------------------
// Confirmation Modal
// -------------------------
class ConfirmationModal extends obsidian.Modal {
    constructor(app, message, onConfirm) {
        super(app);
        this.message = message;
        this.onConfirm = onConfirm;
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
            new obsidian.Setting(containerEl)
                .setClass("directory-mapping-item")
                .addText(text => text
                .setPlaceholder("Directory path (e.g., php-aws-sdk)")
                .setValue(mapping.directory)
                .onChange(async (value) => {
                mapping.directory = value;
                await this.plugin.saveSettings();
            }))
                .addText(text => text
                .setPlaceholder("Tags (comma-separated, e.g., php, aws)")
                .setValue(mapping.tags.join(", "))
                .onChange(async (value) => {
                mapping.tags = this.plugin.parseTagsFromString(value);
                await this.plugin.saveSettings();
            }))
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
        new obsidian.Setting(containerEl)
            .setName("Folder depth")
            .addDropdown(drop => {
            drop.addOption("1", "Depth 1")
                .addOption("2split", "Depth 2 (separate tags)")
                .addOption("2single", "Depth 2 in one tag")
                .addOption("full", "Full path")
                .addOption("allsplit", "All directories (separate tags)")
                .setValue(this.plugin.settings.folderDepth)
                .onChange(async (value) => {
                this.plugin.settings.folderDepth = value;
                await this.plugin.saveSettings();
            });
        });
        new obsidian.Setting(containerEl)
            .setName("Tag prefix")
            .addText(txt => txt
            .setValue(this.plugin.settings.tagPrefix)
            .onChange(async (value) => {
            this.plugin.settings.tagPrefix = value;
            await this.plugin.saveSettings();
        }));
        new obsidian.Setting(containerEl)
            .setName("Tag suffix")
            .addText(txt => txt
            .setValue(this.plugin.settings.tagSuffix)
            .onChange(async (value) => {
            this.plugin.settings.tagSuffix = value;
            await this.plugin.saveSettings();
        }));
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
        new obsidian.Setting(containerEl)
            .setName("Remove custom directory tags from all notes")
            .setDesc("Safely removes only custom directory tags, preserving folder-based tags")
            .addButton(btn => btn
            .setButtonText("Remove custom tags")
            .setWarning()
            .onClick(async () => {
            new obsidian.Notice("Removing custom directory tags from all notes...");
            const files = this.plugin.app.vault.getMarkdownFiles();
            for (const file of files) {
                await this.plugin.removeCustomDirectoryTags(file);
            }
            new obsidian.Notice("Custom directory tags removed!");
        }));
        new obsidian.Setting(containerEl)
            .setName("Reapply tags to all notes")
            .addButton(btn => btn
            .setButtonText("Reapply to all notes")
            .setCta()
            .onClick(async () => {
            new obsidian.Notice("Updating all notes...");
            const files = this.plugin.app.vault.getMarkdownFiles();
            for (const file of files) {
                try {
                    await this.plugin.applyFolderTag(file, "rerun");
                }
                catch (e) {
                    console.error("Failed for file:", file.path, e);
                    new obsidian.Notice(`Failed to process: ${file.path}`);
                }
            }
            new obsidian.Notice("Folder tags updated for all notes!");
        }));
        new obsidian.Setting(containerEl)
            .setName("Remove all folder tags")
            .addButton(btn => btn
            .setButtonText("Remove folder tags")
            .setCta()
            .onClick(async () => {
            new obsidian.Notice("Removing folder tags from all notes...");
            const files = this.plugin.app.vault.getMarkdownFiles();
            for (const file of files) {
                await this.plugin.removeFolderTags(file);
            }
            new obsidian.Notice("All folder tags removed!");
        }));
    }
}

module.exports = FolderTagPlugin;
//# sourceMappingURL=main.js.map

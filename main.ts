import { App, Plugin, TFile, Notice, PluginSettingTab, Setting, normalizePath, Modal } from "obsidian";

interface DirectoryTagMapping {
    directory: string;
    tags: string[];
}

interface FolderTagPluginSettings {
    folderDepth: "1" | "2split" | "2single" | "full" | "allsplit";
    tagPrefix: string;
    tagSuffix: string;
    directoryTagMappings: DirectoryTagMapping[];
}

const DEFAULT_SETTINGS: FolderTagPluginSettings = {
    folderDepth: "1",
    tagPrefix: "",
    tagSuffix: "",
    directoryTagMappings: []
};

export default class FolderTagPlugin extends Plugin {
    settings!: FolderTagPluginSettings;

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new FolderTagSettingTab(this.app, this));

        this.registerEvent(this.app.vault.on("create", async (file) => {
            if (file instanceof TFile && file.extension === "md") {
                await this.applyFolderTag(file, "create");
            }
        }));

        this.registerEvent(this.app.vault.on("rename", async (file, oldPath) => {
            if (file instanceof TFile && file.extension === "md") {
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

    private getFolderTags(file: TFile): string[] {
        return this.getFolderTagsFromPath(file.path);
    }

    private getFolderTagsFromPath(path: string): string[] {
        const normalized = normalizePath(path);
        const parts = normalized.split("/").slice(0, -1);
        if (!parts.length) return [];

        const { folderDepth, tagPrefix, tagSuffix } = this.settings;
        let tags: string[] = [];

        switch (folderDepth) {
            case "1":
                tags.push(tagPrefix + parts[parts.length - 1] + tagSuffix);
                break;
            case "2split":
                if (parts.length >= 2) {
                    tags.push(tagPrefix + parts[parts.length - 1] + tagSuffix);
                    tags.push(tagPrefix + parts[parts.length - 2] + tagSuffix);
                } else {
                    tags.push(tagPrefix + parts[parts.length - 1] + tagSuffix);
                }
                break;
            case "2single":
                if (parts.length >= 2) {
                    tags.push(tagPrefix + parts[parts.length - 2] + "/" + parts[parts.length - 1] + tagSuffix);
                } else {
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

    parseTagsFromString(tagsString: string): string[] {
        return tagsString.split(",").map(t => t.trim()).filter(t => t.length > 0);
    }

    // -------------------------
    // Handle directory rename in settings
    // -------------------------
    private async handleDirectoryRename(oldPath: string, newPath: string) {
        const oldDir = normalizePath(oldPath).split("/").slice(0, -1).join("/");
        const newDir = normalizePath(newPath).split("/").slice(0, -1).join("/");
        
        // Check if directory actually changed
        if (oldDir === newDir) return;
        
        // Track if any mappings were updated
        let updated = false;
        
        // Update any matching directory mappings
        for (const mapping of this.settings.directoryTagMappings) {
            const normalizedMapping = normalizePath(mapping.directory);
            
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
            new Notice("Directory mappings updated for renamed folder");
        }
    }

    private getCustomDirectoryTags(path: string): string[] {
        const normalized = normalizePath(path);
        const customTags: string[] = [];
        
        // Get the directory path (remove the filename)
        const dirPath = normalized.split("/").slice(0, -1).join("/");
        
        // Check each directory in the path against custom mappings
        for (const mapping of this.settings.directoryTagMappings) {
            const normalizedDir = normalizePath(mapping.directory);
            
            // Skip empty directory mappings
            if (!normalizedDir) continue;
            
            // Check if the file is within this directory
            // Either the dir path equals the mapping directory, or it's a subdirectory
            if (dirPath === normalizedDir || dirPath.startsWith(normalizedDir + "/")) {
                customTags.push(...mapping.tags);
            }
        }
        
        return customTags;
    }

    private getAllTags(path: string): string[] {
        const folderTags = this.getFolderTagsFromPath(path);
        const customTags = this.getCustomDirectoryTags(path);
        
        // Combine and deduplicate tags
        const allTags = [...folderTags, ...customTags];
        return [...new Set(allTags)];
    }

    // -------------------------
    // Apply folder tags
    // -------------------------
    async applyFolderTag(file: TFile, action: "create" | "move" | "rerun", oldPath?: string) {
        const folderTags = this.getAllTags(file.path);
        if (!folderTags.length) return;

        await this.app.fileManager.processFrontMatter(file, yaml => {
            if (!yaml || typeof yaml !== "object") return;

            let existingTags: string[] = [];
            if ("tags" in yaml) {
                if (Array.isArray(yaml.tags)) existingTags.push(...yaml.tags.map((t: string | number) => String(t).trim()));
                else if (typeof yaml.tags === "string") existingTags.push(...yaml.tags.split(",").map((t: string) => t.trim()));
            }

            // Remove old folder tags if moving/rerunning
            if (action === "move" && oldPath) {
                // For move: remove tags based on the old file path
                const oldTags = this.getAllTags(oldPath);
                existingTags = existingTags.filter(t => !oldTags.includes(t));
            } else if (action === "rerun") {
                // For rerun: remove tags based on current path (to handle setting changes)
                // This ensures tags are refreshed when depth setting changes
                const currentTags = this.getAllTags(file.path);
                existingTags = existingTags.filter(t => !currentTags.includes(t));
            }

            // Add new folder tags
            folderTags.forEach(t => { if (!existingTags.includes(t)) existingTags.push(t); });

            yaml.tags = existingTags;
        });
    }


    // -------------------------
    // Remove folder tags
    // -------------------------
    async removeFolderTags(file: TFile) {
        const folderTags = this.getAllTags(file.path);
        if (!folderTags.length) return;

        await this.app.fileManager.processFrontMatter(file, yaml => {
            if (!yaml || typeof yaml !== "object") return;

            let existingTags: string[] = [];
            if ("tags" in yaml) {
                const val = yaml.tags;
                if (Array.isArray(val)) existingTags.push(...val.map(v => String(v).trim()));
                else if (typeof val === "string") existingTags.push(...val.split(",").map(v => v.trim()));
            }

            existingTags = existingTags.filter(t => !folderTags.includes(t));

            if (existingTags.length === 0) delete yaml.tags;
            else yaml.tags = existingTags;
        });
    }

    // -------------------------
    // Remove only custom directory tags (safe removal)
    // -------------------------
    async removeCustomDirectoryTags(file: TFile) {
        const customTags = this.getCustomDirectoryTags(file.path);
        if (!customTags.length) return;

        await this.app.fileManager.processFrontMatter(file, yaml => {
            if (!yaml || typeof yaml !== "object") return;

            let existingTags: string[] = [];
            if ("tags" in yaml) {
                const val = yaml.tags;
                if (Array.isArray(val)) existingTags.push(...val.map(v => String(v).trim()));
                else if (typeof val === "string") existingTags.push(...val.split(",").map(v => v.trim()));
            }

            // Only remove custom directory tags, preserve folder-based tags
            existingTags = existingTags.filter(t => !customTags.includes(t));

            if (existingTags.length === 0) delete yaml.tags;
            else yaml.tags = existingTags;
        });
    }

    // -------------------------
    // Remove tags for a specific directory mapping
    // -------------------------
    async removeTagsForMapping(mapping: DirectoryTagMapping) {
        const files = this.app.vault.getMarkdownFiles();
        let removedCount = 0;

        for (const file of files) {
            const normalized = normalizePath(file.path);
            const dirPath = normalized.split("/").slice(0, -1).join("/");
            const normalizedDir = normalizePath(mapping.directory);

            // Check if file is in this directory
            if (dirPath === normalizedDir || dirPath.startsWith(normalizedDir + "/")) {
                await this.app.fileManager.processFrontMatter(file, yaml => {
                    if (!yaml || typeof yaml !== "object") return;

                    let existingTags: string[] = [];
                    if ("tags" in yaml) {
                        const val = yaml.tags;
                        if (Array.isArray(val)) existingTags.push(...val.map(v => String(v).trim()));
                        else if (typeof val === "string") existingTags.push(...val.split(",").map(v => v.trim()));
                    }

                    const originalLength = existingTags.length;
                    // Remove only the tags from this mapping
                    existingTags = existingTags.filter(t => !mapping.tags.includes(t));

                    if (existingTags.length < originalLength) {
                        removedCount++;
                    }

                    if (existingTags.length === 0) delete yaml.tags;
                    else yaml.tags = existingTags;
                });
            }
        }

        return removedCount;
    }

    // -------------------------
    // Apply tags for a specific directory mapping to existing notes
    // -------------------------
    async applyTagsForMapping(mapping: DirectoryTagMapping) {
        if (!mapping.directory || mapping.tags.length === 0) {
            return 0;
        }

        const files = this.app.vault.getMarkdownFiles();
        let appliedCount = 0;

        for (const file of files) {
            const normalized = normalizePath(file.path);
            const dirPath = normalized.split("/").slice(0, -1).join("/");
            const normalizedDir = normalizePath(mapping.directory);

            // Check if file is in this directory
            if (dirPath === normalizedDir || dirPath.startsWith(normalizedDir + "/")) {
                await this.app.fileManager.processFrontMatter(file, yaml => {
                    if (!yaml || typeof yaml !== "object") return;

                    let existingTags: string[] = [];
                    if ("tags" in yaml) {
                        const val = yaml.tags;
                        if (Array.isArray(val)) existingTags.push(...val.map(v => String(v).trim()));
                        else if (typeof val === "string") existingTags.push(...val.split(",").map(v => v.trim()));
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
    async updateTagsForMapping(mapping: DirectoryTagMapping, oldTags: string[]) {
        if (!mapping.directory) {
            return 0;
        }

        const files = this.app.vault.getMarkdownFiles();
        let updatedCount = 0;

        for (const file of files) {
            const normalized = normalizePath(file.path);
            const dirPath = normalized.split("/").slice(0, -1).join("/");
            const normalizedDir = normalizePath(mapping.directory);

            // Check if file is in this directory
            if (dirPath === normalizedDir || dirPath.startsWith(normalizedDir + "/")) {
                await this.app.fileManager.processFrontMatter(file, yaml => {
                    if (!yaml || typeof yaml !== "object") return;

                    let existingTags: string[] = [];
                    if ("tags" in yaml) {
                        const val = yaml.tags;
                        if (Array.isArray(val)) existingTags.push(...val.map(v => String(v).trim()));
                        else if (typeof val === "string") existingTags.push(...val.split(",").map(v => v.trim()));
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

                    if (existingTags.length === 0) delete yaml.tags;
                    else yaml.tags = existingTags;
                });
            }
        }

        return updatedCount;
    }
}

// -------------------------
// Confirmation Modal
// -------------------------
class ConfirmationModal extends Modal {
    message: string;
    onConfirm: () => void;
    onCancel?: () => void;

    constructor(app: App, message: string, onConfirm: () => void, onCancel?: () => void) {
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
class FolderTagSettingTab extends PluginSettingTab {
    plugin: FolderTagPlugin;

    constructor(app: App, plugin: FolderTagPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    displayDirectoryMappings(containerEl: HTMLElement): void {
        this.plugin.settings.directoryTagMappings.forEach((mapping, index) => {
            // Store original values to detect changes
            const originalDirectory = mapping.directory;
            const originalTags = [...mapping.tags];
            
            const setting = new Setting(containerEl)
                .setClass("directory-mapping-item")
                .addText(text => {
                    text.setPlaceholder("Directory path (e.g., php-aws-sdk)")
                        .setValue(mapping.directory);
                    
                    // Handle blur event for directory path
                    text.inputEl.addEventListener('blur', async () => {
                        const newDirectory = text.getValue();
                        
                        // Check if directory actually changed
                        if (newDirectory !== originalDirectory && originalDirectory) {
                            const message = `Change directory path?\n\nOld path: "${originalDirectory}"\nNew path: "${newDirectory}"\n\nThis will remove tags from notes in the old directory and apply them to the new directory.`;
                            
                            new ConfirmationModal(this.app, message, async () => {
                                new Notice("Updating directory mapping...");
                                
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
                                    new Notice(`Directory updated. Tags applied to ${appliedCount} note(s).`);
                                }
                                
                                this.display();
                            }, () => {
                                // On cancel, restore original value
                                text.setValue(originalDirectory);
                                mapping.directory = originalDirectory;
                            }).open();
                        } else {
                            mapping.directory = newDirectory;
                            await this.plugin.saveSettings();
                        }
                    });
                })
                .addText(text => {
                    text.setPlaceholder("Tags (comma-separated, e.g., php, aws)")
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
                                new Notice("Updating tags in notes...");
                                mapping.tags = newTags;
                                const updatedCount = await this.plugin.updateTagsForMapping(mapping, originalTags);
                                await this.plugin.saveSettings();
                                new Notice(`Tags updated in ${updatedCount} note(s).`);
                                this.display();
                            }, () => {
                                // On cancel, restore original value
                                text.setValue(originalTags.join(", "));
                                mapping.tags = originalTags;
                            }).open();
                        } else if (tagsChanged && originalTags.length === 0 && mapping.directory && newTags.length > 0) {
                            // First time adding tags - apply to existing notes
                            const message = `Apply tags to existing notes?\n\nTags: [${newTags.join(", ")}]\n\nThis will add these tags to all notes in "${mapping.directory}".`;
                            
                            new ConfirmationModal(this.app, message, async () => {
                                new Notice("Applying tags to existing notes...");
                                mapping.tags = newTags;
                                await this.plugin.saveSettings();
                                const appliedCount = await this.plugin.applyTagsForMapping(mapping);
                                new Notice(`Tags applied to ${appliedCount} note(s).`);
                                this.display();
                            }, () => {
                                // On cancel, restore original value
                                text.setValue(originalTags.join(", "));
                                mapping.tags = originalTags;
                            }).open();
                        } else {
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
                            new Notice("Removing tags from notes...");
                            
                            // Remove tags from notes first
                            const removedCount = await this.plugin.removeTagsForMapping(mappingToRemove);
                            
                            // Then remove the mapping from settings
                            this.plugin.settings.directoryTagMappings.splice(index, 1);
                            await this.plugin.saveSettings();
                            
                            new Notice(`Mapping removed. Tags removed from ${removedCount} note(s).`);
                            this.display();
                        }).open();
                    })
                );
        });
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        new Setting(containerEl).setHeading().setName("Folder to tag");

        new Setting(containerEl)
            .setName("Folder depth")
            .addDropdown(drop => {
                drop.addOption("1", "Depth 1")
                    .addOption("2split", "Depth 2 (separate tags)")
                    .addOption("2single", "Depth 2 in one tag")
                    .addOption("full", "Full path")
                    .addOption("allsplit", "All directories (separate tags)")
                    .setValue(this.plugin.settings.folderDepth)
                    .onChange(async value => {
                        this.plugin.settings.folderDepth = value as FolderTagPluginSettings["folderDepth"];
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName("Tag prefix")
            .addText(txt => txt
                .setValue(this.plugin.settings.tagPrefix)
                .onChange(async value => {
                    this.plugin.settings.tagPrefix = value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName("Tag suffix")
            .addText(txt => txt
                .setValue(this.plugin.settings.tagSuffix)
                .onChange(async value => {
                    this.plugin.settings.tagSuffix = value;
                    await this.plugin.saveSettings();
                })
            );

        // Custom Directory Tags Section
        new Setting(containerEl).setHeading().setName("Custom directory tags");
        
        new Setting(containerEl)
            .setName("Directory tag mappings")
            .setDesc("Add custom tags for specific directories. Example: 'php-aws-sdk' → tags: 'php, aws'");

        this.displayDirectoryMappings(containerEl);

        new Setting(containerEl)
            .addButton(btn => btn
                .setButtonText("Add directory mapping")
                .onClick(async () => {
                    this.plugin.settings.directoryTagMappings.push({
                        directory: "",
                        tags: []
                    });
                    await this.plugin.saveSettings();
                    this.display();
                })
            );

        new Setting(containerEl)
            .setName("Remove custom directory tags from all notes")
            .setDesc("Safely removes only custom directory tags, preserving folder-based tags")
            .addButton(btn => btn
                .setButtonText("Remove custom tags")
                .setWarning()
                .onClick(async () => {
                    new Notice("Removing custom directory tags from all notes...");
                    const files = this.plugin.app.vault.getMarkdownFiles();
                    for (const file of files) {
                        await this.plugin.removeCustomDirectoryTags(file);
                    }
                    new Notice("Custom directory tags removed!");
                })
            );

        new Setting(containerEl)
            .setName("Reapply tags to all notes")
            .addButton(btn => btn
                .setButtonText("Reapply to all notes")
                .setCta()
                .onClick(async () => {
                    new Notice("Updating all notes...");
                    const files = this.plugin.app.vault.getMarkdownFiles();
                    for (const file of files) {
                        try {
                            await this.plugin.applyFolderTag(file, "rerun");
                        } catch (e) {
                            console.error("Failed for file:", file.path, e);
                            new Notice(`Failed to process: ${file.path}`);
                        }
                    }
                    new Notice("Folder tags updated for all notes!");
                })
            );


        new Setting(containerEl)
            .setName("Remove all folder tags")
            .addButton(btn => btn
                .setButtonText("Remove folder tags")
                .setCta()
                .onClick(async () => {
                    new Notice("Removing folder tags from all notes...");
                    const files = this.plugin.app.vault.getMarkdownFiles();
                    for (const file of files) {
                        await this.plugin.removeFolderTags(file);
                    }
                    new Notice("All folder tags removed!");
                })
            );
    }
}

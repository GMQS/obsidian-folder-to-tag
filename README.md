# Folder to Tag Obsidian Plugin

Automatically tags notes in Obsidian based on the folder they are stored in.
Ideal for users who organize notes by folder but want to leverage tags for easier searching, linking, and graph view.

---

## Features

* Automatically adds tags that match **all folders** in the path of each note in frontmatter (each directory becomes a separate tag).
* **Custom directory tags**: Assign specific tags to any directory (e.g., `php-aws-sdk` directory gets both `php` and `aws` tags).
* Updates tags when notes are **moved or renamed**.
* Preserves all other frontmatter fields (aliases, dates, custom properties, etc.).
* Compatible with existing frontmatter that do or do not have `tags:`.
* Optional **prefix** and **suffix** for tags.
* **Clean and reapply**: Rechecks all settings and directory structure, then cleanly reapplies all tags.
* **Complete reset**: Removes all plugin-generated tags and clears custom directory mappings.

---

## Tag Behavior

All directories in the path are added as separate tags:

| Note path                                          | Generated tags                                      |
| -------------------------------------------------- | --------------------------------------------------- |
| `note.md`                                          | (no tags - note is in root)                         |
| `folder/note.md`                                   | `#folder`                                           |
| `main-folder/sub-folder/note.md`                   | `#main-folder`, `#sub-folder`                       |
| `main-folder/sub-folder/last-folder/note.md`       | `#main-folder`, `#sub-folder`, `#last-folder`       |

You can also optionally add a **prefix** or **suffix** to all folder tags, e.g., `prefix-` → `#prefix-folder`.

---

## Custom Directory Tags

In addition to automatic folder-based tags, you can define custom tag mappings for specific directories:

* **Example**: Map the `php-aws-sdk` directory to tags `php` and `aws`
* **Multiple tags**: Each directory can have multiple tags assigned
* **Subdirectories**: Custom tags apply to all notes in the directory and its subdirectories
* **Consistency**: When notes are moved or settings change, tags are automatically updated

### How to use:
1. Go to the plugin settings
2. Under "Custom directory tags", click "Add directory mapping"
3. Enter the directory path (e.g., `php-aws-sdk`)
4. Enter tags separated by commas (e.g., `php, aws`)
5. Click "Reapply tags to all notes" to update existing notes

---

## Settings

### Tag Prefix and Suffix
Add an optional prefix or suffix to all automatically-generated folder tags.
- **Prefix**: Text added before each folder name (e.g., `folder/` → `#folder/`)
- **Suffix**: Text added after each folder name (e.g., `/folder` → `#/folder`)

### Custom Directory Tags
Map specific directories to custom tags. These tags are applied in addition to the automatic folder-based tags.

### Operations

#### Clean and Reapply All Tags
Rechecks all settings and directory structure, then cleanly reapplies all tags to all notes. Use this to:
- Update tags after changing prefix/suffix settings
- Fix any inconsistencies in your tags
- Ensure all notes have the correct tags

#### Complete Reset
Removes all plugin-generated tags from all notes and clears all custom directory mappings. **This action cannot be undone.**

Use this when you want to start fresh or before uninstalling the plugin.

---

## Usage

* When a new note is created, the plugin automatically adds folder tag(s) to the `tags:` property.
* If a note is moved or renamed, the plugin updates its tag(s) to match the new folder path.
* Use the settings tab to configure prefixes, suffixes, and custom directory mappings.
* Use "Clean and Reapply All Tags" to update all notes after changing settings.
* Use "Complete Reset" to remove all plugin-generated tags before uninstalling.

---

## License

This plugin is released under the [GNU GPL v3](LICENSE).

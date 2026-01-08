# Folder to Tag Obsidian Plugin

Automatically tags notes in Obsidian based on the folder they are stored in.
Ideal for users who organize notes by folder but want to leverage tags for easier searching, linking, and graph view.

---

## Features

* Automatically adds a tag that matches the folder(s) of each note in frontmatter.
* **Custom directory tags**: Assign specific tags to any directory (e.g., `php-aws-sdk` directory gets both `php` and `aws` tags).
* Updates tags when notes are **moved or renamed**.
* Preserves all other frontmatter fields (aliases, dates, custom properties, etc.).
* Compatible with existing frontmatter that do or do not have `tags:`.
* Configurable **folder depth** and **tag formatting**.
* Optional **prefix** and **suffix** for tags.

---

## Folder Depth Options

Choose how many folder levels to include in tags:

| Option                     | Example (note path: `main-folder/sub-folder/last-folder/note.md`) |
| -------------------------- | ----------------------------------------------------------------- |
| Default (1)                | `#last-folder`                                                    |
| Depth 2 (split)            | `#last-folder + #sub-folder`                                      |
| Depth 2 (single)           | `#sub-folder/last-folder`                                         |
| Full path                  | `#main-folder/sub-folder/last-folder`                             |
| All directories (separate) | `#main-folder + #sub-folder + #last-folder`                       |

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

## Usage

* When a new note is created, the plugin automatically adds folder tag(s) to the `tags:` property.
* If a note is moved or renamed, the plugin updates its tag(s) to match the new folder path.
* Use the settings tab to:

  * **Reapply tags to all notes**: Updates all notes with the correct folder tags in frontmatter.
  * **Remove all folder tags**: Removes any tag matching the note’s folder from the frontmatter `tags:` property. Preserving any other frontmatter (including other tags).

---

## License

This plugin is released under the [GNU GPL v3](LICENSE).
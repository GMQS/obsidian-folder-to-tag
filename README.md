# Folder to Tag Obsidian Plugin

Automatically tags notes in Obsidian based on the folder they are stored in.  
Ideal for users who organize notes by folder but want to leverage tags for easier searching, linking, and graph view.

Supports both **YAML frontmatter** (`tags:`) and **inline tags** (`tags::`) and updates tags when notes are moved or renamed.

---

## Features

- Automatically adds a tag that matches the folder(s) of each note.
- Updates tags when notes are **moved or renamed**.
- Preserves all other frontmatter fields (aliases, dates, custom properties, etc.).
- Compatible with existing notes without folder tags.
- Configurable **folder depth** and **tag formatting**.
- Optional **prefix** and **suffix** for tags.
- Provides a settings tab with:
  - Override existing tags style.
  - Default tag style (`YAML frontmatter` or `Inline`).
  - Reapply folder tags to all notes.
  - Remove all folder tags.

---

## Folder Depth Options

Choose how many folder levels to include in tags:

| Option       | Example (note path: `main-folder/sub-folder/last-folder/note.md`) |
|--------------|------------------------------------------------------|
| Default (1)  | `#last-folder`                                         |
| Depth 2 (split) | `#last-folder + #sub-folder`                        |
| Depth 2 (single) | `#sub-folder/last-folder`                            |
| Full path    | `#main-folder/sub-folder/last-folder`                        |

You can also optionally add a **prefix** or **suffix** to all folder tags, e.g., `prefix-` → `#prefix-folder`.

---

## Usage

- When a new note is created, the plugin automatically adds a folder tag.
- If a note is moved or renamed, the plugin updates its tag to match the new folder.
- Use the settings tab to:
  - **Reapply tags to all notes**: Update all existing notes with the correct folder tags.
  - **Remove all folder tags**: Removes any tag that matches the note’s folder name (useful to undo plugin changes).

---

## Settings

- **Override existing tags style**: Forces all tags to follow your chosen style, even on notes with existing tags.
- **Default tag style**: Choose YAML frontmatter or inline tags (effective only if override is enabled).
- **Folder Depth**: Configure how many folder levels are used in tags.
- **Tag Prefix / Suffix**: Optional strings added to the start/end of all folder tags.
- **Reapply tags to all notes**: Updates all notes with the correct folder tags.
- **Remove all folder tags**: Removes any folder-named tags from notes.

---

## License

This plugin is released under the [GNU GPL v3](LICENSE).

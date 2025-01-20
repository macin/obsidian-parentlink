# ParentLink for Obsidian

A plugin for [Obsidian](https://obsidian.md) that automatically manages parent-child relationships between notes based on folder structure.

## Features

- Automatically adds parent links to notes based on folder structure
- Supports folder notes (notes with the same name as their parent folder)
- Updates links when files are moved or renamed
- Configurable allowed paths to limit where the plugin operates
- Detailed logging for troubleshooting

## How it Works

1. When you create a note in a folder, the plugin looks for a "folder note" (a note with the same name as the folder)
2. If found, it adds a parent link in the frontmatter pointing to that folder note
3. For folder notes themselves, it looks for a grandparent folder note
4. These relationships are maintained automatically as files are moved or renamed

## Usage

### Basic Usage
1. Enable the plugin in Obsidian settings
2. Create a folder note (e.g., "Projects/Projects.md")
3. Create notes in that folder
4. The plugin will automatically add parent links in the frontmatter

### Configuration
- **Enable/Disable**: Toggle the plugin on/off
- **Detailed Logs**: Enable for troubleshooting
- **Allowed Paths**: Specify which folders the plugin should operate in
- **Refresh**: Manually update parent links for a specific folder

### Example Structure
```
Projects/
  Projects.md (folder note)
  Project A.md (will link to Projects.md)
  Project B.md (will link to Projects.md)
  Subproject/
    Subproject.md (folder note, will link to Projects.md)
    Task 1.md (will link to Subproject.md)
```

## Installation

### From Obsidian
1. Open Settings > Community plugins
2. Turn off Safe mode
3. Click Browse community plugins
4. Search for "ParentLink"
5. Click Install
6. Enable the plugin

### Manual Installation
1. Download the latest release
2. Extract files to your vault's `.obsidian/plugins/parentlink/` folder
3. Reload Obsidian
4. Enable the plugin in Settings > Community plugins

## Support

- [GitHub Issues](https://github.com/macinr/obsidian-parentlink/issues)
- [GitHub Discussions](https://github.com/macinr/obsidian-parentlink/discussions)

## License

[MIT License](LICENSE)
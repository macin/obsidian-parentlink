import {
  App,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  TFolder,
  MetadataCache,
  FrontMatterCache,
} from "obsidian";

interface ParentLinkSettings {
  enabled: boolean;
  detailedLogs: boolean;
  lastRefreshedFolder?: string;  // Add this to store last used folder
  allowedPaths: string[];  // Add this for path filtering
}

const DEFAULT_SETTINGS: ParentLinkSettings = {
  enabled: true,
  detailedLogs: false,
  allowedPaths: [],  // Default to empty array (all paths allowed)
};

export default class ParentLink extends Plugin {
  settings: ParentLinkSettings;

  async onload() {
    await this.loadSettings();

    // Register event handlers (they will check settings.enabled internally)
    this.registerEvents();

    // Add settings tab
    this.addSettingTab(new ParentLinkSettingTab(this.app, this));
  }

  private registerEvents() {
    // Monitor file creation
    this.registerEvent(
      this.app.vault.on("create", async (file) => {
        if (file instanceof TFile && this.settings.enabled) {
          await this.updateParentLink(file);
        }
      })
    );

    // Monitor file moves/renames
    this.registerEvent(
      this.app.vault.on("rename", async (file, oldPath) => {
        if (!this.settings.enabled) return;

        if (file instanceof TFile) {
          // Update the renamed file
          await this.updateParentLink(file);
          
          // If this is a folder note, update all notes in that folder
          const isFolderNote = file.basename === file.parent?.name;
          if (isFolderNote) {
            if (this.settings.detailedLogs) {
              console.log(`Folder note renamed, updating child notes in ${file.parent?.path}`);
            }
            
            // Get all files in the folder
            const childFiles = this.app.vault.getMarkdownFiles()
              .filter(f => f.parent?.path === file.parent?.path && f !== file);
              
            // Update each child file
            for (const childFile of childFiles) {
              if (this.settings.detailedLogs) {
                console.log(`Updating child note: ${childFile.path}`);
              }
              await this.updateParentLink(childFile);
            }
          }
        } else if (file instanceof TFolder) {
          await this.handleFolderRename(file);
        }
      })
    );

    // Monitor external changes
    this.registerEvent(
      this.app.vault.on("modify", async (file) => {
        if (!this.settings.enabled || !(file instanceof TFile)) return;

        // Get the current frontmatter
        const cache = this.app.metadataCache.getFileCache(file);
        const frontmatter = cache?.frontmatter;

        // Only process if this is a folder note and the frontmatter doesn't have a parent field
        // or if the parent field exists but is empty/invalid
        const isFolderNote = file.basename === file.parent?.name;
        if (isFolderNote && (!frontmatter?.parent || frontmatter.parent === '')) {
          // Update all files in the folder
          if (this.settings.detailedLogs) {
            console.log(`Folder note modified externally: ${file.path}, updating children`);
          }
          await this.handleFolderRename(file.parent);
        }
      })
    );
  }

  async processAllFiles() {
    if (this.settings.detailedLogs) {
      console.log("Starting to process all files...");
      const files = this.app.vault.getMarkdownFiles();
      console.log(`Found ${files.length} markdown files`);
    }
    
    const files = this.app.vault.getMarkdownFiles();
    for (const file of files) {
      if (this.settings.detailedLogs) {
        console.log(`Processing file: ${file.path}`);
      }
      await this.updateParentLink(file);
    }
    new Notice("ParentLink: Finished processing all files");
  }

  async updateParentLink(file: TFile) {
    try {
      // Check if path is allowed
      if (this.settings.allowedPaths.length > 0) {
        const isAllowed = this.settings.allowedPaths.some(allowedPath => 
          file.path.startsWith(allowedPath) || 
          // Also check parent folder for folder notes
          (file.parent?.path || '').startsWith(allowedPath)
        );
        
        if (!isAllowed) {
          if (this.settings.detailedLogs) {
            console.log(`${file.path} - skipped (not in allowed paths)`);
          }
          return;
        }
      }

      // Get parent folder
      const parentFolder = file.parent;
      if (!parentFolder) {
        if (this.settings.detailedLogs) {
          console.log(`${file.path} - skipped (no parent folder)`);
        }
        return;
      }

      let parentNote: TFile | null = null;
      
      // Check if this is a folder note (name matches parent folder exactly)
      const isFolderNote = file.basename === parentFolder.name;
      
      // If this is a folder note but the case doesn't match, skip it
      if (file.basename.toLowerCase() === parentFolder.name.toLowerCase() && !isFolderNote) {
        if (this.settings.detailedLogs) {
          console.log(`${file.path} - skipped (folder note name case doesn't match folder name)`);
        }
        return;
      }
      
      if (isFolderNote) {
        // For folder notes, look for a note matching the grandparent folder
        const grandparentFolder = parentFolder.parent;
        if (grandparentFolder) {
          // Find a note that exactly matches the grandparent folder name
          parentNote = this.app.vault
            .getMarkdownFiles()
            .find((f) => 
              f.basename === grandparentFolder.name && 
              f.parent?.path === grandparentFolder.path &&
              f !== file
            );
        }
      } else {
        // For regular notes, look for a note matching the parent folder
        // Find a note that exactly matches the parent folder name
        parentNote = this.app.vault
          .getMarkdownFiles()
          .find((f) => 
            f.basename === parentFolder.name && 
            f.parent?.path === parentFolder.path &&
            f !== file
          );
      }

      if (!parentNote) {
        const targetFolder = isFolderNote ? parentFolder.parent?.name : parentFolder.name;
        if (this.settings.detailedLogs) {
          console.log(`${file.path} - skipped (no matching parent note for folder ${targetFolder})`);
        }
        return;
      }

      // Get the current frontmatter
      const cache = this.app.metadataCache.getFileCache(file);
      const currentParent = cache?.frontmatter?.parent;

      // Only update if the parent field doesn't exist or is different
      const newParent = "[[" + parentNote.name.replace('.md', '') + "]]";
      if (currentParent !== newParent) {
        await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
          frontmatter.parent = newParent;
          if (this.settings.detailedLogs) {
            console.log(`${file.path} - frontmatter updated with parent: ${newParent}`);
          }
        });
      } else if (this.settings.detailedLogs) {
        console.log(`${file.path} - skipped (parent already set correctly)`);
      }
    } catch (error) {
      console.error(`${file.path} - error updating parent link:`, error);
      new Notice(`Error updating parent link for ${file.path}`);
    }
  }

  onunload() {
    if (this.settings.detailedLogs) {
      console.log("unloading plugin");
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async handleFolderRename(folder: TFolder) {
    if (this.settings.detailedLogs) {
      console.log(`Folder renamed/modified: ${folder.path}, updating all files inside`);
    }

    // Get all markdown files in this folder and subfolders
    const filesInFolder = this.app.vault.getMarkdownFiles()
        .filter(f => {
          // For root folder, process all files
          if (folder.isRoot()) {
            return true;
          }
          // For other folders, only process files in that folder
          return f.path.startsWith(folder.path + '/');
        });

    // Update each file
    for (const childFile of filesInFolder) {
        await this.updateParentLink(childFile);
    }

    // Also update the folder note if it exists (skip for root folder)
    if (!folder.isRoot()) {
        const folderNote = this.app.vault.getMarkdownFiles()
            .find(f => f.basename === folder.name && 
                      f.parent?.path === folder.path);
        
        if (folderNote) {
            if (this.settings.detailedLogs) {
                console.log(`Updating folder note: ${folderNote.path}`);
            }
            await this.updateParentLink(folderNote);
        }
    }
  }
}

class ParentLinkSettingTab extends PluginSettingTab {
  plugin: ParentLink;
  private folderInputEl: HTMLInputElement;
  private suggestionContainer: HTMLDivElement;
  private allowedPathsContainer: HTMLDivElement;

  constructor(app: App, plugin: ParentLink) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const {containerEl} = this;
    containerEl.empty();
    containerEl.createEl("h2", {text: "Parent Link Settings"});

    // Basic settings (enabled and logs)
    this.addBasicSettings(containerEl);
    
    // Folder refresh setting
    this.addFolderRefreshSetting(containerEl);

    // Allowed paths section
    containerEl.createEl("h3", {text: "Allowed Paths"});
    containerEl.createEl("p", {
      text: "Specify paths where the plugin should work. Leave empty to allow all paths.",
      cls: "setting-item-description"
    });

    // Container for allowed paths
    this.allowedPathsContainer = containerEl.createDiv({ cls: "parent-link-allowed-paths" });

    // Add button for new path
    const addButton = new Setting(containerEl)
      .addButton(button => button
        .setButtonText("Add Path")
        .setClass("mod-setting-button")
        .onClick(() => {
          this.addAllowedPathInput();
        }));

    // Add existing paths
    if (this.plugin.settings.allowedPaths.length === 0) {
      this.addAllowedPathInput(); // Add one empty input by default
    } else {
      this.plugin.settings.allowedPaths.forEach(path => {
        this.addAllowedPathInput(path);
      });
    }

    // Update styles
    containerEl.createEl("style", {
      text: `
        .parent-link-input-container {
          position: relative;
          flex: 1;
        }
        .parent-link-input-container input {
          width: 100%;
          padding: 6px 12px;
          height: var(--input-height);
          background: var(--background-modifier-form-field);
          border: var(--input-border-width) solid var(--background-modifier-border);
          color: var(--text-normal);
          border-radius: var(--radius-s);
          font-size: var(--font-ui-small);
        }
        .parent-link-suggestion-container {
          position: absolute;
          width: 100%;
          max-height: 200px;
          overflow-y: auto;
          background: var(--background-primary);
          border: 1px solid var(--background-modifier-border);
          z-index: 100;
          border-radius: var(--radius-s);
          box-shadow: var(--shadow-s);
          margin-top: 4px;
        }
        .parent-link-suggestion {
          padding: 8px 12px;
          cursor: pointer;
          font-size: var(--font-ui-small);
        }
        .parent-link-suggestion:hover,
        .parent-link-suggestion.is-selected {
          background: var(--background-modifier-hover);
          color: var(--text-accent);
        }
        .parent-link-allowed-path {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
          width: 100%;
          padding: 0 20px;
        }
        .parent-link-remove-button {
          padding: 0;
          background: var(--background-modifier-error);
          border: none;
          color: var(--text-on-accent);
          border-radius: var(--radius-s);
          cursor: pointer;
          height: var(--input-height);
          width: var(--input-height);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
        }
        .parent-link-remove-button:hover {
          background: var(--background-modifier-error-hover);
        }
        .parent-link-allowed-paths {
          width: 100%;
          margin-bottom: 12px;
        }
        .setting-item.mod-setting-button {
          padding-left: 20px;
          padding-right: 20px;
        }
      `
    });
  }

  private addBasicSettings(containerEl: HTMLElement) {
    new Setting(containerEl)
      .setName("Enable automatic parent linking")
      .setDesc("Automatically add parent links to files when they are created or moved")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enabled)
        .onChange(async (value) => {
          this.plugin.settings.enabled = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Enable detailed logs")
      .setDesc("Show additional processing details in the console")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.detailedLogs)
        .onChange(async (value) => {
          this.plugin.settings.detailedLogs = value;
          await this.plugin.saveSettings();
        }));
  }

  private addAllowedPathInput(initialValue: string = "") {
    const container = this.allowedPathsContainer.createDiv({ cls: "parent-link-allowed-path" });
    
    // Create input with autocomplete
    const inputContainer = container.createDiv({ cls: "parent-link-input-container" });
    const input = inputContainer.createEl("input", {
      type: "text",
      value: initialValue,
      placeholder: "Type folder path..."
    });
    
    // Create suggestions container
    const suggestionContainer = inputContainer.createDiv({ 
      cls: "parent-link-suggestion-container" 
    });
    suggestionContainer.style.display = "none";

    // Add remove button
    const removeButton = container.createEl("button", {
      text: "×",
      title: "Remove path",
      cls: "parent-link-remove-button"
    });
    removeButton.onclick = () => {
      container.remove();
      this.saveAllowedPaths();
    };

    let selectedIndex = -1;
    const handleKeydown = (event: KeyboardEvent) => {
      const suggestions = suggestionContainer.children;
      if (suggestions.length === 0) return;

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        
        // Update selected index
        if (event.key === "ArrowDown") {
          selectedIndex = (selectedIndex + 1) % suggestions.length;
        } else {
          selectedIndex = selectedIndex <= 0 ? suggestions.length - 1 : selectedIndex - 1;
        }

        // Update visual selection
        Array.from(suggestions).forEach((el, i) => {
          el.classList.toggle("is-selected", i === selectedIndex);
        });
      } else if (event.key === "Enter" && selectedIndex >= 0) {
        event.preventDefault();
        const selectedSuggestion = suggestions[selectedIndex] as HTMLElement;
        input.value = selectedSuggestion.textContent || "";
        suggestionContainer.style.display = "none";
        selectedIndex = -1;
        this.saveAllowedPaths();
      } else if (event.key === "Escape") {
        suggestionContainer.style.display = "none";
        selectedIndex = -1;
      }
    };

    // Add input handler for autocomplete
    input.addEventListener("input", () => {
      selectedIndex = -1;  // Reset selection on new input
      this.updatePathSuggestions(input, suggestionContainer);
      this.saveAllowedPaths();
    });

    input.addEventListener("focus", () => {
      this.updatePathSuggestions(input, suggestionContainer);
    });

    input.addEventListener("blur", () => {
      // Delay hiding suggestions to allow for clicks
      setTimeout(() => {
        suggestionContainer.style.display = "none";
        selectedIndex = -1;
      }, 200);
    });

    input.addEventListener("keydown", handleKeydown);
  }

  private updatePathSuggestions(input: HTMLInputElement, suggestionContainer: HTMLElement) {
    const inputValue = input.value.toLowerCase();
    const folders = this.getAllFolders();
    const suggestions = folders.filter(f => 
      f.path.toLowerCase().contains(inputValue)
    );

    suggestionContainer.empty();
    
    if (suggestions.length > 0 && inputValue) {
      suggestionContainer.style.display = "block";
      suggestions.forEach(folder => {
        const suggestionEl = suggestionContainer.createDiv({
          cls: "parent-link-suggestion",
          text: folder.path
        });
        suggestionEl.onmousedown = () => {
          input.value = folder.path;
          suggestionContainer.style.display = "none";
          this.saveAllowedPaths();
        };
      });
    } else {
      suggestionContainer.style.display = "none";
    }
  }

  private saveAllowedPaths() {
    const inputs = this.allowedPathsContainer.querySelectorAll("input");
    const paths = Array.from(inputs)
      .map(input => input.value.trim())
      .filter(path => path.length > 0);
    
    this.plugin.settings.allowedPaths = paths;
    this.plugin.saveSettings();
  }

  private getAllFolders(): TFolder[] {
    const folders: TFolder[] = [];
    const files = this.app.vault.getAllLoadedFiles();
    files.forEach(file => {
      if (file instanceof TFolder) {
        folders.push(file);
      }
    });
    return folders;
  }

  private addFolderRefreshSetting(containerEl: HTMLElement) {
    const folderSetting = new Setting(containerEl)
      .setName("Refresh folder parents")
      .setDesc("Type folder path to refresh parent links for all files in that folder");

    // Create container for the input and suggestions
    const inputContainer = containerEl.createDiv({ cls: "parent-link-input-container" });
    this.folderInputEl = inputContainer.createEl("input", {
      type: "text",
      value: this.plugin.settings.lastRefreshedFolder || "",
      placeholder: "Type folder path..."
    });

    // Create suggestions container
    this.suggestionContainer = inputContainer.createDiv({ 
      cls: "parent-link-suggestion-container" 
    });
    this.suggestionContainer.style.display = "none";

    // Add refresh button
    folderSetting.addButton(button => button
      .setButtonText("Refresh")
      .onClick(async () => {
        const folderPath = this.folderInputEl.value;
        // Handle root path specially
        if (folderPath === "/" || folderPath === "") {
          // Get the root folder
          const rootFolder = this.app.vault.getRoot();
          this.plugin.settings.lastRefreshedFolder = "/";
          await this.plugin.saveSettings();
          await this.plugin.handleFolderRename(rootFolder);
          new Notice(`Updated parent links in the entire vault`);
        } else {
          const folder = this.app.vault.getAbstractFileByPath(folderPath);
          if (folder instanceof TFolder) {
            this.plugin.settings.lastRefreshedFolder = folderPath;
            await this.plugin.saveSettings();
            await this.plugin.handleFolderRename(folder);
            new Notice(`Updated parent links in ${folderPath}`);
          } else {
            new Notice("Please enter a valid folder path");
          }
        }
      }));

    // Add input handler for autocomplete
    this.folderInputEl.addEventListener("input", () => {
      this.updatePathSuggestions(this.folderInputEl, this.suggestionContainer);
    });
    this.folderInputEl.addEventListener("focus", () => {
      this.updatePathSuggestions(this.folderInputEl, this.suggestionContainer);
    });
    this.folderInputEl.addEventListener("blur", () => {
      // Delay hiding suggestions to allow for clicks
      setTimeout(() => {
        this.suggestionContainer.style.display = "none";
      }, 200);
    });
  }
}


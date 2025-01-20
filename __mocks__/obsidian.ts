export interface Vault {
    adapter?: any;
    configDir?: string;
    getName?: () => string;
    getRoot(): TFolder;
    getMarkdownFiles(): TFile[];
    getAllLoadedFiles(): TAbstractFile[];
    getAbstractFileByPath(path: string): TAbstractFile | null;
    read(file: TFile): Promise<string>;
    modify(file: TFile, content: string): Promise<void>;
    on(name: string, callback: (file: TAbstractFile) => any): EventRef;
}

export interface FileManager {
    processFrontMatter(file: TFile, fn: (frontmatter: any) => void): Promise<void>;
}

export interface TAbstractFile {
    vault: Vault;
    path: string;
    name: string;
    parent: TFolder | null;
}

export interface TFile extends TAbstractFile {
    basename: string;
    extension: string;
    stat: {
        mtime: number;
        ctime: number;
        size: number;
    };
}

export interface TFolder extends TAbstractFile {
    children: TAbstractFile[];
    isRoot(): boolean;
}

export interface PluginManifest {
    id: string;
    name: string;
    version: string;
    minAppVersion: string;
    author: string;
    description: string;
}

export interface EventRef {
    id: string;
    offCallback: () => void;
}

export class TAbstractFile {
    vault: Vault;
    path: string;
    name: string;
    parent: TFolder | null;

    constructor(vault: Vault, path: string) {
        this.vault = vault;
        this.path = path;
        this.name = path.split('/').pop() || "";
        this.parent = null;
    }
}

export class TFile extends TAbstractFile {
    basename: string;
    extension: string;
    stat: {
        mtime: number;
        ctime: number;
        size: number;
    };

    constructor(vault: Vault, path: string) {
        super(vault, path);
        this.basename = this.name.replace('.md', '');
        this.extension = 'md';
        this.stat = {
            mtime: Date.now(),
            ctime: Date.now(),
            size: 0
        };
    }
}

export class TFolder extends TAbstractFile {
    children: TAbstractFile[];

    constructor(vault: Vault, path: string) {
        super(vault, path);
        this.children = [];
    }

    isRoot(): boolean {
        return false;
    }
}

export class MockFile extends TFile {
    content: string;
    frontmatter: any;

    constructor(path: string, vault: Vault, content: string = "") {
        super(vault, path);
        this.content = content;
        this.frontmatter = {};
        this.stat.size = content.length;
    }
}

export class MockFolder extends TFolder {
    constructor(path: string, vault: Vault) {
        super(vault, path);
        this.isRoot = () => false;
    }
}

// First, define the event types
type VaultEventType = 'create' | 'modify' | 'delete' | 'rename';

interface VaultEvents {
    create: (file: TAbstractFile) => any;
    modify: (file: TAbstractFile) => any;
    delete: (file: TAbstractFile) => any;
    rename: (file: TAbstractFile, oldPath: string) => any;
}

export class MockVault implements Partial<Vault> {
    private files: Map<string, MockFile> = new Map();
    private folders: Map<string, MockFolder> = new Map();
    private root: MockFolder;
    private eventHandlers: Map<string, Function[]> = new Map();

    constructor() {
        this.root = new MockFolder("", this as unknown as Vault);
        this.root.isRoot = () => true;
        this.eventHandlers.set('create', []);
        this.eventHandlers.set('modify', []);
        this.eventHandlers.set('delete', []);
        this.eventHandlers.set('rename', []);
    }

    getRoot(): MockFolder {
        return this.root;
    }

    async createFolder(path: string): Promise<MockFolder> {
        const folder = new MockFolder(path, this as unknown as Vault);
        this.folders.set(path, folder);
        return folder;
    }

    async createMarkdownFile(path: string, content: string = ""): Promise<MockFile> {
        const file = new MockFile(path, this as unknown as Vault, content);
        this.files.set(path, file);
        
        // Set up parent folder relationship
        const parentPath = path.substring(0, path.lastIndexOf('/'));
        if (parentPath) {
            const parentFolder = this.folders.get(parentPath);
            if (parentFolder) {
                file.parent = parentFolder;
                parentFolder.children.push(file);
            }
        }
        
        return file;
    }

    getMarkdownFiles(): TFile[] {
        return Array.from(this.files.values());
    }

    getAllLoadedFiles(): TAbstractFile[] {
        return [...Array.from(this.files.values()), ...Array.from(this.folders.values())];
    }

    getAbstractFileByPath(path: string): TAbstractFile | null {
        return this.files.get(path) || this.folders.get(path) || null;
    }

    async read(file: TFile): Promise<string> {
        return (file as MockFile).content;
    }

    async modify(file: TFile, content: string): Promise<void> {
        if (file instanceof MockFile) {
            file.content = content;
            this.files.set(file.path, file);
        }
    }

    on(name: string, callback: Function): EventRef {
        const handlers = this.eventHandlers.get(name);
        if (handlers) {
            handlers.push(callback);
        }
        return {
            id: Math.random().toString(),
            offCallback: () => {
                const handlers = this.eventHandlers.get(name);
                if (handlers) {
                    const index = handlers.indexOf(callback);
                    if (index > -1) {
                        handlers.splice(index, 1);
                    }
                }
            }
        };
    }

    triggerEvent(name: VaultEventType, file: TAbstractFile, oldPath?: string): void {
        const handlers = this.eventHandlers.get(name);
        if (handlers) {
            handlers.forEach(callback => {
                if (name === 'rename') {
                    callback(file, oldPath);
                } else {
                    callback(file);
                }
            });
        }
    }
}

export class MockFileManager implements Partial<FileManager> {
    async processFrontMatter(file: TFile, fn: (frontmatter: any) => void): Promise<void> {
        const mockFile = file as MockFile;
        if (!mockFile.frontmatter) {
            mockFile.frontmatter = {};
        }
        fn(mockFile.frontmatter);
    }
}

export class MetadataCache {
    getFileCache(file: TFile): { frontmatter?: any } | null {
        const mockFile = file as MockFile;
        if (!mockFile.frontmatter) {
            mockFile.frontmatter = {};
        }
        return {
            frontmatter: mockFile.frontmatter
        };
    }

    trigger(name: string, file: TFile): void {
        // Mock implementation
    }
}

export class App {
    vault: Vault;
    fileManager: FileManager;
    metadataCache: MetadataCache;
    workspace: any;

    constructor() {
        this.vault = new MockVault() as unknown as Vault;
        this.fileManager = new MockFileManager() as unknown as FileManager;
        this.metadataCache = new MetadataCache();
        this.workspace = {
            activeLeaf: null
        };
    }
}

export class Notice {
    constructor(message: string) {}
}

export class Plugin {
    app: App;
    manifest: any;
    settings: any;
    private events: EventRef[];

    constructor(app: App, manifest: any) {
        this.app = app;
        this.manifest = manifest;
        this.settings = {
            enabled: true,
            detailedLogs: false
        };
        this.events = [];
    }

    registerEvent(eventRef: EventRef): void {
        this.events.push(eventRef);
    }

    loadData(): Promise<any> {
        return Promise.resolve(this.settings);
    }

    saveData(data: any): Promise<void> {
        this.settings = data;
        return Promise.resolve();
    }

    addSettingTab(tab: PluginSettingTab): void {
        // Mock implementation - no need to do anything
    }
}

export class PluginSettingTab {
    app: App;
    plugin: Plugin;
    containerEl: any;

    constructor(app: App, plugin: Plugin) {
        this.app = app;
        this.plugin = plugin;
        // Mock containerEl as a basic object with required methods
        this.containerEl = {
            empty: () => {},
            createEl: () => ({ createDiv: () => ({ createEl: () => ({}) }) }),
            createDiv: () => ({ createEl: () => ({}) })
        };
    }

    display(): void {}
}

export class Setting {
    constructor(containerEl: any) {
        return {
            setName: () => this,
            setDesc: () => this,
            addToggle: (cb: any) => {
                cb({
                    setValue: () => ({ onChange: () => {} })
                });
                return this;
            },
            addButton: (cb: any) => {
                cb({
                    setButtonText: () => ({ onClick: () => {} })
                });
                return this;
            }
        };
    }
} 
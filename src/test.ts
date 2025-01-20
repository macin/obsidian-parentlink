import { App, TFile, TFolder, Plugin, PluginSettingTab, PluginManifest, Vault, TAbstractFile, FileManager, MetadataCache } from 'obsidian';
import ParentLink from './main';
import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import { MockVault, MockFileManager, MockFile, MockFolder } from '../__mocks__/obsidian';

// Test Suite
describe('ParentLink Plugin', () => {
    let mockVault: MockVault;
    let fileManager: FileManager;
    let plugin: ParentLink;

    beforeEach(async () => {
        mockVault = new MockVault();
        fileManager = new MockFileManager() as unknown as FileManager;
        
        const app = {
            vault: mockVault as unknown as Vault,
            fileManager,
            metadataCache: new MetadataCache()
        } as App;

        const manifest: PluginManifest = {
            id: 'test-plugin',
            name: 'Test Plugin',
            version: '1.0.0',
            minAppVersion: '0.15.0',
            author: 'Test Author',
            description: 'Test Description'
        };

        plugin = new ParentLink(app, manifest);
        await plugin.loadSettings(); // Initialize settings
        await plugin.onload(); // Make sure the plugin is loaded
    });

    describe('Basic Functionality', () => {
        test('Plugin loads successfully', async () => {
            await plugin.onload();
            expect(plugin.settings.enabled).toBe(true);
            // Verify event registration by triggering an event
            const testFile = await mockVault.createMarkdownFile('test.md');
            (mockVault as MockVault).triggerEvent('create', testFile);
            // No error means success
        });

        test('Settings can be toggled', async () => {
            expect(plugin.settings.enabled).toBe(true); // Verify initial state
            plugin.settings.enabled = false;
            await plugin.saveSettings();
            expect(plugin.settings.enabled).toBe(false);
        });
    });

    describe('Parent Link Creation', () => {
        test('Creates parent link for file in folder', async () => {
            // Setup
            const folder = await mockVault.createFolder('Test Folder');
            const folderNote = await mockVault.createMarkdownFile('Test Folder/Test Folder.md');
            const childNote = await mockVault.createMarkdownFile('Test Folder/Child Note.md');
            folderNote.parent = folder;
            childNote.parent = folder;

            // Test
            await plugin.updateParentLink(childNote as unknown as TFile);

            // Verify
            expect(childNote.frontmatter.parent).toBe("[[Test Folder]]");
        });

        test('Creates parent link for folder note', async () => {
            // Setup
            const parentFolder = await mockVault.createFolder('Parent');
            const childFolder = await mockVault.createFolder('Parent/Child');
            const folderNote = await mockVault.createMarkdownFile('Parent/Child/Child.md');
            childFolder.parent = parentFolder;
            folderNote.parent = childFolder;

            // Make sure the parent folder has a matching note
            const parentNote = await mockVault.createMarkdownFile('Parent/Parent.md');
            parentNote.parent = parentFolder;

            // Test
            await plugin.updateParentLink(folderNote as unknown as TFile);

            // Verify
            expect(folderNote.frontmatter.parent).toBe("[[Parent]]");
        });

        test('Handles exact case matching', async () => {
            // Setup
            const folder = await mockVault.createFolder('Test Folder');
            const folderNote = await mockVault.createMarkdownFile('Test Folder/TEST FOLDER.md');
            const parentNote = await mockVault.createMarkdownFile('Test Folder/Test Folder.md');
            
            folderNote.parent = folder;
            parentNote.parent = folder;

            // Test
            await plugin.updateParentLink(folderNote as unknown as TFile);

            // Verify - should not create a parent link since case doesn't match
            expect(folderNote.frontmatter.parent).toBeUndefined();
        });
    });

    describe('File Operations', () => {
        test('Updates links when file is moved', async () => {
            // Setup
            const oldFolder = await mockVault.createFolder('Old Folder');
            const newFolder = await mockVault.createFolder('New Folder');
            const note = await mockVault.createMarkdownFile('Old Folder/Note.md');
            const folderNote = await mockVault.createMarkdownFile('New Folder/New Folder.md');
            note.parent = oldFolder;
            folderNote.parent = newFolder;

            // Simulate move
            note.parent = newFolder;
            await plugin.updateParentLink(note as unknown as TFile);

            // Verify
            expect(note.frontmatter.parent).toBe("[[New Folder]]");
        });

        test('Updates child notes when folder note is renamed', async () => {
            // Setup
            const folder = await mockVault.createFolder('Test Folder');
            const folderNote = await mockVault.createMarkdownFile('Test Folder/Test Folder.md');
            const childNote = await mockVault.createMarkdownFile('Test Folder/Child.md');
            folderNote.parent = folder;
            childNote.parent = folder;

            // Simulate rename
            folderNote.name = 'New Name.md';
            folderNote.basename = 'New Name';
            folder.name = 'New Name';
            await plugin.handleFolderRename(folder as unknown as TFolder);

            // Verify
            expect(childNote.frontmatter.parent).toBe("[[New Name]]");
        });

        test('Processes all files when refreshing root folder', async () => {
            // Setup
            const folder1 = await mockVault.createFolder('Folder1');
            const folder2 = await mockVault.createFolder('Folder2');
            
            // Create folder notes
            const folderNote1 = await mockVault.createMarkdownFile('Folder1/Folder1.md');
            const folderNote2 = await mockVault.createMarkdownFile('Folder2/Folder2.md');
            folderNote1.parent = folder1;
            folderNote2.parent = folder2;
            
            // Create child notes
            const childNote1 = await mockVault.createMarkdownFile('Folder1/Child1.md');
            const childNote2 = await mockVault.createMarkdownFile('Folder2/Child2.md');
            childNote1.parent = folder1;
            childNote2.parent = folder2;

            // Process root folder
            const rootFolder = mockVault.getRoot() as unknown as TFolder;
            await plugin.handleFolderRename(rootFolder);

            // Verify all files were processed
            expect(childNote1.frontmatter.parent).toBe("[[Folder1]]");
            expect(childNote2.frontmatter.parent).toBe("[[Folder2]]");
        });
    });

    describe('Edge Cases', () => {
        test('Handles files without parent folder', async () => {
            const rootFile = await mockVault.createMarkdownFile('Root.md');
            await plugin.updateParentLink(rootFile as unknown as TFile);
            expect(rootFile.frontmatter.parent).toBeUndefined();
        });

        test('Handles missing parent note', async () => {
            const folder = await mockVault.createFolder('Folder');
            const note = await mockVault.createMarkdownFile('Folder/Note.md');
            note.parent = folder;
            await plugin.updateParentLink(note as unknown as TFile);
            expect(note.frontmatter.parent).toBeUndefined();
        });
    });

    describe('Allowed Paths', () => {
        test('Respects allowed paths setting', async () => {
            // Setup
            const allowedFolder = await mockVault.createFolder('Allowed');
            const disallowedFolder = await mockVault.createFolder('Disallowed');
            
            // Create notes in both folders
            const allowedNote = await mockVault.createMarkdownFile('Allowed/Note.md');
            const disallowedNote = await mockVault.createMarkdownFile('Disallowed/Note.md');
            
            // Create folder notes
            const allowedFolderNote = await mockVault.createMarkdownFile('Allowed/Allowed.md');
            const disallowedFolderNote = await mockVault.createMarkdownFile('Disallowed/Disallowed.md');
            
            // Set parent relationships
            allowedNote.parent = allowedFolder;
            disallowedNote.parent = disallowedFolder;
            allowedFolderNote.parent = allowedFolder;
            disallowedFolderNote.parent = disallowedFolder;

            // Configure plugin to only allow specific path
            plugin.settings.allowedPaths = ['Allowed'];
            await plugin.saveSettings();

            // Test allowed path
            await plugin.updateParentLink(allowedNote as unknown as TFile);
            expect(allowedNote.frontmatter.parent).toBe("[[Allowed]]");

            // Test disallowed path
            await plugin.updateParentLink(disallowedNote as unknown as TFile);
            expect(disallowedNote.frontmatter.parent).toBeUndefined();
        });

        test('Empty allowed paths allows all paths', async () => {
            // Setup
            const folder = await mockVault.createFolder('Test');
            const note = await mockVault.createMarkdownFile('Test/Note.md');
            const folderNote = await mockVault.createMarkdownFile('Test/Test.md');
            
            note.parent = folder;
            folderNote.parent = folder;

            // Ensure allowed paths is empty
            plugin.settings.allowedPaths = [];
            await plugin.saveSettings();

            // Test that note gets updated
            await plugin.updateParentLink(note as unknown as TFile);
            expect(note.frontmatter.parent).toBe("[[Test]]");
        });
    });
}); 
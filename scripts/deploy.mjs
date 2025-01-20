import { copyFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const PLUGIN_NAME = 'parentlink';

// Get vault path from command line argument
const vaultPath = process.argv[2];
if (!vaultPath) {
    console.error('Please provide the vault path as an argument');
    process.exit(1);
}

async function deployToVault() {
    try {
        // Construct plugin directory path
        const pluginDir = join(vaultPath, '.obsidian', 'plugins', PLUGIN_NAME);
        
        // Create plugin directory if it doesn't exist
        if (!existsSync(pluginDir)) {
            await mkdir(pluginDir, { recursive: true });
        }

        // Copy required files
        const filesToCopy = ['main.js', 'manifest.json', 'styles.css'];
        
        for (const file of filesToCopy) {
            await copyFile(file, join(pluginDir, file));
            console.log(`Copied ${file} to ${pluginDir}`);
        }

        console.log('\nPlugin deployed successfully! Please reload Obsidian to see changes.');
    } catch (error) {
        console.error('Error deploying plugin:', error.message);
        process.exit(1);
    }
}

deployToVault(); 
import { defineConfig } from 'wxt';

export default defineConfig({
  // Visible in Chrome’s folder picker (`.output` is hidden on Linux).
  outDir: 'dist',
  manifest: {
    name: 'CS50.ai Local Chat Backup',
    description: 'Sync CS50.ai chat messages to a local Markdown backup file',
    permissions: ['storage', 'tabs', 'scripting'],
    host_permissions: ['https://cs50.ai/*'],
  },
});
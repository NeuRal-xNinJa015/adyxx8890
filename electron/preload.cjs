// ADYX Desktop — Preload Script
// Provides a secure bridge between renderer and Node.js via contextBridge.

const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('adyxDesktop', {
    isElectron: true,
    platform: process.platform,
    version: process.versions.electron,
});

// ADYX Desktop — Electron Main Process (CommonJS)
// Starts the backend server, then opens the frontend in a native window.

const { app, BrowserWindow, shell, Menu, session } = require('electron');
const { join, resolve } = require('path');
const { spawn, execSync } = require('child_process');
const { existsSync } = require('fs');
const http = require('http');

// ── Paths ──
const isDev = !app.isPackaged;
const rootDir = isDev
    ? resolve(__dirname, '..')
    : resolve(process.resourcesPath, 'app');

const BACKEND_ENTRY = join(rootDir, 'backend', 'src', 'index.js');
const PRELOAD_PATH = join(__dirname, 'preload.cjs');
const BACKEND_PORT = 8443;

let mainWindow = null;
let backendProcess = null;

// ── Single Instance Lock ──
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
}

app.on('second-instance', () => {
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    }
});

// ── Poll for backend readiness ──
function waitForBackend(port, maxWait) {
    return new Promise((resolvePromise, rejectPromise) => {
        const start = Date.now();
        function poll() {
            const req = http.get('http://localhost:' + port + '/health', (res) => {
                if (res.statusCode === 200) {
                    console.log('[Electron] Backend is responding on port ' + port);
                    resolvePromise();
                } else {
                    retry();
                }
                res.resume();
            });
            req.on('error', () => retry());
            req.setTimeout(1000, () => { req.destroy(); retry(); });
        }
        function retry() {
            if (Date.now() - start > maxWait) {
                rejectPromise(new Error('Backend did not start within ' + maxWait + 'ms'));
            } else {
                setTimeout(poll, 500);
            }
        }
        poll();
    });
}

// ── Start Backend Server ──
function startBackend() {
    return new Promise((resolvePromise, rejectPromise) => {
        console.log('[Electron] Starting backend from:', BACKEND_ENTRY);

        if (!existsSync(BACKEND_ENTRY)) {
            rejectPromise(new Error('Backend not found: ' + BACKEND_ENTRY));
            return;
        }

        const backendCwd = join(rootDir, 'backend');
        const nodeExe = process.argv0 || 'node';  // use system node

        // Spawn backend using system node via shell (ensures PATH resolution)
        backendProcess = spawn('node', [BACKEND_ENTRY], {
            cwd: backendCwd,
            env: Object.assign({}, process.env, {
                PORT: String(BACKEND_PORT),
                NODE_ENV: 'production',
                ELECTRON_MODE: 'true',
            }),
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: true,
            windowsHide: true,
        });

        backendProcess.stdout.on('data', (data) => {
            console.log('[Backend]', data.toString().trim());
        });

        backendProcess.stderr.on('data', (data) => {
            console.error('[Backend ERR]', data.toString().trim());
        });

        backendProcess.on('error', (err) => {
            console.error('[Electron] Backend process error:', err);
            rejectPromise(err);
        });

        backendProcess.on('exit', (code) => {
            console.log('[Electron] Backend exited with code:', code);
            backendProcess = null;
        });

        // Poll the health endpoint until the server is ready
        waitForBackend(BACKEND_PORT, 15000)
            .then(resolvePromise)
            .catch(rejectPromise);
    });
}

// ── Stop Backend Server ──
function stopBackend() {
    if (backendProcess) {
        console.log('[Electron] Stopping backend...');
        try {
            // On Windows, SIGTERM/SIGKILL don't work for shell-spawned processes
            if (process.platform === 'win32') {
                execSync(`taskkill /pid ${backendProcess.pid} /T /F`, { stdio: 'ignore' });
            } else {
                backendProcess.kill('SIGTERM');
            }
        } catch (_) { /* process may already be dead */ }
        setTimeout(() => {
            if (backendProcess) {
                try {
                    if (process.platform !== 'win32') {
                        backendProcess.kill('SIGKILL');
                    }
                } catch (_) { }
                backendProcess = null;
            }
        }, 3000);
    }
}

// ── Create Main Window ──
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        title: 'ADYX',
        backgroundColor: '#0a0a0a',
        show: false,
        webPreferences: {
            preload: PRELOAD_PATH,
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
        },
    });

    // Content Security Policy
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': [
                    "default-src 'self';"
                    + " script-src 'self' 'unsafe-inline';"
                    + " style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;"
                    + " font-src 'self' https://fonts.gstatic.com;"
                    + " connect-src 'self' ws://localhost:* http://localhost:*;"
                    + " img-src 'self' data: blob:;"
                    + " media-src 'self' blob:;"
                ]
            }
        });
    });

    // Remove default menu bar
    Menu.setApplicationMenu(null);

    // Load frontend — use Vite dev server in dev mode for HMR
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
    } else {
        mainWindow.loadURL('http://localhost:' + BACKEND_PORT);
    }

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        mainWindow.focus();
    });

    // Open external links in default browser
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    mainWindow.webContents.on('will-navigate', (event, url) => {
        const allowed = ['http://localhost:' + BACKEND_PORT, 'http://localhost:5173'];
        const isAllowed = allowed.some(function (a) { return url.startsWith(a); });
        if (!isAllowed) {
            event.preventDefault();
            shell.openExternal(url);
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// ── App Lifecycle ──
app.whenReady().then(async () => {
    try {
        await startBackend();
        console.log('[Electron] Creating window...');
        createWindow();
    } catch (err) {
        console.error('[Electron] Fatal: Could not start backend:', err);
        app.quit();
    }
});

app.on('window-all-closed', () => {
    stopBackend();
    app.quit();
});

app.on('before-quit', () => {
    stopBackend();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

process.on('uncaughtException', (err) => {
    console.error('[Electron] Uncaught exception:', err);
    stopBackend();
    app.quit();
});

process.on('unhandledRejection', (reason) => {
    console.error('[Electron] Unhandled rejection:', reason);
});

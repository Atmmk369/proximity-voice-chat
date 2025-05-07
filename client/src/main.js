const { app, BrowserWindow, ipcMain, globalShortcut, Tray, Menu } = require('electron');
const path = require('path');
const url = require('url');

// Keep a global reference to prevent garbage collection
let mainWindow;
let tray;

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    icon: path.join(__dirname, '../assets/icon.png')
  });

  // Load the index.html file
  mainWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'index.html'),
    protocol: 'file:',
    slashes: true
  }));

  // Register global shortcut for host boom voice
  globalShortcut.register('Alt+B', () => {
    mainWindow.webContents.send('boom-voice-shortcut');
  });

  // Open DevTools in development
  // mainWindow.webContents.openDevTools();

  // Create tray icon
  tray = new Tray(path.join(__dirname, '../assets/icon.png'));
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show App', click: () => mainWindow.show() },
    { label: 'Quit', click: () => app.quit() }
  ]);
  tray.setToolTip('Proximity Voice Chat');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
  });

  // Handle window close event properly
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      // If just minimizing to tray
      event.preventDefault();
      mainWindow.hide();
      return false;
    } else {
      // If actually quitting, send disconnect signal
      mainWindow.webContents.send('app-closing');
      // Give time for the disconnect message to be sent
      setTimeout(() => {}, 300);
    }
    return true;
  });
}

// Create window when app is ready
app.whenReady().then(() => {
  createWindow();
});

// Quit when all windows are closed except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Handle minimize to tray toggle
ipcMain.on('update-tray-minimize', (event, shouldMinimize) => {
  app.isMinimizeToTray = shouldMinimize;
});

// Handle minimize request from renderer
ipcMain.on('minimize-to-tray', () => {
  mainWindow.hide();
});

// Add this to handle app quit properly
app.on('before-quit', () => {
  app.isQuitting = true;
  // Signal to renderer process to clean up
  if (mainWindow) {
    mainWindow.webContents.send('app-closing');
  }
  // Allow time for cleanup
  setTimeout(() => {}, 300);
});

// Clean up before quitting
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

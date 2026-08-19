const {
    app,
    BrowserWindow,
    Menu,
    Tray
} = require("electron");

const path = require("node:path");

let mainWindow = null;
let tray = null;
let isQuitting = false;

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 900,
        minHeight: 650,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            backgroundThrottling: false
        }
    });

    mainWindow.loadFile(
        path.join(__dirname, "index.html")
    );

    mainWindow.on("close", (event) => {
        if (!isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });

    mainWindow.on("closed", () => {
        mainWindow = null;
    });
}

function showMainWindow() {
    if (mainWindow === null) {
        createMainWindow();
    }

    mainWindow.show();
    mainWindow.focus();
}

async function createTray() {
    const trayIcon = await app.getFileIcon(
        process.execPath,
        {
            size: "small"
        }
    );

    tray = new Tray(trayIcon);

    tray.setToolTip("KRIYA AI Desktop");

    const trayMenu = Menu.buildFromTemplate([
        {
            label: "Open KRIYA AI",
            click: () => {
                showMainWindow();
            }
        },
        {
            label: "Hide KRIYA AI",
            click: () => {
                mainWindow.hide();
            }
        },
        {
            type: "separator"
        },
        {
            label: "Quit",
            click: () => {
                isQuitting = true;
                app.quit();
            }
        }
    ]);

    tray.setContextMenu(trayMenu);

    tray.on("click", () => {
        if (mainWindow.isVisible()) {
            mainWindow.hide();
        } else {
            showMainWindow();
        }
    });
}

app.whenReady().then(async () => {
    createMainWindow();
    await createTray();

    app.on("activate", () => {
        showMainWindow();
    });
});

app.on("before-quit", () => {
    isQuitting = true;
});

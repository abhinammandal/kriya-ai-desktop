const {
    app,
    BrowserWindow,
    globalShortcut,
    ipcMain,
    Menu,
    Tray
} = require("electron");

const path = require("node:path");

const {
    performDesktopAction,
    startDesktopActions,
    stopDesktopActions
} = require("./desktop-actions");

const {
    startForegroundProfileWatcher,
    stopForegroundProfileWatcher
} = require("./foreground-profile");

let mainWindow = null;
let tray = null;
let isQuitting = false;
let desktopControlEnabled = true;

let foregroundApplicationState = {
    processName: "unknown",
    profile: null
};

ipcMain.handle(
    "get-desktop-control-state",
    () => {
        return {
            enabled: desktopControlEnabled
        };
    }
);

ipcMain.handle(
    "get-foreground-profile-state",
    () => {
        return foregroundApplicationState;
    }
);

ipcMain.handle(
    "set-desktop-control-state",
    (event, enabled) => {
        return setDesktopControlEnabled(enabled);
    }
);


ipcMain.handle(
    "desktop-action",
    async (event, actionName) => {
        if (!desktopControlEnabled) {
            return {
                success: true,
                skipped: true,
                actionName: actionName,
                reason: "desktop-control-paused"
            };
        }
        if (
            mainWindow !== null &&
            !mainWindow.isDestroyed() &&
            mainWindow.isFocused()
        ) {
            return {
                success: true,
                skipped: true,
                actionName: actionName,
                reason: "kriya-window-focused"
            };
        }
        try {
            return await performDesktopAction(actionName);
        } catch (error) {
            const errorMessage =
                error instanceof Error
                    ? error.message
                    : "Unknown desktop action error.";

            console.error(
                "Desktop action failed:",
                errorMessage
            );

            return {
                success: false,
                actionName: actionName,
                error: errorMessage
            };
        }
    }
);

function handleForegroundApplicationChange(
    foregroundState
) {
    foregroundApplicationState = {
        processName:
            foregroundState.processName,

        profile:
            foregroundState.profile
    };

    const detectedProfile =
        foregroundApplicationState.profile ??
        "unsupported";

    console.log(
        `Foreground application: ` +
        `${foregroundApplicationState.processName} ` +
        `→ ${detectedProfile}`
    );

    if (
        mainWindow !== null &&
        !mainWindow.isDestroyed()
    ) {
        mainWindow.webContents.send(
            "foreground-profile-changed",
            foregroundApplicationState
        );
    }
}

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 900,
        minHeight: 650,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
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

function setDesktopControlEnabled(enabled) {
    desktopControlEnabled = Boolean(enabled);

    updateTrayMenu();

    if (
        mainWindow !== null &&
        !mainWindow.isDestroyed()
    ) {
        mainWindow.webContents.send(
            "desktop-control-state-changed",
            {
                enabled: desktopControlEnabled
            }
        );
    }

    console.log(
        desktopControlEnabled
            ? "Desktop gesture control resumed."
            : "Desktop gesture control paused."
    );

    return {
        success: true,
        enabled: desktopControlEnabled
    };
}

function toggleDesktopControl() {
    return setDesktopControlEnabled(
        !desktopControlEnabled
    );
}

function updateTrayMenu() {
    if (tray === null) {
        return;
    }

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
            label: desktopControlEnabled
                ? "Pause desktop control"
                : "Resume desktop control",
            click: () => {
                toggleDesktopControl();
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

    tray.setToolTip(
        desktopControlEnabled
            ? "KRIYA AI Desktop — Control active"
            : "KRIYA AI Desktop — Control paused"
    );
}

async function createTray() {
    const trayIcon = await app.getFileIcon(
        process.execPath,
        {
            size: "small"
        }
    );

    tray = new Tray(trayIcon);

    updateTrayMenu();

    tray.on("click", () => {
        if (mainWindow.isVisible()) {
            mainWindow.hide();
        } else {
            showMainWindow();
        }
    });
}

app.whenReady().then(async () => {
    startDesktopActions();

    startForegroundProfileWatcher(
        handleForegroundApplicationChange
    );

    createMainWindow();

    await createTray();

    const shortcutRegistered =
        globalShortcut.register(
            "CommandOrControl+Shift+K",
            () => {
                toggleDesktopControl();
            }
        );

    if (!shortcutRegistered) {
        console.error(
            "Could not register the desktop-control shortcut."
        );
    }

    app.on("activate", () => {
        showMainWindow();
    });
});

app.on("before-quit", () => {
    isQuitting = true;

    stopForegroundProfileWatcher();
    stopDesktopActions();
});

app.on("will-quit", () => {
    globalShortcut.unregisterAll();
});
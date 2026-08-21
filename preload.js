const {
    contextBridge,
    ipcRenderer
} = require("electron");

contextBridge.exposeInMainWorld(
    "kriyaDesktop",
    {
        performAction: (actionName) => {
            return ipcRenderer.invoke(
                "desktop-action",
                actionName
            );
        },

        getDesktopControlState: () => {
            return ipcRenderer.invoke(
                "get-desktop-control-state"
            );
        },

        setDesktopControlState: (enabled) => {
            return ipcRenderer.invoke(
                "set-desktop-control-state",
                Boolean(enabled)
            );
        },

        onDesktopControlStateChanged: (callback) => {
            if (typeof callback !== "function") {
                throw new TypeError(
                    "Desktop-control listener must be a function."
                );
            }

            const listener = (event, state) => {
                callback(state);
            };

            ipcRenderer.on(
                "desktop-control-state-changed",
                listener
            );

            return () => {
                ipcRenderer.removeListener(
                    "desktop-control-state-changed",
                    listener
                );
            };
        },

        getForegroundProfileState: () => {
            return ipcRenderer.invoke(
                "get-foreground-profile-state"
            );
        },

        onForegroundProfileChanged: (callback) => {
            if (typeof callback !== "function") {
                throw new TypeError(
                    "Foreground-profile listener must be a function."
                );
            }

            const listener = (event, state) => {
                callback(state);
            };

            ipcRenderer.on(
                "foreground-profile-changed",
                listener
            );

            return () => {
                ipcRenderer.removeListener(
                    "foreground-profile-changed",
                    listener
                );
            };
        }
    }
);
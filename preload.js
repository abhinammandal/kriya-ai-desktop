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
        }
    }
);
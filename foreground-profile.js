const {
    spawn
} = require("node:child_process");

const path = require("node:path");

const PROFILE_BY_PROCESS = new Map([
    // Presentation applications
    ["powerpnt", "presentation"],

    // Web browsers
    ["chrome", "browser"],
    ["msedge", "browser"],
    ["firefox", "browser"],
    ["brave", "browser"],
    ["opera", "browser"],
    ["vivaldi", "browser"],

    // Media applications
    ["spotify", "media"],
    ["vlc", "media"],
    ["wmplayer", "media"],
    ["music.ui", "media"],
    ["itunes", "media"],
    ["foobar2000", "media"],
    ["potplayermini64", "media"],
    ["mpc-hc64", "media"]
]);

let foregroundWatcher = null;
let outputBuffer = "";
let foregroundChangeCallback = null;

function resolveProfile(processName) {
    return (
        PROFILE_BY_PROCESS.get(processName) ??
        null
    );
}

function handleWatcherOutput(data) {
    outputBuffer += data.toString();

    let newlineIndex =
        outputBuffer.indexOf("\n");

    while (newlineIndex !== -1) {
        const outputLine =
            outputBuffer
                .slice(0, newlineIndex)
                .trim();

        outputBuffer =
            outputBuffer.slice(
                newlineIndex + 1
            );

        if (outputLine.startsWith("APP:")) {
            const processName =
                outputLine
                    .slice(4)
                    .trim()
                    .toLowerCase();

            const profile =
                resolveProfile(processName);

            if (
                typeof foregroundChangeCallback ===
                "function"
            ) {
                foregroundChangeCallback({
                    processName: processName,
                    profile: profile
                });
            }
        }

        newlineIndex =
            outputBuffer.indexOf("\n");
    }
}

function startForegroundProfileWatcher(
    onForegroundChange
) {
    if (typeof onForegroundChange !== "function") {
        throw new TypeError(
            "Foreground-change callback must be a function."
        );
    }

    foregroundChangeCallback =
        onForegroundChange;

    if (
        foregroundWatcher !== null &&
        foregroundWatcher.exitCode === null
    ) {
        return;
    }

    const watcherScriptPath =
        path.join(
            __dirname,
            "foreground-app.ps1"
        );

    const watcherProcess =
        spawn(
            "powershell.exe",
            [
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                watcherScriptPath
            ],
            {
                windowsHide: true,
                stdio: [
                    "ignore",
                    "pipe",
                    "pipe"
                ]
            }
        );

    foregroundWatcher = watcherProcess;
    outputBuffer = "";

    watcherProcess.stdout.on(
        "data",
        handleWatcherOutput
    );

    watcherProcess.stderr.on(
        "data",
        (data) => {
            const errorMessage =
                data.toString().trim();

            if (errorMessage !== "") {
                console.error(
                    "Foreground watcher:",
                    errorMessage
                );
            }
        }
    );

    watcherProcess.on("error", (error) => {
        console.error(
            "Foreground watcher failed:",
            error
        );

        if (
            foregroundWatcher ===
            watcherProcess
        ) {
            foregroundWatcher = null;
        }
    });

    watcherProcess.on("close", () => {
        if (
            foregroundWatcher ===
            watcherProcess
        ) {
            foregroundWatcher = null;
        }
    });
}

function stopForegroundProfileWatcher() {
    if (foregroundWatcher === null) {
        return;
    }

    const watcherProcess =
        foregroundWatcher;

    foregroundWatcher = null;
    foregroundChangeCallback = null;

    watcherProcess.kill();
}

module.exports = {
    startForegroundProfileWatcher,
    stopForegroundProfileWatcher
};
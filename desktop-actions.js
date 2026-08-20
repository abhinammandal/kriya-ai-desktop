const {
    spawn
} = require("node:child_process");

const path = require("node:path");

const SUPPORTED_DESKTOP_ACTIONS = new Set([
    "next",
    "previous",
    "presentation-start",
    "presentation-end",
    "presentation-black",
    "play"
]);

let inputWorker = null;
let outputBuffer = "";

const pendingRequests = [];

function rejectPendingRequests(error) {
    while (pendingRequests.length > 0) {
        const request = pendingRequests.shift();
        request.reject(error);
    }
}

function handleWorkerOutput(data) {
    outputBuffer += data.toString();

    let newlineIndex = outputBuffer.indexOf("\n");

    while (newlineIndex !== -1) {
        const outputLine = outputBuffer
            .slice(0, newlineIndex)
            .trim();

        outputBuffer = outputBuffer.slice(
            newlineIndex + 1
        );

        if (outputLine !== "") {
            const request = pendingRequests.shift();

            if (request !== undefined) {
                if (outputLine.startsWith("OK:")) {
                    request.resolve({
                        success: true,
                        skipped: false,
                        actionName: request.actionName
                    });
                } else {
                    request.reject(
                        new Error(
                            outputLine.replace(
                                /^ERROR:/,
                                ""
                            )
                        )
                    );
                }
            }
        }

        newlineIndex = outputBuffer.indexOf("\n");
    }
}

function startWorker() {
    if (
        inputWorker !== null &&
        inputWorker.exitCode === null
    ) {
        return inputWorker;
    }

    const workerScriptPath = path.join(
        __dirname,
        "windows-input.ps1"
    );

    const worker = spawn(
        "powershell.exe",
        [
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            workerScriptPath
        ],
        {
            windowsHide: true,
            stdio: [
                "pipe",
                "pipe",
                "pipe"
            ]
        }
    );

    inputWorker = worker;
    outputBuffer = "";

    worker.stdout.on("data", (data) => {
        handleWorkerOutput(data);
    });

    worker.stderr.on("data", (data) => {
        const errorMessage = data
            .toString()
            .trim();

        if (errorMessage !== "") {
            console.error(
                "Windows input worker:",
                errorMessage
            );
        }
    });

    worker.on("error", (error) => {
        rejectPendingRequests(error);

        if (inputWorker === worker) {
            inputWorker = null;
        }
    });

    worker.on("close", (exitCode) => {
        rejectPendingRequests(
            new Error(
                `Windows input worker stopped with code ${exitCode}.`
            )
        );

        if (inputWorker === worker) {
            inputWorker = null;
        }
    });

    return worker;
}

function startDesktopActions() {
    startWorker();
}

function performDesktopAction(actionName) {
    if (actionName === "none" || actionName === "light") {
        return Promise.resolve({
            success: true,
            skipped: true,
            actionName: actionName
        });
    }

    if (!SUPPORTED_DESKTOP_ACTIONS.has(actionName)) {
        return Promise.reject(
            new Error(
                `Unsupported desktop action: ${actionName}`
            )
        );
    }

    const worker = startWorker();

    return new Promise((resolve, reject) => {
        const request = {
            actionName: actionName,
            resolve: resolve,
            reject: reject
        };

        pendingRequests.push(request);

                worker.stdin.write(
            `${actionName}\n`,
            (error) => {
                if (error === undefined || error === null) {
                    return;
                }

                const requestIndex =
                    pendingRequests.indexOf(request);

                if (requestIndex !== -1) {
                    pendingRequests.splice(
                        requestIndex,
                        1
                    );
                }

                reject(error);
            }
        );
    });
}

function stopDesktopActions() {
    if (inputWorker === null) {
        return;
    }

    const worker = inputWorker;
    inputWorker = null;

    worker.stdin.end();

    rejectPendingRequests(
        new Error(
            "KRIYA AI Desktop is shutting down."
        )
    );
}

module.exports = {
    performDesktopAction,
    startDesktopActions,
    stopDesktopActions
};
const {
    spawn
} = require("node:child_process");

const DESKTOP_ACTIONS = Object.freeze({
    next: `
        Add-Type -AssemblyName System.Windows.Forms;
        [System.Windows.Forms.SendKeys]::SendWait('{RIGHT}');
    `,

    previous: `
        Add-Type -AssemblyName System.Windows.Forms;
        [System.Windows.Forms.SendKeys]::SendWait('{LEFT}');
    `,

    play: `
        $nativeCode = @'
        [DllImport("user32.dll")]
        public static extern void keybd_event(
            byte virtualKey,
            byte scanCode,
            uint flags,
            UIntPtr extraInfo
        );
'@;

                Add-Type -MemberDefinition $nativeCode -Name NativeKeyboard -Namespace Kriya;

        [Kriya.NativeKeyboard]::keybd_event(
            0xB3,
            0,
            0,
            [UIntPtr]::Zero
        );

        [Kriya.NativeKeyboard]::keybd_event(
            0xB3,
            0,
            2,
            [UIntPtr]::Zero
        );
    `
});

function runPowerShell(script) {
    return new Promise((resolve, reject) => {
        const childProcess = spawn(
            "powershell.exe",
            [
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                script
            ],
            {
                windowsHide: true
            }
        );

        let errorOutput = "";

        childProcess.stderr.on("data", (data) => {
            errorOutput += data.toString();
        });

        childProcess.on("error", (error) => {
            reject(error);
        });

        childProcess.on("close", (exitCode) => {
            if (exitCode === 0) {
                resolve();
                return;
            }

            reject(
                new Error(
                    errorOutput ||
                    `Windows action failed with code ${exitCode}.`
                )
            );
        });
    });
}

async function performDesktopAction(actionName) {
    if (actionName === "none" || actionName === "light") {
        return {
            success: true,
            skipped: true,
            actionName: actionName
        };
    }

    const actionScript = DESKTOP_ACTIONS[actionName];

    if (actionScript === undefined) {
        throw new Error(
            `Unsupported desktop action: ${actionName}`
        );
    }

    await runPowerShell(actionScript);

    return {
        success: true,
        skipped: false,
        actionName: actionName
    };
}

module.exports = {
    performDesktopAction
};
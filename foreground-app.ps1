$nativeCode = @'
using System;
using System.Runtime.InteropServices;

public static class ForegroundApplication
{
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(
        IntPtr windowHandle,
        out uint processId
    );
}
'@

Add-Type -TypeDefinition $nativeCode

$lastProcessName = $null

while ($true) {
    $processName = "unknown"

    try {
        $windowHandle =
            [ForegroundApplication]::GetForegroundWindow()

        [uint32] $foregroundProcessId = 0

        [void] [ForegroundApplication]::GetWindowThreadProcessId(
            $windowHandle,
            [ref] $foregroundProcessId
        )

        if ($foregroundProcessId -ne 0) {
            $foregroundProcess =
                Get-Process `
                    -Id $foregroundProcessId `
                    -ErrorAction Stop

            $processName =
                $foregroundProcess.ProcessName.ToLowerInvariant()
        }
    }
    catch {
        $processName = "unknown"
    }

    if ($processName -ne $lastProcessName) {
        [Console]::Out.WriteLine(
            "APP:$processName"
        )

        [Console]::Out.Flush()

        $lastProcessName = $processName
    }

    Start-Sleep -Milliseconds 500
}
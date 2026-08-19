Add-Type -AssemblyName System.Windows.Forms

$nativeCode = @'
using System;
using System.Runtime.InteropServices;

public static class NativeKeyboard
{
    [DllImport("user32.dll")]
    public static extern void keybd_event(
        byte virtualKey,
        byte scanCode,
        uint flags,
        UIntPtr extraInfo
    );
}
'@

Add-Type -TypeDefinition $nativeCode

function Send-MediaKey {
    param(
        [byte] $VirtualKey
    )

    [NativeKeyboard]::keybd_event(
        $VirtualKey,
        0,
        0,
        [UIntPtr]::Zero
    )

    [NativeKeyboard]::keybd_event(
        $VirtualKey,
        0,
        2,
        [UIntPtr]::Zero
    )
}

while ($true) {
    $actionName = [Console]::In.ReadLine()

    if ($null -eq $actionName) {
        break
    }

    try {
        switch ($actionName.Trim()) {
            "next" {
                [System.Windows.Forms.SendKeys]::SendWait(
                    "{RIGHT}"
                )
                break
            }

            "previous" {
                [System.Windows.Forms.SendKeys]::SendWait(
                    "{LEFT}"
                )
                break
            }

            "play" {
                Send-MediaKey -VirtualKey 0xB3
                break
            }

            default {
                throw "Unsupported action: $actionName"
            }
        }

        [Console]::Out.WriteLine(
            "OK:$actionName"
        )
    }
    catch {
        $errorMessage =
            $_.Exception.Message -replace "[\r\n]+", " "

        [Console]::Out.WriteLine(
            "ERROR:$errorMessage"
        )
    }

    [Console]::Out.Flush()
}

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

            "browser-back" {
                [System.Windows.Forms.SendKeys]::SendWait(
                    "%{LEFT}"
                )

                break
            }

            "browser-forward" {
                [System.Windows.Forms.SendKeys]::SendWait(
                    "%{RIGHT}"
                )

                break
            }

            "browser-scroll-down" {
                [System.Windows.Forms.SendKeys]::SendWait(
                    "{PGDN}"
                )

                break
            }

            "browser-scroll-up" {
                [System.Windows.Forms.SendKeys]::SendWait(
                    "{PGUP}"
                )

                break
            }

            "browser-refresh" {
                [System.Windows.Forms.SendKeys]::SendWait(
                    "^r"
                )

                break
            }

            "browser-space" {
                [System.Windows.Forms.SendKeys]::SendWait(
                    " "
                )

                break
            }

            "presentation-start" {
                [System.Windows.Forms.SendKeys]::SendWait(
                    "{F5}"
                )

                break
            }

            "presentation-end" {
                [System.Windows.Forms.SendKeys]::SendWait(
                    "{ESC}"
                )

                break
            }

            "presentation-black" {
                [System.Windows.Forms.SendKeys]::SendWait(
                    "b"
                )

                break
            }

            "play" {
                Send-MediaKey -VirtualKey 0xB3

                break
            }

            "media-play-focused" {
                [System.Windows.Forms.SendKeys]::SendWait(
                    " "
                )

                break
            }

            "media-next" {
                [System.Windows.Forms.SendKeys]::SendWait(
                    "n"
                )

                break
            }

            "media-previous" {
                [System.Windows.Forms.SendKeys]::SendWait(
                    "p"
                )

                break
            }

            "media-seek-forward" {
                [System.Windows.Forms.SendKeys]::SendWait(
                    "+{RIGHT}"
                )

                break
            }

            "media-seek-backward" {
                [System.Windows.Forms.SendKeys]::SendWait(
                    "+{LEFT}"
                )

                break
            }

            "media-volume-up" {
                [System.Windows.Forms.SendKeys]::SendWait(
                    "^{UP}"
                )

                break
            }

            "media-volume-down" {
                [System.Windows.Forms.SendKeys]::SendWait(
                    "^{DOWN}"
                )

                break
            }

            "media-volume-mute" {
                [System.Windows.Forms.SendKeys]::SendWait(
                    "m"
                )

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
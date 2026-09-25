using System;
using System.Runtime.InteropServices;

namespace ebloX
{
    internal static class NativeMethods
    {
        internal const int SpiSetDeskWallpaper = 0x0014;
        internal const int SpifUpdateIniFile = 0x01;
        internal const int SpifSendWinIniChange = 0x02;
        internal const int WmNcLButtonDown = 0x00A1;
        internal const int HtCaption = 0x0002;

        [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool SystemParametersInfo(int uiAction, int uiParam, string pvParam, int fWinIni);

        [DllImport("user32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool ReleaseCapture();

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        internal static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);
    }
}

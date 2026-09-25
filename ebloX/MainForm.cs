using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace ebloX
{
    public partial class MainForm : Form
    {
        const int NormalBorderRadius = 20;
        const int MaximizedBorderRadius = 0;

        SystemBridge bridge;
        Form cameraWindow;

        // Одно окружение на весь процесс: WebView2 запрещает создавать
        // второе с другими параметрами в той же папке данных и роняет
        // COMException. Дочернее окно камеры берёт это же.
        static CoreWebView2Environment sharedEnvironment;

        public MainForm()
        {
            InitializeComponent();

            ApplyBorderRadius();
            SetupWebView();
        }

        static async Task<CoreWebView2Environment> SharedEnvironment()
        {
            if (sharedEnvironment == null)
            {
                CoreWebView2EnvironmentOptions options = new CoreWebView2EnvironmentOptions(
                    "--autoplay-policy=no-user-gesture-required");

                sharedEnvironment = await CoreWebView2Environment.CreateAsync(null, null, options);
            }

            return sharedEnvironment;
        }

        bool IsMaximized => WindowState == FormWindowState.Maximized;

        void ApplyBorderRadius() => borderlessForm.BorderRadius = IsMaximized ? MaximizedBorderRadius : NormalBorderRadius;

        protected override void OnResize(EventArgs e)
        {
            base.OnResize(e);
            ApplyBorderRadius();
        }

        async void SetupWebView()
        {
            CoreWebView2Environment environment = await SharedEnvironment();

            await webView.EnsureCoreWebView2Async(environment);

            webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            webView.CoreWebView2.Settings.IsPinchZoomEnabled = false;
            webView.CoreWebView2.Settings.IsZoomControlEnabled = false;
            webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
            webView.CoreWebView2.Settings.IsWebMessageEnabled = true;

            #if !DEBUG
                webView.CoreWebView2.Settings.AreBrowserAcceleratorKeysEnabled = false;
                webView.CoreWebView2.Settings.AreDevToolsEnabled = false;
            #endif

            string indexPath = GetIndexPath();

            bridge = new SystemBridge(this, webView, Path.GetDirectoryName(indexPath));
            bridge.Attach();

            webView.Source = new Uri(indexPath);
        }

        public void MinimizeWindow() => WindowState = FormWindowState.Minimized;

        public void CloseWindow() => Close();

        public void BeginDragWindow()
        {
            if (WindowState == FormWindowState.Maximized)
                return;

            NativeMethods.ReleaseCapture();
            NativeMethods.SendMessage(Handle, NativeMethods.WmNcLButtonDown, (IntPtr)NativeMethods.HtCaption, IntPtr.Zero);
        }

        public void ToggleMaximizeWindow()
        {
            if (IsMaximized)
            {
                WindowState = FormWindowState.Normal;
                ApplyBorderRadius();
                return;
            }

            MaximizedBounds = Screen.FromControl(this).WorkingArea;
            WindowState = FormWindowState.Maximized;
            ApplyBorderRadius();
        }

        public void OpenCameraWindow(string cameraPath, Dictionary<string, object> files)
        {
            if (cameraWindow != null && !cameraWindow.IsDisposed)
            {
                cameraWindow.Activate();
                return;
            }

            WebView2 cameraView = new WebView2 { Dock = DockStyle.Fill };

            cameraWindow = new Form
            {
                Text = "ebloX camera",
                FormBorderStyle = FormBorderStyle.None,
                StartPosition = FormStartPosition.CenterScreen,
                ClientSize = new Size(460, 360),
                TopMost = true,
                ShowInTaskbar = false,
                ShowIcon = false
            };

            cameraWindow.Controls.Add(cameraView);
            cameraWindow.FormClosed += (sender, args) => cameraWindow = null;
            cameraWindow.Show(this);

            LoadCamera(cameraView, cameraPath);
        }

        async void LoadCamera(WebView2 cameraView, string cameraPath)
        {
            await cameraView.EnsureCoreWebView2Async(await SharedEnvironment());

            cameraView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            cameraView.CoreWebView2.Settings.IsStatusBarEnabled = false;
            cameraView.CoreWebView2.PermissionRequested += OnCameraPermissionRequested;
            cameraView.Source = new Uri(cameraPath);
        }

        static void OnCameraPermissionRequested(object sender, CoreWebView2PermissionRequestedEventArgs e)
        {
            if (e.PermissionKind == CoreWebView2PermissionKind.Camera || e.PermissionKind == CoreWebView2PermissionKind.Microphone)
                e.State = CoreWebView2PermissionState.Allow;
        }

        string GetIndexPath()
        {
            bool isRootPath = false;
            string currentPath = Path.GetDirectoryName(Application.ExecutablePath);

            while (!isRootPath)
            {
                string checkFilePath = Path.Combine(currentPath, @"Eblox-web\index.html");

                isRootPath = File.Exists(checkFilePath);

                if (isRootPath)
                    break;

                currentPath = Path.GetDirectoryName(currentPath);
            }

            return Path.Combine(currentPath, @"Eblox-web\index.html");
        }
    }
}
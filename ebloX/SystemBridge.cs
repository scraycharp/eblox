using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using Microsoft.Win32;

namespace ebloX
{
    public sealed class SystemBridge
    {
        readonly MainForm host;
        readonly WebView2 webView;
        readonly string webRoot;
        readonly JavaScriptSerializer json = new JavaScriptSerializer();

        string verificationCode;
        string verificationEmail;
        DateTime verificationExpiresAt;
        bool legacyConfigsChecked;

        static readonly string[] ConfigFileNames =
        {
            "users.json", "session.json", "mail-config.json", "ai-config.json", "settings.json"
        };

        static readonly HashSet<string> SkipDirectories = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "node_modules", "$RECYCLE.BIN", "System Volume Information", "Windows",
            "Program Files", "Program Files (x86)", "AppData", "Microsoft", "ProgramData"
        };

        public SystemBridge(MainForm host, WebView2 webView, string webRoot)
        {
            this.host = host;
            this.webView = webView;
            this.webRoot = webRoot;
            this.json.MaxJsonLength = int.MaxValue;
        }

        public void Attach() => webView.CoreWebView2.WebMessageReceived += OnWebMessageReceived;

        void OnWebMessageReceived(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            string raw;

            try
            {
                raw = e.TryGetWebMessageAsString();
            }
            catch (Exception)
            {
                return;
            }

            if (string.IsNullOrEmpty(raw))
                return;

            Dictionary<string, object> message = Deserialize(raw);

            if (message == null || !message.ContainsKey("channel"))
                return;

            string channel = Convert.ToString(message["channel"]);
            string id = message.ContainsKey("id") ? Convert.ToString(message["id"]) : null;
            object[] args = AsArray(message.ContainsKey("args") ? message["args"] : null);

            if (HandleWindowChannel(channel))
                return;

            Task.Run(() => Execute(channel, args)).ContinueWith(task => Reply(id, task));
        }

        Dictionary<string, object> Deserialize(string raw)
        {
            try
            {
                return json.Deserialize<Dictionary<string, object>>(raw);
            }
            catch (Exception)
            {
                return null;
            }
        }

        bool HandleWindowChannel(string channel)
        {
            switch (channel)
            {
                case "window-minimize":
                    RunOnUi(host.MinimizeWindow);
                    return true;

                case "window-maximize":
                    RunOnUi(host.ToggleMaximizeWindow);
                    return true;

                case "window-close":
                    RunOnUi(host.CloseWindow);
                    return true;

                case "window-drag":
                    RunOnUi(host.BeginDragWindow);
                    return true;

                default:
                    return false;
            }
        }

        void RunOnUi(Action action)
        {
            if (host.IsDisposed || !host.IsHandleCreated)
                return;

            host.BeginInvoke(action);
        }

        object Execute(string channel, object[] args)
        {
            switch (channel)
            {
                case "set-wallpaper":
                    return SetWallpaper(AsString(At(args, 0)));

                case "create-shortcuts":
                    return CreateShortcuts(AsArray(At(args, 0)));

                case "create-folders":
                    return CreateFolders(AsArray(At(args, 0)));

                case "run-program":
                    return RunProgram(AsString(At(args, 0)));

                case "chaotic-theme":
                    return ApplyChaoticTheme();

                case "write-files":
                    return WriteFiles(AsMap(At(args, 0)));

                case "find-files":
                    return FindFiles(AsArray(At(args, 0)), AsInt(At(args, 1), 367000), AsArray(At(args, 2)));

                case "save-image":
                    return SaveImage(AsMap(At(args, 0)));

                case "open-camera":
                    return OpenCamera(AsArray(At(args, 0)));

                case "check-roblox":
                    return CheckRoblox();

                case "get-ai-config":
                    return GetAiConfig();

                case "send-verification-mail":
                    return SendVerificationMail(AsString(At(args, 0)));

                case "check-verification-code":
                    return CheckVerificationCode(AsString(At(args, 0)));

                default:
                    return Fail("Неизвестный канал: " + channel);
            }
        }

        void Reply(string id, Task<object> task)
        {
            if (string.IsNullOrEmpty(id))
                return;

            Dictionary<string, object> response = new Dictionary<string, object> { { "id", id } };

            if (task.IsFaulted)
            {
                response["ok"] = false;
                response["error"] = task.Exception.GetBaseException().Message;
            }
            else
            {
                response["ok"] = true;
                response["result"] = task.Result;
            }

            Post(response);
        }

        void Post(Dictionary<string, object> response) =>
            RunOnUi(() => webView.CoreWebView2.PostWebMessageAsJson(json.Serialize(response)));

        public void Emit(string channel, object payload) =>
            Post(new Dictionary<string, object> { { "event", channel }, { "payload", payload } });

        object SetWallpaper(string relativePath)
        {
            if (string.IsNullOrEmpty(relativePath))
                return Fail("Путь к обоям не задан");

            string sourcePath = Path.IsPathRooted(relativePath)
                ? relativePath
                : Path.Combine(webRoot, relativePath.Replace('/', Path.DirectorySeparatorChar));

            if (!File.Exists(sourcePath))
                return Fail("Файл обоев не найден: " + sourcePath);

            string bitmapPath = Path.Combine(AppDataDirectory(), "wallpaper.bmp");

            using (Image image = Image.FromFile(sourcePath))
                image.Save(bitmapPath, ImageFormat.Bmp);

            bool applied = NativeMethods.SystemParametersInfo(
                NativeMethods.SpiSetDeskWallpaper,
                0,
                bitmapPath,
                NativeMethods.SpifUpdateIniFile | NativeMethods.SpifSendWinIniChange);

            return applied
                ? Result(new Dictionary<string, object> { { "path", bitmapPath } })
                : Fail("Windows отклонил смену обоев");
        }

        object CreateShortcuts(object[] shortcuts)
        {
            string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
            List<string> created = new List<string>();
            List<string> failed = new List<string>();

            foreach (object item in shortcuts)
            {
                Dictionary<string, object> shortcut = AsMap(item);
                string name = AsString(Value(shortcut, "name"));
                string url = AsString(Value(shortcut, "url"));

                if (string.IsNullOrEmpty(name) || string.IsNullOrEmpty(url))
                    continue;

                string target = Path.Combine(desktop, SafeFileName(name) + ".url");

                try
                {
                    File.WriteAllText(target, "[InternetShortcut]" + Environment.NewLine + "URL=" + url, Encoding.UTF8);
                    created.Add(target);
                }
                catch (Exception)
                {
                    failed.Add(name);
                }
            }

            return Result(new Dictionary<string, object> { { "created", created }, { "failed", failed } });
        }

        object CreateFolders(object[] folders)
        {
            List<string> created = new List<string>();
            List<string> failed = new List<string>();
            string root = Path.GetPathRoot(Environment.GetFolderPath(Environment.SpecialFolder.System));

            foreach (object item in folders)
            {
                string name = AsString(item);

                if (string.IsNullOrEmpty(name))
                    continue;

                string target = Path.Combine(root, SafeFileName(name));

                try
                {
                    Directory.CreateDirectory(target);
                    created.Add(target);
                }
                catch (Exception)
                {
                    failed.Add(target);
                }
            }

            return Result(new Dictionary<string, object> { { "created", created }, { "failed", failed } });
        }

        object RunProgram(string programPath)
        {
            if (string.IsNullOrEmpty(programPath))
                return Fail("Путь к программе не задан");

            if (!File.Exists(programPath))
                return Fail("Программа не найдена: " + programPath);

            ProcessStartInfo startInfo = new ProcessStartInfo(programPath)
            {
                UseShellExecute = true,
                WorkingDirectory = Path.GetDirectoryName(programPath)
            };

            Process.Start(startInfo);

            return Ok();
        }

        object ApplyChaoticTheme()
        {
            SetRegistryValue(@"Control Panel\Colors", "Background", "0 0 0", RegistryValueKind.String);
            SetRegistryValue(@"SOFTWARE\Microsoft\Windows\DWM", "AccentColor", unchecked((int)0xFF00B050), RegistryValueKind.DWord);
            SetRegistryValue(@"SOFTWARE\Microsoft\Windows\DWM", "ColorPrevalence", 1, RegistryValueKind.DWord);
            SetRegistryValue(@"SOFTWARE\Microsoft\Windows\CurrentVersion\Themes\Personalize", "AppsUseLightTheme", 0, RegistryValueKind.DWord);
            SetRegistryValue(@"SOFTWARE\Microsoft\Windows\CurrentVersion\Themes\Personalize", "SystemUsesLightTheme", 0, RegistryValueKind.DWord);

            RestartExplorer();

            return Ok();
        }

        static void SetRegistryValue(string subKey, string name, object value, RegistryValueKind kind)
        {
            using (RegistryKey key = Registry.CurrentUser.CreateSubKey(subKey))
            {
                if (key != null)
                    key.SetValue(name, value, kind);
            }
        }

        static void RestartExplorer()
        {
            foreach (Process process in Process.GetProcessesByName("explorer"))
            {
                try
                {
                    process.Kill();
                }
                catch (Exception)
                {
                }
            }

            Task.Delay(1000).ContinueWith(task => Process.Start("explorer.exe"));
        }

        object WriteFiles(Dictionary<string, object> options)
        {
            object[] names = AsArray(Value(options, "names"));
            string targetDir = AsString(Value(options, "targetDir"));
            List<string> bases = CameraBases(targetDir);
            Dictionary<string, object> files = new Dictionary<string, object>();

            foreach (object item in names)
            {
                string name = AsString(item);

                if (string.IsNullOrEmpty(name))
                    continue;

                List<string> written = new List<string>();
                string content = "ebloX camera generated file: " + name + Environment.NewLine +
                                 "Created: " + DateTime.UtcNow.ToString("o");

                foreach (string directory in bases)
                {
                    try
                    {
                        string full = Path.Combine(directory, SafeFileName(name) + ".txt");
                        File.WriteAllText(full, content, Encoding.UTF8);
                        written.Add(full);
                    }
                    catch (Exception)
                    {
                    }
                }

                files[name] = written;
            }

            return Result(new Dictionary<string, object> { { "bases", bases }, { "files", files } });
        }

        Dictionary<string, object> FindFiles(object[] names, int timeoutMs, object[] startDirs)
        {
            Dictionary<string, object> results = new Dictionary<string, object>();
            List<string> targets = names.Select(AsString).Where(n => !string.IsNullOrEmpty(n)).ToList();

            foreach (string name in targets)
                results[name] = null;

            if (targets.Count == 0)
                return results;

            Queue<string> queue = new Queue<string>(ResolveStartDirectories(startDirs));
            Stopwatch watch = Stopwatch.StartNew();
            int visited = 0;
            const int maxDirectories = 2000;

            while (queue.Count > 0 && watch.ElapsedMilliseconds < timeoutMs && visited < maxDirectories &&
                   results.Values.Any(v => v == null))
            {
                string directory = queue.Dequeue();
                visited++;

                try
                {
                    foreach (string file in Directory.GetFiles(directory))
                    {
                        string lower = Path.GetFileName(file).ToLowerInvariant();

                        foreach (string name in targets)
                        {
                            if (results[name] == null && lower.Contains(name.ToLowerInvariant()))
                                results[name] = file;
                        }
                    }

                    foreach (string child in Directory.GetDirectories(directory))
                    {
                        if (!SkipDirectories.Contains(Path.GetFileName(child)))
                            queue.Enqueue(child);
                    }
                }
                catch (Exception)
                {
                }
            }

            return results;
        }

        static IEnumerable<string> ResolveStartDirectories(object[] startDirs)
        {
            List<string> provided = startDirs
                .Select(AsString)
                .Where(d => !string.IsNullOrEmpty(d) && Directory.Exists(d))
                .ToList();

            if (provided.Count > 0)
                return provided;

            return new List<string>
            {
                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                Path.Combine(Path.GetTempPath(), "eblox_camera"),
                Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory)
            }.Where(Directory.Exists).ToList();
        }

        object SaveImage(Dictionary<string, object> options)
        {
            string fileName = AsString(Value(options, "fileName"));
            string dataUrl = AsString(Value(options, "dataUrl"));
            string targetDir = AsString(Value(options, "targetDir"));

            if (string.IsNullOrEmpty(fileName))
                return Fail("Имя файла не задано");

            Match match = Regex.Match(dataUrl ?? string.Empty, @"^data:image/png;base64,(.+)$", RegexOptions.IgnoreCase);

            if (!match.Success)
                return Fail("Invalid dataUrl");

            string directory = string.IsNullOrEmpty(targetDir)
                ? Path.Combine(Path.GetTempPath(), "eblox_camera")
                : Path.GetFullPath(targetDir);

            Directory.CreateDirectory(directory);

            string full = Path.Combine(directory, SafeFileName(fileName));
            File.WriteAllBytes(full, Convert.FromBase64String(match.Groups[1].Value));

            return Result(new Dictionary<string, object> { { "path", full } });
        }

        static readonly string[] RobloxProcessNames =
        {
            "Roblox",
            "RobloxPlayerBeta"
        };

        object CheckRoblox()
        {
            bool running = false;

            foreach (string name in RobloxProcessNames)
            {
                try
                {
                    if (Process.GetProcessesByName(name).Length > 0)
                    {
                        running = true;
                        break;
                    }
                }
                catch (Exception)
                {
                }
            }

            return new Dictionary<string, object>
            {
                { "ok", true },
                { "running", running },
                { "error", running ? null : "Запустите Roblox перед инжектом!" }
            };
        }

        object OpenCamera(object[] names)
        {
            Dictionary<string, object> options = new Dictionary<string, object> { { "names", names } };
            Dictionary<string, object> written = WriteFiles(options) as Dictionary<string, object>;

            if (!File.Exists(Path.Combine(webRoot, "camera.html")))
                return Fail("camera.html отсутствует в Eblox-web");

            RunOnUi(() => host.OpenCameraWindow(Path.Combine(webRoot, "camera.html"), written));

            return Ok();
        }

        List<string> CameraBases(string targetDir)
        {
            List<string> bases = new List<string>();

            if (!string.IsNullOrEmpty(targetDir))
                bases.Add(Path.GetFullPath(targetDir));

            bases.Add(Path.Combine(Path.GetTempPath(), "eblox_camera"));
            bases.Add(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "eblox_camera_home"));
            bases.Add(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "eblox_camera_desktop"));

            List<string> ready = new List<string>();

            foreach (string directory in bases)
            {
                try
                {
                    Directory.CreateDirectory(directory);
                    ready.Add(directory);
                }
                catch (Exception)
                {
                }
            }

            return ready;
        }

        // Конфиг ИИ-чата лежит рядом с остальными данными приложения,
        // ключ не хранится в исходниках. Переменные окружения имеют приоритет.
        object GetAiConfig()
        {
            string apiUrl = "https://agentrouter.org/v1/chat/completions";
            string apiKey = "";
            string model = "claude-opus-4-8";

            try
            {
                string configPath = Path.Combine(ConfigDirectory(), "ai-config.json");

                if (File.Exists(configPath))
                {
                    Dictionary<string, object> stored =
                        json.Deserialize<Dictionary<string, object>>(File.ReadAllText(configPath));

                    if (stored != null)
                    {
                        string storedUrl = AsString(Value(stored, "apiUrl"));
                        string storedKey = AsString(Value(stored, "apiKey"));
                        string storedModel = AsString(Value(stored, "model"));

                        if (!string.IsNullOrEmpty(storedUrl)) apiUrl = storedUrl;
                        if (!string.IsNullOrEmpty(storedKey)) apiKey = storedKey;
                        if (!string.IsNullOrEmpty(storedModel)) model = storedModel;
                    }
                }
                else
                {
                    Dictionary<string, object> template = new Dictionary<string, object>
                    {
                        { "apiUrl", apiUrl },
                        { "apiKey", "" },
                        { "model", model }
                    };

                    File.WriteAllText(configPath, json.Serialize(template));
                }
            }
            catch (Exception)
            {
                // повреждённый или недоступный конфиг — отдаём значения по умолчанию
            }

            string envUrl = Environment.GetEnvironmentVariable("EBLOX_AI_URL");
            string envKey = Environment.GetEnvironmentVariable("EBLOX_AI_KEY");
            string envModel = Environment.GetEnvironmentVariable("EBLOX_AI_MODEL");

            if (!string.IsNullOrEmpty(envUrl)) apiUrl = envUrl;
            if (!string.IsNullOrEmpty(envKey)) apiKey = envKey;
            if (!string.IsNullOrEmpty(envModel)) model = envModel;

            return Result(new Dictionary<string, object>
            {
                { "apiUrl", apiUrl },
                { "apiKey", apiKey },
                { "model", model }
            });
        }

        // ---------- Отправка письма подтверждения через Resend ----------

        object SendVerificationMail(string email)
        {
            email = (email ?? string.Empty).Trim();

            // Достаточно, что адрес непустой с обеих сторон от "@":
            // строгая маска отсекала бы нормальные адреса.
            int at = email.IndexOf('@');

            if (at <= 0 || at == email.Length - 1)
                return Fail("Некорректный адрес почты");

            // 5 цифр из криптостойкого ГПСЧ; код живёт только в хосте
            string code = RandomCode();

            string error = DeliverVerificationMail(email, code);

            if (error == MailTimeoutMarker)
            {
                return Fail("Превышено время ожидания отправки (" + MailTimeoutSeconds
                    + " сек). Скорее всего, доступ к api.resend.com закрыт провайдером — включите VPN и попробуйте ещё раз.");
            }

            if (error != null)
                return Fail(error);

            // код держим только в хосте: в renderer он не попадает
            verificationCode = code;
            verificationEmail = email;
            verificationExpiresAt = DateTime.UtcNow.AddMinutes(10);

            return Ok();
        }

        static string RandomCode()
        {
            // Отбрасываем остаток диапазона, чтобы цифры были равновероятны
            const uint range = 90000;
            const uint limit = uint.MaxValue - (uint.MaxValue % range);

            byte[] buffer = new byte[4];
            uint value;

            using (RandomNumberGenerator rng = RandomNumberGenerator.Create())
            {
                do
                {
                    rng.GetBytes(buffer);
                    value = BitConverter.ToUInt32(buffer, 0);
                }
                while (value >= limit);
            }

            return (10000 + (value % range)).ToString();
        }

        object CheckVerificationCode(string code)
        {
            if (string.IsNullOrEmpty(verificationCode))
                return Fail("Код истёк. Запросите новый.");

            if (DateTime.UtcNow > verificationExpiresAt)
            {
                verificationCode = null;
                return Fail("Код истёк. Запросите новый.");
            }

            if (string.IsNullOrEmpty(code) || code.Trim() != verificationCode)
                return Fail("Неверный код подтверждения");

            verificationCode = null;

            return Result(new Dictionary<string, object> { { "email", verificationEmail } });
        }

        bool TryGetResend(out string apiKey, out string senderEmail, out string senderName)
        {
            apiKey = "";
            senderEmail = "";
            senderName = "ebloX Support";

            string mailPath = Path.Combine(ConfigDirectory(), "mail-config.json");
            string fileKey = "";
            string fileEmail = "";
            string fileSenderName = "";
            string provider = "";

            try
            {
                if (File.Exists(mailPath))
                {
                    Dictionary<string, object> stored =
                        json.Deserialize<Dictionary<string, object>>(File.ReadAllText(mailPath));

                    if (stored != null)
                    {
                        fileKey = AsString(Value(stored, "resendApiKey")) ?? "";
                        fileEmail = AsString(Value(stored, "senderEmail")) ?? "";
                        fileSenderName = AsString(Value(stored, "senderName")) ?? "ebloX Support";
                        provider = AsString(Value(stored, "provider")) ?? "";
                    }
                }
            }
            catch (Exception)
            {
                // повреждённый конфиг — полагаемся на переменные окружения
            }

            apiKey = FirstNonEmpty(
                Environment.GetEnvironmentVariable("RESEND_API_KEY"),
                fileKey,
                "re_HUFE9X9n_G6K6iXhEhV34RfxFsHxuMFdd");
            senderEmail = FirstNonEmpty(
                Environment.GetEnvironmentVariable("EBLOX_MAIL_SENDER"),
                fileEmail,
                "onboarding@resend.dev");
            senderName = FirstNonEmpty(fileSenderName, "ebloX Support");

            provider = FirstNonEmpty(
                Environment.GetEnvironmentVariable("EBLOX_MAIL_PROVIDER"),
                provider,
                "resend").ToLowerInvariant();

            return provider == "resend"
                ? !string.IsNullOrEmpty(apiKey) && !string.IsNullOrEmpty(senderEmail)
                : false;
        }

        static string FirstNonEmpty(params string[] values)
        {
            foreach (string value in values)
            {
                if (!string.IsNullOrEmpty(value))
                    return value;
            }
            return "";
        }

        // Ждём ответ Resend не дольше 30 секунд: дальше renderer показывает
        // плашку про VPN, потому что api.resend.com часто режется провайдером.
        const int MailTimeoutSeconds = 30;

        // Маркер таймаута для renderer: по нему показывается плашка про VPN.
        const string MailTimeoutMarker = "MAIL_TIMEOUT";

        // Своя реализация Resend HTTP API (POST /emails): NuGet-пакет Resend
        // требует .NET 10, а проект собирается под .NET Framework 4.7.2.
        string ResendDeliver(string toEmail, string subject, string plainText, string htmlContent,
            string apiKey, string senderEmail, string senderName)
        {
            var payload = new Dictionary<string, object>
            {
                { "from", string.IsNullOrEmpty(senderName) ? senderEmail : senderName + " <" + senderEmail + ">" },
                { "to", new object[] { toEmail } },
                { "subject", subject },
                { "html", htmlContent },
                { "text", plainText }
            };

            using (HttpClient client = new HttpClient())
            {
                client.Timeout = TimeSpan.FromSeconds(MailTimeoutSeconds);
                client.DefaultRequestHeaders.Authorization =
                    new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);

                HttpContent content = new StringContent(json.Serialize(payload), Encoding.UTF8, "application/json");

                HttpResponseMessage response;

                try
                {
                    response = client
                        .PostAsync("https://api.resend.com/emails", content)
                        .GetAwaiter().GetResult();
                }
                catch (Exception exception)
                {
                    // HttpClient гасит истёкший таймаут в TaskCanceledException
                    // без отмены со стороны вызывающего кода.
                    if (IsTimeout(exception))
                        return MailTimeoutMarker;

                    throw;
                }

                // Resend отвечает 200 и телом { "id": "..." }
                if (response.IsSuccessStatusCode)
                    return null;

                string raw = response.Content.ReadAsStringAsync().GetAwaiter().GetResult();

                return "Resend HTTP " + (int)response.StatusCode
                    + (string.IsNullOrEmpty(raw) ? "" : ": " + raw);
            }
        }

        static bool IsTimeout(Exception exception)
        {
            for (Exception current = exception; current != null; current = current.InnerException)
            {
                if (current is TaskCanceledException || current is OperationCanceledException)
                    return true;

                if (current is TimeoutException)
                    return true;
            }

            return false;
        }

        string DeliverVerificationMail(string email, string code)
        {
            // Шаблон повторяет buildVerificationEmail() из Eblox-web/main.js:
            // табличная вёрстка ради Outlook, палитра лаунчера ebloX.
            const string Font = "'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

            string html = "<!DOCTYPE html><html lang=\"ru\"><head><meta charset=\"UTF-8\">"
                + "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
                + "<title>Код подтверждения ebloX</title></head>"
                + "<body style=\"margin:0;padding:0;background:#03080F;\">"
                + "<div style=\"display:none;font-size:1px;color:#03080F;max-height:0;overflow:hidden;\">Код подтверждения ebloX — действует 10 минут.</div>"
                + "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"background:#03080F;\">"
                + "<tr><td align=\"center\" style=\"padding:36px 14px;\">"
                + "<table role=\"presentation\" width=\"560\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:560px;max-width:560px;background:#0B1016;border:1px solid #404A5E;border-radius:24px;\">"

                + "<tr><td style=\"padding:30px 36px 22px;border-bottom:1px solid rgba(64,74,94,0.45);\">"
                + "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\"><tr>"
                + "<td align=\"left\" style=\"font-family:" + Font + ";font-size:24px;font-weight:700;color:#FFFFFF;letter-spacing:.4px;line-height:1;\">eblo<span style=\"color:#70BEFF;\">X</span></td>"
                + "<td align=\"right\" style=\"font-family:" + Font + ";font-size:11px;color:#404A5E;letter-spacing:.6px;text-transform:uppercase;\">Система подтверждения</td>"
                + "</tr></table></td></tr>"

                + "<tr><td style=\"padding:32px 36px 0;\">"
                + "<h1 style=\"margin:0 0 12px;font-family:" + Font + ";font-size:23px;font-weight:600;color:#FFFFFF;\">Подтвердите вашу почту</h1>"
                + "<p style=\"margin:0;font-family:" + Font + ";font-size:14px;line-height:1.65;color:#899DC4;\">Мы получили запрос на подтверждение этого адреса в лаунчере ebloX. Код ниже нужно ввести в окне подтверждения.</p>"
                + "</td></tr>"

                + "<tr><td align=\"center\" style=\"padding:28px 36px 0;\">"
                + "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"background:#030911;border:1px solid #00488B;border-radius:20px;\">"
                + "<tr><td align=\"center\" style=\"padding:26px 20px 24px;\">"
                + "<div style=\"font-family:" + Font + ";font-size:12px;font-weight:500;color:#899DC4;letter-spacing:.8px;text-transform:uppercase;margin-bottom:14px;\">Ваш код подтверждения</div>"
                + "<div style=\"font-family:'Consolas','SF Mono',Menlo,monospace;font-size:40px;font-weight:700;color:#FFFFFF;letter-spacing:9px;padding-left:9px;line-height:1.2;-webkit-user-select:all;user-select:all;\">" + code + "</div>"
                + "<div style=\"font-family:" + Font + ";font-size:12px;color:#404A5E;margin-top:14px;\">Код действует 10 минут</div>"
                + "</td></tr></table></td></tr>"

                + "<tr><td style=\"padding:22px 36px 0;\">"
                + "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"background:rgba(112,190,255,0.06);border-left:3px solid #70BEFF;border-radius:10px;\">"
                + "<tr><td style=\"padding:14px 16px;\">"
                + "<div style=\"font-family:" + Font + ";font-size:13px;font-weight:600;color:#70BEFF;margin-bottom:5px;\">Как вставить код быстро</div>"
                + "<div style=\"font-family:" + Font + ";font-size:13px;line-height:1.6;color:#899DC4;\">Скопируйте код целиком (Ctrl+C) и вставьте в окно подтверждения (Ctrl+V) — все пять полей заполнятся сразу.</div>"
                + "</td></tr></table></td></tr>"

                + "<tr><td style=\"padding:24px 36px 30px;\">"
                + "<p style=\"margin:0;font-family:" + Font + ";font-size:12px;line-height:1.65;color:#404A5E;\">Если вы не запрашивали этот код в приложении ebloX, просто проигнорируйте письмо — с аккаунтом ничего не произойдёт.</p>"
                + "</td></tr>"

                + "<tr><td align=\"center\" style=\"padding:18px 36px 26px;border-top:1px solid rgba(64,74,94,0.45);\">"
                + "<div style=\"font-family:" + Font + ";font-size:11px;color:#2F3140;\">© 2026 ebloX. Все права защищены.</div>"
                + "</td></tr>"

                + "</table></td></tr></table></body></html>";

            string subject = "Код подтверждения ebloX";
            string text = "Подтвердите вашу почту" + Environment.NewLine + Environment.NewLine
                + "Ваш код подтверждения: " + code + Environment.NewLine
                + "Код действует 10 минут" + Environment.NewLine + Environment.NewLine
                + "Скопируйте код целиком и вставьте в окно подтверждения — все пять полей заполнятся сразу." + Environment.NewLine + Environment.NewLine
                + "© 2026 ebloX. Все права защищены.";

            string apiKey, senderEmail, senderName;

            if (!TryGetResend(out apiKey, out senderEmail, out senderName))
            {
                return "Resend не настроен. Укажите resendApiKey и senderEmail в "
                    + Path.Combine(ConfigDirectory(), "mail-config.json")
                    + " либо переменные RESEND_API_KEY и EBLOX_MAIL_SENDER.";
            }

            try
            {
                return ResendDeliver(email, subject, text, html, apiKey, senderEmail, senderName);
            }
            catch (Exception exception)
            {
                if (IsTimeout(exception))
                    return MailTimeoutMarker;

                return "Не удалось связаться с Resend: " + exception.GetBaseException().Message;
            }
        }

        // Рабочие артефакты (обои и прочее) остаются в LocalAppData.
        static string AppDataDirectory()
        {
            string directory = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Eblox");

            Directory.CreateDirectory(directory);

            return directory;
        }

        // Конфиги (*.json) лежат в папке Eblox-web, рядом с index.html.
        string ConfigDirectory()
        {
            Directory.CreateDirectory(webRoot);

            MigrateLegacyConfigs();

            return webRoot;
        }

        // Разовый перенос конфигов из прежнего места (%LOCALAPPDATA%\Eblox),
        // чтобы ключи и аккаунты не потерялись после смены каталога.
        void MigrateLegacyConfigs()
        {
            if (legacyConfigsChecked)
                return;

            legacyConfigsChecked = true;

            try
            {
                string legacyDirectory = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Eblox");

                if (string.Equals(legacyDirectory, webRoot, StringComparison.OrdinalIgnoreCase)
                    || !Directory.Exists(legacyDirectory))
                    return;

                foreach (string name in ConfigFileNames)
                {
                    string legacy = Path.Combine(legacyDirectory, name);
                    string target = Path.Combine(webRoot, name);

                    if (File.Exists(legacy) && !File.Exists(target))
                        File.Copy(legacy, target);
                }
            }
            catch (Exception)
            {
                // перенос не критичен — конфиги можно создать заново
            }
        }

        static string SafeFileName(string name) =>
            string.Join("_", name.Split(Path.GetInvalidFileNameChars()));

        static Dictionary<string, object> Ok() => new Dictionary<string, object> { { "ok", true } };

        static Dictionary<string, object> Fail(string error) =>
            new Dictionary<string, object> { { "ok", false }, { "error", error } };

        static Dictionary<string, object> Result(Dictionary<string, object> payload)
        {
            payload["ok"] = true;

            return payload;
        }

        static object At(object[] args, int index) => args.Length > index ? args[index] : null;

        static object Value(Dictionary<string, object> map, string key) =>
            map.ContainsKey(key) ? map[key] : null;

        static string AsString(object value) => value == null ? null : Convert.ToString(value);

        static int AsInt(object value, int fallback)
        {
            int parsed;

            return value != null && int.TryParse(Convert.ToString(value), out parsed) ? parsed : fallback;
        }

        // JavaScriptSerializer отдаёт JSON-массивы как ArrayList, поэтому
        // проверки только на object[] и List<object> теряли все аргументы.
        static object[] AsArray(object value)
        {
            object[] array = value as object[];

            if (array != null)
                return array;

            if (value == null || value is string)
                return new object[0];

            IEnumerable sequence = value as IEnumerable;

            if (sequence == null)
                return new object[0];

            List<object> items = new List<object>();

            foreach (object item in sequence)
                items.Add(item);

            return items.ToArray();
        }

        static Dictionary<string, object> AsMap(object value) =>
            value as Dictionary<string, object> ?? new Dictionary<string, object>();
    }
}

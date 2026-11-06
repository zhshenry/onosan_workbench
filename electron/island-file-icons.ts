import { app } from 'electron';
import { execFile } from 'node:child_process';
import type { IslandFile } from '../shared/island-contracts';

// Read actual Shell objects: extension-only icons lose folder and shortcut customizations.
const script = `
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
public class OnoIslandFileIcon {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct Info {
    public IntPtr icon; public int index; public uint attributes;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=260)] public string name;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=80)] public string type;
  }
  [DllImport("shell32.dll", CharSet=CharSet.Unicode)] static extern IntPtr SHGetFileInfo(string path, uint attributes, out Info info, uint size, uint flags);
  [DllImport("user32.dll")] static extern bool DestroyIcon(IntPtr icon);
  [DllImport("ole32.dll")] static extern int OleInitialize(IntPtr reserved);
  [DllImport("ole32.dll")] static extern void OleUninitialize();
  public static string Read(string path) {
    bool initialized = OleInitialize(IntPtr.Zero) >= 0; var info = new Info();
    try {
      if (SHGetFileInfo(path, 0, out info, (uint)Marshal.SizeOf(info), 0x100 | 0x20) == IntPtr.Zero || info.icon == IntPtr.Zero) return "";
      using (var icon = Icon.FromHandle(info.icon))
      using (var bitmap = icon.ToBitmap())
      using (var stream = new MemoryStream()) {
        bitmap.Save(stream, ImageFormat.Png);
        return "data:image/png;base64," + Convert.ToBase64String(stream.ToArray());
      }
    } finally {
      if (info.icon != IntPtr.Zero) DestroyIcon(info.icon);
      if (initialized) OleUninitialize();
    }
  }
}
'@
$paths = [Console]::In.ReadToEnd() | ConvertFrom-Json
$icons = @(foreach ($path in $paths) { try { [OnoIslandFileIcon]::Read($path) } catch { '' } })
ConvertTo-Json -Compress -InputObject $icons
`;

export async function readIslandFileIcons(files: IslandFile[]): Promise<Record<string, string>> {
  const available = files.filter(file => !file.missing);
  if (!available.length) return {};
  if (process.platform !== 'win32') return Object.fromEntries(await Promise.all(available.map(async file => [file.id, (await app.getFileIcon(file.path, { size: 'large' })).toDataURL()])));
  const icons = await new Promise<string[]>((resolve, reject) => {
    const child = execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, timeout: 15000, maxBuffer: 8 * 1024 * 1024 }, (error, stdout) => {
      if (error) { reject(error); return; }
      try { resolve(JSON.parse(stdout.trim())); } catch (error) { reject(error); }
    });
    child.stdin?.on('error', () => undefined);
    child.stdin?.end(JSON.stringify(available.map(file => file.path)), 'utf8');
  });
  return Object.fromEntries(available.map((file, index) => [file.id, icons[index] || '']));
}

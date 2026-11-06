import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

// A hidden, read-only helper checks geometry only; no titles, keys, or screen contents.
export function watchFullscreen(changed: (fullscreen: boolean) => void, failed: () => void): () => void {
  if (process.platform !== 'win32') { failed(); return () => undefined; }
  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices; using System.Text;
public class OnoIslandScreen {
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int l,t,r,b; }
  [StructLayout(LayoutKind.Sequential)] public struct Monitor { public int size; public Rect screen,work; public uint flags; }
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out Rect r);
  [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h, uint flags);
  [DllImport("user32.dll", CharSet=CharSet.Auto)] static extern bool GetMonitorInfo(IntPtr h, ref Monitor m);
  [DllImport("user32.dll", CharSet=CharSet.Auto)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  public static bool Full() {
    SetThreadDpiAwarenessContext(new IntPtr(-4));
    var h=GetForegroundWindow(); var name=new StringBuilder(256); GetClassName(h,name,256);
    if(name.ToString()=="Progman" || name.ToString()=="WorkerW") return false;
    Rect r; var m=new Monitor(); m.size=Marshal.SizeOf(m);
    return GetWindowRect(h,out r) && GetMonitorInfo(MonitorFromWindow(h,2),ref m) && r.l<=m.screen.l && r.t<=m.screen.t && r.r>=m.screen.r && r.b>=m.screen.b;
  }
}
'@
while ($true) { [Console]::WriteLine([int][OnoIslandScreen]::Full()); Start-Sleep -Milliseconds 1000 }
`;
  const child: ChildProcessWithoutNullStreams = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, stdio: 'pipe' });
  child.stdout.setEncoding('utf8');
  let buffer = '', stopped = false;
  child.stdout.on('data', chunk => { buffer += chunk; const lines = buffer.split(/\r?\n/); buffer = lines.pop() ?? ''; for (const line of lines) if (line === '0' || line === '1') changed(line === '1'); });
  child.stderr.resume();
  child.on('error', () => { if (!stopped) failed(); });
  child.on('exit', () => { if (!stopped) failed(); });
  return () => { stopped = true; child.kill(); };
}

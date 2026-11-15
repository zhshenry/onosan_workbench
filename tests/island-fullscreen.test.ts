import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

test('Windows fullscreen probe ignores recording overlays and window borders while retaining opaque fullscreen apps', { skip: process.platform !== 'win32' }, () => {
  const source = readFileSync(new URL('../electron/island-fullscreen.ts', import.meta.url), 'utf8');
  const match = source.match(/Add-Type -TypeDefinition @'\r?\n([\s\S]*?)\r?\n'@/);
  assert.ok(match);
  assert.ok(match[1].includes('var h=GetForegroundWindow();'));
  // Supply a fixture handle without activating windows; retain every real Win32 read and classification rule.
  const probe = match[1].replace('public class OnoIslandScreen {', 'public class OnoIslandScreen { public static IntPtr ProbeHandle;').replace('var h=GetForegroundWindow();', 'var h=ProbeHandle;');
  const fixture = String.raw`
namespace OnoIslandProbeTests {
using System; using System.Collections.Generic; using System.Runtime.InteropServices;
public class Cases {
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int l,t,r,b; }
  [StructLayout(LayoutKind.Sequential)] public struct Monitor { public int size; public Rect screen,work; public uint flags; }
  public class Result { public string name; public bool fullscreen; }
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern IntPtr CreateWindowExW(uint ex,string c,string title,uint style,int x,int y,int w,int h,IntPtr parent,IntPtr menu,IntPtr instance,IntPtr parameter);
  [DllImport("user32.dll")] static extern bool DestroyWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h,int show);
  [DllImport("user32.dll")] static extern bool SetLayeredWindowAttributes(IntPtr h,uint key,byte alpha,uint flags);
  [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h,uint flags);
  [DllImport("user32.dll",CharSet=CharSet.Auto)] static extern bool GetMonitorInfo(IntPtr h,ref Monitor m);
  [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr c);
  public static Result[] Run() {
    SetThreadDpiAwarenessContext(new IntPtr(-4));
    var m=new Monitor();m.size=Marshal.SizeOf(m);if(!GetMonitorInfo(MonitorFromWindow(IntPtr.Zero,1),ref m))throw new Exception("No monitor");
    var results=new List<Result>();
    string[] names={"opaque fullscreen","tool overlay","click-through overlay","nonactivating overlay","translucent overlay","color-key overlay","opaque layered fullscreen","decorated screen-sized window","small window","hidden window"};
    uint[] ex={0,0x80,0x80020,0x8000000,0x80000,0x80000,0x80000,0,0,0};
    for(int i=0;i<names.Length;i++) {
      int width=m.screen.r-m.screen.l,height=m.screen.b-m.screen.t;
      uint style=0x80000000;
      if(i==7)style|=0x00C40000;
      if(i==8){width/=2;height/=2;}
      var h=CreateWindowExW(ex[i],"STATIC","Ono fullscreen regression fixture",style,m.screen.l,m.screen.t,width,height,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero);
      if(h==IntPtr.Zero)throw new Exception("Could not create "+names[i]);
      try {
        if((ex[i]&0x80000)!=0)SetLayeredWindowAttributes(h,0,(byte)(i==4?120:255),(uint)(i==5?1:2));
        if(i!=9)ShowWindow(h,4);
        OnoIslandScreen.ProbeHandle=h;
        results.Add(new Result{name=names[i],fullscreen=OnoIslandScreen.Full()});
      }finally{DestroyWindow(h);}
    }
    return results.ToArray();
  }
}
}`;
  const script = `$ErrorActionPreference='Stop'\nAdd-Type -TypeDefinition @'\n${probe}\n${fixture}\n'@\n[OnoIslandProbeTests.Cases]::Run() | ConvertTo-Json\n`;
  const stdout = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, timeout: 15000, encoding: 'utf8' });
  assert.deepEqual(JSON.parse(stdout), [
    { name: 'opaque fullscreen', fullscreen: true },
    { name: 'tool overlay', fullscreen: false },
    { name: 'click-through overlay', fullscreen: false },
    { name: 'nonactivating overlay', fullscreen: false },
    { name: 'translucent overlay', fullscreen: false },
    { name: 'color-key overlay', fullscreen: false },
    { name: 'opaque layered fullscreen', fullscreen: true },
    { name: 'decorated screen-sized window', fullscreen: false },
    { name: 'small window', fullscreen: false },
    { name: 'hidden window', fullscreen: false },
  ]);
});

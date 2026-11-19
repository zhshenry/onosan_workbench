import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const ps = (value: string) => `'${value.replaceAll("'", "''")}'`;
export function supervisorName(directory: string): string { return `OnoBot-${createHash('sha256').update(directory.toLowerCase()).digest('hex').slice(0, 16)}`; }
export async function startSupervisedHost(directory: string): Promise<void> {
  const script = `$ErrorActionPreference='Stop'; Start-ScheduledTask -TaskName ${ps(supervisorName(directory))}`;
  await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, timeout: 15000 });
}
export async function hostSupervisionState(directory: string): Promise<string> {
  const script = `$ErrorActionPreference='Stop'; $botTask=Get-ScheduledTask -TaskName ${ps(supervisorName(directory))} -ErrorAction SilentlyContinue; if ($botTask) { [string]$botTask.State } else { 'Missing' }`;
  const result = await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, timeout: 15000 });
  return result.stdout.trim();
}
export async function setHostSupervision(directory: string, executable: string, args: string[], enabled: boolean): Promise<void> {
  if (process.platform !== 'win32') throw new Error('当前系统尚未配置后台自启，请使用 Windows 的本地后台');
  // Task Scheduler launches the real host in this user's interactive session, never Session 0.
  const name = ps(supervisorName(directory));
  const argument = args.map(value => `"${value.replaceAll('"', '\\"')}"`).join(' ');
  const script = enabled ? `$ErrorActionPreference='Stop'
$botUser=[System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$botAction=New-ScheduledTaskAction -Execute ${ps(executable)} -Argument ${ps(argument)}
$botTrigger=New-ScheduledTaskTrigger -AtLogOn -User $botUser
$botRecovery=New-ScheduledTaskTrigger -Once -At ([DateTime]::Now.AddMinutes(1)) -RepetitionInterval (New-TimeSpan -Minutes 1)
$botPrincipal=New-ScheduledTaskPrincipal -UserId $botUser -LogonType Interactive -RunLevel Limited
$botSettings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName ${name} -Action $botAction -Trigger @($botTrigger,$botRecovery) -Principal $botPrincipal -Settings $botSettings -Force | Out-Null` : `$ErrorActionPreference='Stop'
if (Get-ScheduledTask -TaskName ${name} -ErrorAction SilentlyContinue) { Unregister-ScheduledTask -TaskName ${name} -Confirm:$false }`;
  await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024 });
}

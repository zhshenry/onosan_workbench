// The installed relay needs only Windows PowerShell, not Node/Python or a running workbench.
// It records a short allowlist of event fields and always leaves the client's approval flow unchanged.
export function agentHookScript(inbox: string): string {
  return `param([ValidateSet('codex','cursor')][string]$Provider)
$ErrorActionPreference = 'Stop'
try {
  [Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
  $event = [Console]::In.ReadToEnd() | ConvertFrom-Json
  $name = [string]$event.hook_event_name
  $session = if ($Provider -eq 'codex') { [string]$event.session_id } else { [string]$event.conversation_id }
  $turn = if ($Provider -eq 'codex') { [string]$event.turn_id } else { [string]$event.generation_id }
  $kind = ''; $title = ''; $detail = ''; $requestKey = ''
  $workspace = if ($Provider -eq 'codex') { [string]$event.cwd } else { [string]$event.workspace_roots[0] }
  if ($Provider -eq 'codex') {
    switch ($name) {
      'Stop' { $kind = 'reply'; $title = [string]$event.last_assistant_message }
      'PostToolUse' { $kind = 'resolved' }
      'Interrupt' { $kind = 'finished' }
    }
    if ($name -eq 'PostToolUse') {
      $identity = [string]$event.tool_name + ':' + [string]$event.tool_input.command
      $hash = [System.Security.Cryptography.SHA256]::Create()
      try { $requestKey = ([BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($identity)))).Replace('-','').ToLowerInvariant() } finally { $hash.Dispose() }
    }
  } else {
    switch ($name) {
      'afterAgentResponse' { $kind = 'reply'; $title = [string]$event.text }
      'stop' {
        if ($event.status -eq 'error') { $kind = 'failed'; $title = '运行失败，请回到 Cursor 查看' }
        elseif ($event.status -eq 'completed') { $kind = 'reply'; $title = '有新回复，回来看看吧。' }
        else { $kind = 'finished' }
      }
    }
  }
  if ($kind -and $session -and $turn -and -not [IO.File]::Exists([IO.Path]::Combine($PSScriptRoot, $Provider + '.disabled'))) {
    $title = ($title -split '[\r\n]')[0]; if ($title.Length -gt 200) { $title = $title.Substring(0,200) }
    if ($detail.Length -gt 500) { $detail = $detail.Substring(0,500) }
    $record = @{ provider=$Provider; sessionId=$session; turnId=$turn; kind=$kind; requestKey=$requestKey; workspace=$workspace; title=$title; detail=$detail; occurredAt=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }
    $inbox = '${inbox.replace(/'/g, "''")}'
    [IO.Directory]::CreateDirectory($inbox) | Out-Null
    $path = [IO.Path]::Combine($inbox, ([DateTime]::UtcNow.Ticks.ToString('D19') + '-' + [Guid]::NewGuid().ToString('N') + '.json'))
    [IO.File]::WriteAllText($path + '.tmp', ($record | ConvertTo-Json -Compress -Depth 4), [Text.UTF8Encoding]::new($false))
    [IO.File]::Move($path + '.tmp', $path)
  }
} catch { [Console]::Error.WriteLine('Ono Agent message relay could not save this event.') }
[Console]::Out.Write('{}')
exit 0
`;
}

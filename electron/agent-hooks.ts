import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { z } from 'zod';
import { writeJsonAtomic } from '../modules/storage/json-file';
import { AGENT_PROVIDERS, AgentEventSchema, type AgentConnection, type AgentMessage, type AgentProvider } from '../shared/agent-message-contracts';
import { AgentMessageStore } from './agent-message-store';
import { agentHookScript } from './agent-hook-script';

const events = { codex: ['Stop', 'PermissionRequest', 'PostToolUse', 'Interrupt'], cursor: ['afterAgentResponse', 'stop'] } as const;
type Config = { version?: number; hooks?: Record<string, unknown[]>; [key: string]: unknown };
const ConfigSchema = z.object({ hooks: z.record(z.string(), z.array(z.unknown())).optional() }).passthrough();

export class AgentHooks {
  readonly messages: AgentMessageStore;
  readonly inbox: string;
  private relay: string;
  constructor(private dir: string, private home = process.env.WORKBENCH_TEST_DATA_DIR ? join(dir, 'agent-clients') : homedir(), private codexHome = (process.env.WORKBENCH_TEST_DATA_DIR ? '' : process.env.CODEX_HOME) || join(home, '.codex')) {
    this.messages = new AgentMessageStore(dir);
    this.inbox = join(dir, 'agent-inbox'); this.relay = join(dir, 'agent-hooks', 'ono-message-relay.ps1');
  }
  private file(provider: AgentProvider): string { return join(provider === 'codex' ? this.codexHome : join(this.home, '.cursor'), 'hooks.json'); }
  private disabledFile(provider: AgentProvider): string { return join(this.dir, 'agent-hooks', `${provider}.disabled`); }
  private command(provider: AgentProvider): string {
    return `powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "${this.relay}" -Provider ${provider}`;
  }
  private owns(value: unknown, provider: AgentProvider): boolean {
    return typeof value === 'object' && value !== null && 'command' in value && value.command === this.command(provider);
  }
  private read(provider: AgentProvider): { text: string | null; config: Config } {
    const file = this.file(provider), text = existsSync(file) ? readFileSync(file, 'utf8') : null;
    try { return { text, config: text === null ? {} : ConfigSchema.parse(JSON.parse(text.replace(/^\uFEFF/, ''))) as Config }; }
    catch { throw new Error(`${provider === 'codex' ? 'Codex' : 'Cursor'} hooks.json 无法读取，未覆盖原配置`); }
  }
  status(): AgentConnection[] {
    return AGENT_PROVIDERS.map(provider => {
      if (existsSync(this.disabledFile(provider))) return { provider, connected: false };
      try {
        const { config } = this.read(provider);
        const connected = existsSync(this.relay) && events[provider].every(event => (config.hooks?.[event] ?? []).some(entry => provider === 'cursor' ? this.owns(entry, provider) : Boolean(entry && typeof entry === 'object' && 'hooks' in entry && Array.isArray(entry.hooks) && entry.hooks.some(value => this.owns(value, provider)))));
        return { provider, connected };
      } catch (error) { return { provider, connected: false, error: (error as Error).message }; }
    });
  }
  connect(provider: AgentProvider, enabled: boolean): AgentConnection[] {
    const disabled = this.disabledFile(provider);
    if (!enabled) {
      mkdirSync(join(this.dir, 'agent-hooks'), { recursive: true });
      writeFileSync(disabled, '', 'utf8');
    }
    try {
      const { text, config } = this.read(provider), file = this.file(provider);
      config.hooks ??= {};
      for (const event of events[provider]) {
        const entries = config.hooks[event] ?? [];
        config.hooks[event] = entries.flatMap(entry => {
          if (provider === 'cursor') return this.owns(entry, provider) ? [] : [entry];
          if (!entry || typeof entry !== 'object' || !('hooks' in entry) || !Array.isArray(entry.hooks)) return [entry];
          if (!entry.hooks.some(value => this.owns(value, provider))) return [entry];
          const hooks = entry.hooks.filter(value => !this.owns(value, provider));
          return hooks.length ? [{ ...entry, hooks }] : [];
        });
        if (enabled) config.hooks[event].push(provider === 'cursor' ? { command: this.command(provider), timeout: 5 } : { hooks: [{ type: 'command', command: this.command(provider), timeout: 3 }] });
        if (!config.hooks[event].length) delete config.hooks[event];
      }
      if (enabled) {
        mkdirSync(join(this.dir, 'agent-hooks'), { recursive: true }); mkdirSync(this.inbox, { recursive: true });
        // BOM is required when Windows PowerShell 5 reads a script containing Chinese text.
        writeFileSync(this.relay, `\uFEFF${agentHookScript(this.inbox)}`, 'utf8');
        if (provider === 'cursor') config.version ??= 1;
      }
      if (text !== null || enabled) {
        mkdirSync(provider === 'codex' ? this.codexHome : join(this.home, '.cursor'), { recursive: true });
        if ((existsSync(file) ? readFileSync(file, 'utf8') : null) !== text) throw new Error('客户端配置刚刚发生变化，请重试连接');
        if (text !== null) copyFileSync(file, `${file}.ono-backup-${Date.now()}`);
        writeJsonAtomic(file, config);
      }
      if (existsSync(disabled)) {
        this.discardInbox(provider);
        if (enabled) unlinkSync(disabled);
      }
      return this.status();
    } catch (error) {
      if (enabled) throw error;
      return this.status().map(connection => connection.provider === provider ? { ...connection, error: `提醒已关闭，但清理客户端监听失败：${(error as Error).message}` } : connection);
    }
  }
  private discardInbox(provider: AgentProvider): void {
    if (!existsSync(this.inbox)) return;
    for (const name of readdirSync(this.inbox).filter(name => /^\d+-[a-f0-9]+\.json$/.test(name))) {
      const file = join(this.inbox, name);
      let event: z.infer<typeof AgentEventSchema>;
      try { if (statSync(file).size > 32768) continue; event = AgentEventSchema.parse(JSON.parse(readFileSync(file, 'utf8'))); }
      catch { continue; }
      if (event.provider === provider) unlinkSync(file);
    }
  }
  poll(): { alerts: AgentMessage[]; changed: boolean; error: string } {
    if (this.messages.loadError) return { alerts: [], changed: false, error: this.messages.loadError };
    if (!existsSync(this.inbox)) return { alerts: [], changed: false, error: '' };
    const files = readdirSync(this.inbox).filter(name => /^\d+-[a-f0-9]+\.json$/.test(name)).sort().slice(0, 100);
    if (!files.length) return { alerts: [], changed: false, error: '' };
    const before = JSON.stringify(this.messages.read()), alerts: AgentMessage[] = [];
    const enabled = new Set(this.status().filter(connection => connection.connected).map(connection => connection.provider));
    let error = '';
    for (const filename of files) {
      const file = join(this.inbox, filename);
      let input: z.infer<typeof AgentEventSchema>;
      try {
        if (statSync(file).size > 32768) throw new Error('Agent 事件过大');
        // Validate before committing so a malformed event cannot block subsequent valid files.
        input = AgentEventSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
      } catch { renameSync(file, `${file}.invalid`); error = '收到无法识别的 Agent 事件，已保留文件供检查'; continue; }
      if (!enabled.has(input.provider)) { unlinkSync(file); continue; }
      const message = this.messages.ingest(input);
      if (message) alerts.push(message);
      unlinkSync(file);
    }
    return { alerts, changed: JSON.stringify(this.messages.read()) !== before, error };
  }
}

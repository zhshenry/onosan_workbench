import { renameSync, rmSync, writeFileSync } from 'node:fs';

/** Replace a JSON file only after its complete contents have been written. */
export function writeJsonAtomic(file: string, value: unknown): void {
  const temporary = `${file}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify(value, null, 2), 'utf8');
    renameSync(temporary, file);
  } finally {
    try { rmSync(temporary, { force: true }); }
    catch { /* Preserve the original write error if cleanup is also denied. */ }
  }
}

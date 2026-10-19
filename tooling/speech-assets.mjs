import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { copyFile, cp, mkdir, readFile, rename, stat, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = join(root, 'assets', 'speech');
export const speechDirectory = join(root, 'vendor', 'speech');

async function matches(path, file) {
  try {
    if ((await stat(path)).size !== file.bytes) return false;
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    return hash.digest('hex') === file.sha256;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

export async function prepareSpeechAssets() {
  const manifest = JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8'));
  await mkdir(speechDirectory, { recursive: true });
  for (const file of manifest.files) {
    const destination = join(speechDirectory, file.name);
    if (await matches(destination, file)) continue;
    console.log('Preparing bundled speech asset: ' + file.name);
    const temporary = destination + '.part';
    try {
      const response = await fetch(file.url, { signal: AbortSignal.timeout(600000) });
      if (!response.ok || !response.body) throw new Error('HTTP ' + response.status);
      await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary));
      if (!await matches(temporary, file)) throw new Error('size or SHA-256 mismatch');
      await rename(temporary, destination);
    } catch (error) {
      await unlink(temporary).catch(() => {});
      throw new Error('Cannot prepare ' + file.name + ': ' + error.message + '. Retry npm run prepare:speech with network access.', { cause: error });
    }
  }
  await copyFile(join(source, 'manifest.json'), join(speechDirectory, 'manifest.json'));
  await cp(join(source, 'licenses'), join(speechDirectory, 'licenses'), { recursive: true });
  console.log('Bundled speech assets verified (' + manifest.id + ')');
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await prepareSpeechAssets();
}

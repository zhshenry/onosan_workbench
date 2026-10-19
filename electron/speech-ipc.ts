import { ipcMain, session, type WebContents } from 'electron';
import { z } from 'zod';
import { SPEECH_LANGUAGES, SPEECH_MAX_BYTES, speechAppUrl } from '../shared/speech-contracts';
import { SpeechService } from './speech';

export function registerSpeechIpc(service: SpeechService, primary: () => WebContents | undefined, appUrl: string): void {
  const trusted = (contents: WebContents | null, isMainFrame: boolean, url: string): boolean =>
    !!contents && contents === primary() && isMainFrame && speechAppUrl(url, appUrl);
  const assertSender = (event: Electron.IpcMainInvokeEvent): void => {
    if (!trusted(event.sender, event.senderFrame === event.sender.mainFrame, event.senderFrame?.url ?? '')) throw new Error('仅工作台主窗口可使用语音听写。');
  };
  const id = z.string().uuid();
  ipcMain.handle('speech:prepare', (event, input: unknown) => { assertSender(event); return service.prepare(id.parse(input)); });
  ipcMain.handle('speech:transcribe', (event, input: unknown) => {
    assertSender(event);
    const data = z.object({ id, audio: z.instanceof(Uint8Array).refine(bytes => bytes.byteLength <= SPEECH_MAX_BYTES), language: z.enum(SPEECH_LANGUAGES) }).strict().parse(input);
    return service.transcribe(data.id, data.audio, data.language);
  });
  ipcMain.handle('speech:cancel', (event, input: unknown) => { assertSender(event); service.cancel(id.parse(input)); });
  session.defaultSession.setPermissionCheckHandler((contents, permission, _origin, details) =>
    permission === 'media' && trusted(contents, details.isMainFrame, contents?.mainFrame.url ?? '') && details.mediaType === 'audio');
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(permission === 'media' && trusted(contents, details.isMainFrame, details.requestingUrl)
      && 'mediaTypes' in details && details.mediaTypes?.length === 1 && details.mediaTypes[0] === 'audio');
  });
}

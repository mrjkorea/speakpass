import { activeStream, startListener, startRecorder } from './audio.js';

function emptyRecording() {
  return { blob: new Blob(), mimeType: '', transcript: '' };
}

/** Start the microphone recording and the on-device transcript together. */
export function beginCapture() {
  let recorder = null;
  let listener = null;
  try {
    const media = activeStream();
    if (media) recorder = startRecorder(media);
  } catch (err) {
    recorder = null;
  }
  try { listener = startListener(); } catch (err) { listener = null; }
  return {
    async finish() {
      let recorded = emptyRecording();
      if (recorder) {
        try { recorded = await recorder.stop(); } catch (err) { recorded = emptyRecording(); }
      }
      let transcript = '';
      if (listener) {
        try { transcript = String(await listener.stop() || '').trim(); } catch (err) { transcript = ''; }
      }
      return {
        blob: (recorded && recorded.blob) || new Blob(),
        mimeType: (recorded && recorded.mimeType) || '',
        transcript
      };
    }
  };
}

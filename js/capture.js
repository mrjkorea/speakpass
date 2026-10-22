import { activeStream, startRecorder } from './audio.js';

function emptyRecording() {
  return { blob: new Blob(), mimeType: '', transcript: '' };
}

/** Start the microphone recording and nothing else; Whistle writes the transcript afterwards. */
export function beginCapture() {
  let recorder = null;
  try {
    const media = activeStream();
    if (media) recorder = startRecorder(media);
  } catch (err) {
    recorder = null;
  }
  return {
    async finish() {
      let recorded = emptyRecording();
      if (recorder) {
        try { recorded = await recorder.stop(); } catch (err) { recorded = emptyRecording(); }
      }
      const transcript = ''; // filled later on the device by Whistle (transcribe.js)
      return {
        blob: (recorded && recorded.blob) || new Blob(),
        mimeType: (recorded && recorded.mimeType) || '',
        transcript
      };
    }
  };
}

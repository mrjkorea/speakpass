let ctx = null;
let stream = null;

function rejectCode(code) {
  const err = new Error(code);
  err.code = code;
  return Promise.reject(err);
}

export function getAudioContext() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
  } catch (err) {
    ctx = null;
  }
  return ctx;
}

export function hasStream() {
  return !!(stream && stream.getAudioTracks().some((track) => track.readyState === 'live'));
}

export function activeStream() {
  return hasStream() ? stream : null;
}

export function releaseMic() {
  if (!stream) return;
  for (const track of stream.getTracks()) track.stop();
  stream = null;
}

function playSilent(context) {
  const buffer = context.createBuffer(1, 1, 22050);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  try { source.start(0); } catch (err) { /* ignore */ }
}

/**
 * Call this directly inside the tap that starts a test.
 * getUserMedia and AudioContext.resume run in that gesture,
 * which is what iOS Safari requires before later recording.
 */
export function beginArm() {
  if (!window.isSecureContext) return rejectCode('insecure');
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return rejectCode('no-mic');
  if (typeof MediaRecorder === 'undefined') return rejectCode('no-recorder');
  const context = getAudioContext();
  const resumePromise = context ? context.resume().catch(() => {}) : Promise.resolve();
  if (context) playSilent(context);
  const streamPromise = navigator.mediaDevices.getUserMedia({ audio: true });
  return Promise.all([resumePromise, streamPromise]).then(async ([, next]) => {
    releaseMic();
    stream = next;
    await warmup(next);
    return next;
  });
}

export function chooseMimeType() {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return '';
  }
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
    'audio/aac'
  ];
  for (const type of types) {
    try {
      if (MediaRecorder.isTypeSupported(type)) return type;
    } catch (err) { /* try the next type */ }
  }
  return '';
}

function makeRecorder(mediaStream) {
  const mimeType = chooseMimeType();
  if (!mimeType) return new MediaRecorder(mediaStream);
  try {
    return new MediaRecorder(mediaStream, { mimeType });
  } catch (err) {
    return new MediaRecorder(mediaStream);
  }
}

function warmup(mediaStream) {
  return new Promise((resolve) => {
    let rec;
    try { rec = makeRecorder(mediaStream); } catch (err) { resolve(); return; }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(bail);
      resolve();
    };
    const bail = setTimeout(finish, 1200);
    rec.addEventListener('stop', () => setTimeout(finish, 40));
    rec.addEventListener('error', finish);
    try { rec.start(); } catch (err) { finish(); return; }
    setTimeout(() => {
      try {
        if (rec.state === 'recording') rec.stop();
      } catch (err) { finish(); }
    }, 160);
  });
}

/** Start recording. stop() resolves once with { blob, mimeType } and is safe to call twice. */
export function startRecorder(mediaStream) {
  const rec = makeRecorder(mediaStream);
  const chunks = [];
  let settled = false;
  let resolveStop = () => {};
  const stopped = new Promise((resolve) => { resolveStop = resolve; });

  const finish = () => {
    if (settled) return;
    settled = true;
    const mimeType = rec.mimeType || chooseMimeType() || '';
    const type = mimeType || 'application/octet-stream';
    resolveStop({ blob: new Blob(chunks, { type }), mimeType });
  };

  rec.addEventListener('dataavailable', (event) => {
    if (event.data && event.data.size > 0) chunks.push(event.data);
  });
  rec.addEventListener('stop', () => {
    // Some browsers fire the last dataavailable after stop.
    setTimeout(finish, 40);
  });
  rec.addEventListener('error', finish);

  try {
    rec.start();
  } catch (err) {
    finish();
  }

  return {
    stop() {
      try {
        if (rec.state === 'recording') rec.stop();
        else setTimeout(finish, 0);
      } catch (err) {
        finish();
      }
      setTimeout(finish, 2000);
      return stopped;
    }
  };
}

export function beep(kind) {
  try {
    const context = getAudioContext();
    if (!context) return;
    context.resume().catch(() => {});
    const now = context.currentTime + 0.02;
    if (kind === 'end') {
      tone(context, 523.25, now, 0.12);
      tone(context, 392, now + 0.16, 0.14);
    } else {
      tone(context, 880, now, 0.18);
    }
  } catch (err) { /* the on-screen timer still changes */ }
}

function tone(context, freq, when, duration) {
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, when);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(0.18, when + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  osc.connect(gain);
  gain.connect(context.destination);
  osc.start(when);
  osc.stop(when + duration + 0.02);
}

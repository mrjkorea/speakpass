/** Official timer digits: hh:mm:ss. */
export function formatHMS(seconds) {
  const whole = Math.max(0, Math.ceil(Number(seconds) - 1e-9));
  const hh = Math.floor(whole / 3600);
  const mm = Math.floor((whole % 3600) / 60);
  const ss = whole % 60;
  const part = (n) => String(n).padStart(2, '0');
  return `${part(hh)}:${part(mm)}:${part(ss)}`;
}

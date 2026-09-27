/**
 * Deadline countdown. There is no pause. cancel() settles early.
 * onTick receives seconds remaining (a float, 0 at the end).
 */
export function startCountdown(seconds, onTick) {
  const total = Math.max(0, Number(seconds) || 0);
  let settled = false;
  let timerId = 0;
  let resolveDone = () => {};
  const done = new Promise((resolve) => {
    resolveDone = resolve;
  });

  const finish = (wasCancelled) => {
    if (settled) return;
    settled = true;
    clearTimeout(timerId);
    if (!wasCancelled) onTick(0);
    resolveDone({ cancelled: !!wasCancelled });
  };

  if (total <= 0) {
    onTick(0);
    resolveDone({ cancelled: false });
    return { done, cancel() { finish(true); } };
  }

  const end = performance.now() + total * 1000;
  const tick = () => {
    const left = (end - performance.now()) / 1000;
    if (left <= 0) {
      finish(false);
      return;
    }
    onTick(left);
    timerId = setTimeout(tick, 100);
  };
  onTick(total);
  timerId = setTimeout(tick, 100);
  return {
    done,
    cancel() { finish(true); }
  };
}

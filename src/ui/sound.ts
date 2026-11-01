let ctx: AudioContext | undefined;

/** Must run inside a tap: browsers only allow sound after an interaction. */
export function prepareAudio() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = undefined;
  }
}

function tone(f: number, at: number, length: number, gain: number) {
  if (!ctx) return;
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.value = f;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + length);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + length + 0.01);
}

export function beep() {
  try {
    navigator.vibrate?.(180);
    tone(784, 0, 0.16, 0.22);
    tone(1175, 0.17, 0.22, 0.22);
  } catch {
    /* sound is a bonus */
  }
}

/** The small click of a wheel going past a value. */
export function tick() {
  try {
    if (ctx?.state === 'running') tone(1900, 0, 0.018, 0.018);
  } catch {
    /* sound is a bonus */
  }
}

export function success() {
  try {
    tone(660, 0, 0.09, 0.09);
    tone(990, 0.07, 0.14, 0.09);
  } catch {
    /* sound is a bonus */
  }
}

let hapticLabel: HTMLLabelElement | undefined;

/** Safari gives a light tap on a native switch: the only haptic a web page can ask for. */
export function haptic() {
  try {
    navigator.vibrate?.(12);
    if (!hapticLabel) {
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      input.id = 'haptic-switch';
      input.tabIndex = -1;
      input.setAttribute('aria-hidden', 'true');
      hapticLabel = document.createElement('label');
      hapticLabel.htmlFor = input.id;
      hapticLabel.className = 'haptic';
      hapticLabel.append(input);
      document.body.append(hapticLabel);
    }
    hapticLabel.click();
  } catch {
    /* a tap on the glass will do */
  }
}

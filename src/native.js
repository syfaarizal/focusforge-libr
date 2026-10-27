import { Capacitor, registerPlugin } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export const isNative = Capacitor.isNativePlatform();

// Custom plugin (see android-plugin/ScreenPinPlugin.java): screen pinning + keep-screen-on
const ScreenPin = registerPlugin('ScreenPin');

const safe = async (fn, fallback) => {
  try {
    return await fn();
  } catch {
    return fallback;
  }
};

export const pinStart = () => (isNative ? safe(() => ScreenPin.start()) : undefined);
export const pinStop = () => (isNative ? safe(() => ScreenPin.stop()) : undefined);
export const isPinned = () => (isNative ? safe(async () => (await ScreenPin.isPinned()).pinned, false) : false);
export const keepAwake = (on) => (isNative ? safe(() => ScreenPin.keepAwake({ on })) : undefined);

const NOTIF_ID = 1001;

export async function ensureNotifPermission() {
  if (!isNative) return false;
  return safe(async () => {
    const cur = await LocalNotifications.checkPermissions();
    if (cur.display === 'granted') return true;
    const req = await LocalNotifications.requestPermissions();
    return req.display === 'granted';
  }, false);
}

export async function scheduleEnd(atMs, taskName) {
  if (!isNative) return;
  await safe(async () => {
    if (!(await ensureNotifPermission())) return;
    await LocalNotifications.cancel({ notifications: [{ id: NOTIF_ID }] });
    await LocalNotifications.schedule({
      notifications: [
        {
          id: NOTIF_ID,
          title: 'Focus session complete',
          body: `${taskName} — nice work.`,
          schedule: { at: new Date(atMs), allowWhileIdle: true },
        },
      ],
    });
  });
}

export const cancelEnd = () =>
  isNative ? safe(() => LocalNotifications.cancel({ notifications: [{ id: NOTIF_ID }] })) : undefined;

export async function buzz() {
  if (isNative) await safe(() => Haptics.impact({ style: ImpactStyle.Heavy }));
  else if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
}

export function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.25, 0.5].forEach((t, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 660 + i * 110;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.2);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.22);
    });
    setTimeout(() => ctx.close(), 1200);
  } catch {
    /* audio not available */
  }
}

/** Save/share a text file. Native: write to cache + system share sheet. Web: download. */
export async function exportFile(filename, text, mime) {
  if (isNative) {
    const res = await Filesystem.writeFile({
      path: filename,
      data: text,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    await Share.share({ title: filename, url: res.uri, dialogTitle: 'Save or share export' });
    return;
  }
  const blob = new Blob([text], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

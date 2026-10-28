import { Capacitor, registerPlugin } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import ringtoneUrl from './assets/sfx/ringtone-boom.mp3';

export const isNative = Capacitor.isNativePlatform();

/**
 * Name of the sound file in Android's res/raw. Must match the file copied by
 * scripts/patch-android.mjs (Android resource names cannot contain dashes).
 */
export const RINGTONE_NAME = 'ringtone_boom.mp3';
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

/**
 * True while a scheduled end-of-session notification is pending. The OS plays
 * that notification's sound, so the in-app ringtone must stay silent or the
 * two overlap into a double ring.
 */
let endNotifScheduled = false;

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
  endNotifScheduled = false;
  await safe(async () => {
    if (!(await ensureNotifPermission())) return;
    await LocalNotifications.cancel({ notifications: [{ id: NOTIF_ID }] });
    await LocalNotifications.schedule({
      notifications: [
        {
          id: NOTIF_ID,
          title: 'Focus session complete',
          body: `${taskName} — nice work.`,
          sound: RINGTONE_NAME,
          schedule: { at: new Date(atMs), allowWhileIdle: true },
        },
      ],
    });
    endNotifScheduled = true;
  });
}

export const cancelEnd = () => {
  endNotifScheduled = false;
  return isNative ? safe(() => LocalNotifications.cancel({ notifications: [{ id: NOTIF_ID }] })) : undefined;
};

export async function buzz() {
  if (isNative) await safe(() => Haptics.impact({ style: ImpactStyle.Heavy }));
  else if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
}

let ringtone = null;

/** Lazily create the ringtone <audio> element so the file is buffered before it is needed. */
function ringtoneEl() {
  if (ringtone) return ringtone;
  ringtone = new Audio(ringtoneUrl);
  ringtone.preload = 'auto';
  ringtone.volume = 1;
  ringtone.load();
  return ringtone;
}

/**
 * Play the end-of-session ringtone. Falls back to a beep if the file cannot
 * play. Silent when a native notification is about to ring for the same event.
 */
export function beep() {
  if (endNotifScheduled) return;
  try {
    const el = ringtoneEl();
    el.currentTime = 0;
    const p = el.play();
    if (p?.catch) p.catch(() => fallbackBeep());
  } catch {
    fallbackBeep();
  }
}

/** Synth chime, used only when the ringtone file is unavailable. */
function fallbackBeep() {
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

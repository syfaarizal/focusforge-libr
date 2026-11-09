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

/**
 * Name of the silent sound in Android's res/raw.
 *
 * A notification channel without an explicit sound still uses Android's
 * default notification sound, so a channel that has to stay quiet needs a
 * sound that is actually silent.
 */
export const SILENT_NAME = 'silent.wav';
// Custom plugin (see android-plugin/ScreenPinPlugin.java): screen pinning + keep-screen-on
const ScreenPin = registerPlugin('ScreenPin');
// Custom plugin (see android-plugin/SoundPlugin.java): ringtone playback
const Sound = registerPlugin('Sound');

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
/** The moment the pending end-of-session notification fires at. */
let endNotifAt = null;
/** Whether that notification is scheduled as an exact alarm. */
let endNotifExact = false;

export async function ensureNotifPermission() {
  if (!isNative) return false;
  return safe(async () => {
    const cur = await LocalNotifications.checkPermissions();
    if (cur.display === 'granted') return true;
    const req = await LocalNotifications.requestPermissions();
    return req.display === 'granted';
  }, false);
}

/**
 * Whether Android allows exact alarms. Without it, reminders and the session
 * end alert can only be scheduled inexact and may fire minutes late.
 */
export async function canUseExactAlarms() {
  if (!isNative) return false;
  return safe(async () => {
    const r = await LocalNotifications.checkExactNotificationSetting();
    return r.exact_alarm === 'granted';
  }, false);
}

/* ------------------------------------------------------------------ */
/* Notification channels                                               */
/* ------------------------------------------------------------------ */
// On Android 8+ the sound belongs to the channel, not to the notification,
// and a channel's sound can never be changed afterwards.
//
// The channels are created by the native Sound plugin, not by the
// local-notifications plugin. The reason is the audio usage: the
// local-notifications plugin always builds a channel with USAGE_NOTIFICATION,
// and a sound on that usage is silenced whenever the phone is on silent or
// vibrate. That is exactly the case for a timer that ends while the phone is
// face down, so the alert channel uses USAGE_ALARM instead.
const CHANNEL_ALERT = 'focusforge_alert';
const CHANNEL_REMINDER = 'focusforge_reminder';
const CHANNEL_DONE = 'focusforge_done';

let channelsSupported = null;

/**
 * Creates the notification channels, and repairs any whose sound does not
 * match what we want.
 *
 * Returns whether channels are usable at all. Android 7 and older have no
 * channels, and there the sound is set on the notification itself.
 */
async function ensureChannels() {
  if (!isNative) return false;
  if (channelsSupported === null) {
    const r = await safe(async () => await Sound.ensureChannels(), null);
    channelsSupported = r?.channels === true;
  }
  return channelsSupported;
}

/**
 * Builds the fields for a notification on a given channel.
 *
 * The notification carries its own sound as well as the channel, because
 * Android does not agree on which of the two wins. Setting both to the same
 * file makes the outcome the same either way.
 */
async function notifFields(channelId, { sound = null } = {}) {
  const useChannel = await ensureChannels();
  if (!useChannel) return sound ? { sound } : {};
  return sound ? { channelId, sound } : { channelId };
}
export async function scheduleEnd(atMs, taskName) {
  if (!isNative) return;
  endNotifScheduled = false;
  endNotifExact = false;
  await safe(async () => {
    if (!(await ensureNotifPermission())) return;
    await LocalNotifications.cancel({ notifications: [{ id: NOTIF_ID }] });
    const fields = await notifFields(CHANNEL_ALERT, { sound: RINGTONE_NAME });
    const exact = await canUseExactAlarms();
    await LocalNotifications.schedule({
      notifications: [
        {
          id: NOTIF_ID,
          ...fields,
          title: 'Focus session complete',
          body: `${taskName} — nice work.`,
          isExactNotification: exact,
          schedule: { at: new Date(atMs), allowWhileIdle: true },
        },
      ],
    });
    endNotifScheduled = true;
    endNotifAt = atMs;
    endNotifExact = exact;
  });
}

/**
 * Cancels the pending end-of-session notification.
 *
 * Once the end moment has passed the session has just finished on its own.
 * An exactly scheduled alert fires at that very moment, so it is left alone:
 * cancelling it here would swallow the ringtone. An inexact alert may still
 * be pending and fire minutes later, so that one is cancelled to avoid a
 * second ring long after the fact.
 */
export const cancelEnd = () => {
  endNotifScheduled = false;
  const at = endNotifAt;
  const exact = endNotifExact;
  endNotifAt = null;
  endNotifExact = false;
  if (!isNative) return undefined;
  if (at !== null && Date.now() >= at && exact) return undefined;
  return safe(() => LocalNotifications.cancel({ notifications: [{ id: NOTIF_ID }] }));
};

/* ------------------------------------------------------------------ */
/* Habit reminders                                                    */
/* ------------------------------------------------------------------ */
// Each habit gets a stable id so a reschedule replaces its old notification.
// The three kinds live in separate id ranges, so cleaning up stale reminders
// never cancels a running timer's alert.
const HABIT_NOTIF_BASE = 2000;
const HABIT_TIMER_NOTIF_BASE = 200000;
const HABIT_DONE_NOTIF_BASE = 300000;

const hashId = (str) => {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h) % 100000;
};

const habitNotifId = (habitId) => HABIT_NOTIF_BASE + hashId(habitId);
const habitTimerNotifId = (habitId) => HABIT_TIMER_NOTIF_BASE + hashId(habitId);
const habitDoneNotifId = (habitId) => HABIT_DONE_NOTIF_BASE + hashId(habitId);

// Reminders we have scheduled in this session, so a habit that leaves the plan
// can be cleaned up.
let scheduledReminderIds = new Set();

/**
 * The end-of-timer alert of every habit timer that is running, keyed by habit
 * id, with the moment it fires at.
 *
 * An entry is kept after that moment has passed: the OS has rung by then, and
 * the app has to know that so it does not ring a second time.
 */
const habitTimerNotifs = new Map();

/**
 * Schedules one reminder per habit window that is still ahead of us. Reminders
 * that are no longer wanted are cancelled first, so a changed habit plan never
 * leaves a stale notification behind.
 *
 * Stale reminders are found by asking the OS what is still pending, so a plan
 * change is picked up even after the app has been restarted.
 */
export async function syncHabitReminders(reminders) {
  if (!isNative) return;
  await safe(async () => {
    if (!(await ensureNotifPermission())) return;
    // No sound on the notification itself: the reminder channel carries the
    // system sound, which is the right one for a window that just opened.
    const fields = await notifFields(CHANNEL_REMINDER);

    const wanted = new Set(reminders.map((r) => habitNotifId(r.habit.id)));
    const stale = new Set(scheduledReminderIds);
    const pending = await safe(async () => {
      const r = await LocalNotifications.getPending();
      return r?.notifications ?? [];
    }, []);
    for (const n of pending) {
      // Only the reminder range; the end-of-timer alerts live higher up and
      // have their own lifetime.
      if (n.id >= HABIT_NOTIF_BASE && n.id < HABIT_TIMER_NOTIF_BASE && !wanted.has(n.id)) stale.add(n.id);
    }

    const ids = [...wanted, ...stale].map((id) => ({ id }));
    if (ids.length) await LocalNotifications.cancel({ notifications: ids });
    scheduledReminderIds = wanted;

    if (!reminders.length) return;
    const exact = await canUseExactAlarms();
    await LocalNotifications.schedule({
      notifications: reminders.map((r) => ({
        id: habitNotifId(r.habit.id),
        ...fields,
        title: `Time for ${r.habit.name}`,
        body:
          r.habit.kind === 'timer'
            ? `${r.habit.minMinutes} minutes — the window is open.`
            : 'The window is open.',
        isExactNotification: exact,
        schedule: { at: new Date(r.at), allowWhileIdle: true },
      })),
    });
  });
}

/** Cancels every pending habit reminder. Used when notifications are switched off. */
export async function clearHabitReminders() {
  if (!isNative) return;
  await safe(async () => {
    const pending = await safe(async () => {
      const r = await LocalNotifications.getPending();
      return r?.notifications ?? [];
    }, []);
    const ids = pending
      .filter((n) => n.id >= HABIT_NOTIF_BASE && n.id < HABIT_TIMER_NOTIF_BASE)
      .map((n) => ({ id: n.id }));
    if (ids.length) await LocalNotifications.cancel({ notifications: ids });
    scheduledReminderIds = new Set();
  });
}

/**
 * A one-off notification for a habit that just completed (a timer that ran
 * out, a focus goal that was reached). Sent without a schedule so it shows up
 * right away instead of waiting on an alarm.
 *
 * The channel is silent: the ringtone for this moment is played by beep() in
 * the app itself, so letting the notification carry a sound too would ring
 * twice.
 */
export async function notifyHabitDone(habit) {
  if (!isNative) return;
  await safe(async () => {
    if (!(await ensureNotifPermission())) return;
    const fields = await notifFields(CHANNEL_DONE, { sound: SILENT_NAME });
    await LocalNotifications.schedule({
      notifications: [
        {
          id: habitDoneNotifId(habit.id),
          ...fields,
          title: `${habit.name} done`,
          body: 'Ticked off for today.',
        },
      ],
    });
  });
}

/**
 * Schedules the notification for a running habit timer, so there is an alert
 * even when the WebView is suspended and no JavaScript is running.
 *
 * When the alarm can be scheduled exactly, the OS rings the boom ringtone on
 * the alert channel at the right moment. When it cannot, the alarm may be
 * delayed for minutes, so the alert goes out on the silent channel instead
 * and the app rings the sound itself.
 */
export async function scheduleHabitTimerEnd(atMs, habitId, habitName) {
  if (!isNative) return;
  await safe(async () => {
    if (!(await ensureNotifPermission())) return;
    const id = habitTimerNotifId(habitId);
    await LocalNotifications.cancel({ notifications: [{ id }] });
    const exact = await canUseExactAlarms();
    const fields = await notifFields(exact ? CHANNEL_ALERT : CHANNEL_DONE, {
      sound: exact ? RINGTONE_NAME : SILENT_NAME,
    });
    await LocalNotifications.schedule({
      notifications: [
        {
          id,
          ...fields,
          title: `${habitName} done`,
          body: 'The timer ran out. Ticked off for today.',
          isExactNotification: exact,
          schedule: { at: new Date(atMs), allowWhileIdle: true },
        },
      ],
    });
    habitTimerNotifs.set(habitId, { at: atMs, exact });
  });
}

/**
 * Closes the end-of-timer alert for a habit that just ran out.
 *
 * Returns whether the OS already announced the completion itself. That is the
 * case for an exactly scheduled alert: the OS rang it on time, so the app
 * must not ring or notify a second time.
 *
 * An inexact alert may still be pending and fire minutes later, so it is
 * cancelled here to avoid a second ring long after the fact.
 */
export async function closeHabitTimerEnd(habitId) {
  if (!isNative) return false;
  const pending = habitTimerNotifs.get(habitId);
  habitTimerNotifs.delete(habitId);
  if (!pending) return false;
  if (pending.exact) return true;
  await safe(() => LocalNotifications.cancel({ notifications: [{ id: habitTimerNotifId(habitId) }] }));
  return false;
}

/**
 * Cancels the pending end-of-timer notification for a habit that stopped
 * running before its timer ran out.
 */
export async function cancelHabitTimerEnd(habitId) {
  if (!isNative) return;
  const pending = habitTimerNotifs.get(habitId);
  habitTimerNotifs.delete(habitId);
  if (!pending) return;
  if (Date.now() >= pending.at) return;
  await safe(() => LocalNotifications.cancel({ notifications: [{ id: habitTimerNotifId(habitId) }] }));
}

/**
 * The habit the pending end-of-timer notification belongs to, or null when
 * there is none. A completion covered by that notification must not raise a
 * second one, or the user hears the ringtone twice.
 */
export const habitTimerEndScheduledFor = (habitId) => habitTimerNotifs.has(habitId);

/** The habits that currently have a pending end-of-timer alert. */
export const habitTimerEndScheduledIds = () => [...habitTimerNotifs.keys()];

export async function buzz() {
  if (isNative) await safe(() => Haptics.impact({ style: ImpactStyle.Heavy }));
  else if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
}

let ringtone = null;
let audioCtx = null;

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
 * Android suspends a WebView that is in the background, which leaves the Web
 * Audio context suspended. Resuming it here means the fallback chime is
 * audible even when the app was backgrounded.
 */
function unlockAudio() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  } catch {
    /* audio not available */
  }
}

/**
 * Whether the OS rings the end-of-session alert on its own.
 *
 * Only an exactly scheduled alert does: an inexact alarm can be delayed for
 * minutes, so the app plays the sound itself in that case.
 */
export const endNotifRings = () => endNotifScheduled && endNotifExact;

/**
 * Play the end-of-session ringtone.
 *
 * On Android this goes through the native Sound plugin, because an HTML5
 * <audio> element is unreliable in a WebView that is backgrounded, screen
 * pinned or suspended. The native plugin falls back to the system notification
 * sound if the bundled ringtone is missing from res/raw.
 *
 * Silent when the OS is about to ring for the same event, so the two do not
 * overlap into a double ring. The caller knows whether that alert exists, so
 * it decides whether to call this at all.
 */
export async function beep() {
  if (isNative) {
    // safe() awaits the call, so `played` is the real result and not a promise.
    const played = await safe(async () => {
      await Sound.playRaw({ name: RINGTONE_NAME.replace(/\.mp3$/, ''), volume: 1 });
      return true;
    }, false);
    if (played) return;
    await safe(() => Sound.playSystem({ volume: 1 }));
    return;
  }
  unlockAudio();
  try {
    const el = ringtoneEl();
    el.currentTime = 0;
    const p = el.play();
    if (p?.catch) {
      p.catch(() => {
        // A WebView that was suspended mid-playback rejects the resume; retry
        // once now that the audio context has been unlocked.
        el.currentTime = 0;
        const q = el.play();
        if (q?.catch) q.catch(() => fallbackBeep());
      });
    }
  } catch {
    fallbackBeep();
  }
}

/** Synth chime, used only when the ringtone file is unavailable. */
function fallbackBeep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = audioCtx ?? new Ctx();
    audioCtx = ctx;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
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

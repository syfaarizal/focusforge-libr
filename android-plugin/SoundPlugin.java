package com.libr.focusforge;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Plays the session-end ringtone through Android's own media stack and owns
 * the notification channels that carry a sound.
 *
 * The WebView cannot play audio reliably: when the app is backgrounded, in
 * screen pinning, or when the WebView is suspended, an HTML5 &lt;audio&gt;
 * element either never starts or is silenced. MediaPlayer runs in the app
 * process and is not affected by that, so the sound always comes out.
 *
 * The sounds are looked up in res/raw by name, which is where
 * scripts/patch-android.mjs copies src/assets/sfx/* to.
 */
@CapacitorPlugin(name = "Sound")
public class SoundPlugin extends Plugin {

    public static final String CHANNEL_ALERT = "focusforge_alert";
    public static final String CHANNEL_REMINDER = "focusforge_reminder";
    public static final String CHANNEL_DONE = "focusforge_done";

    private static final String RAW_RINGTONE = "ringtone_boom";
    private static final String RAW_SILENT = "silent";

    private MediaPlayer player;

    /**
     * Creates the notification channels, and repairs any whose sound does not
     * match what we want.
     *
     * The alert channel is the one that matters for the ringtone. The
     * local-notifications plugin always builds a channel with
     * USAGE_NOTIFICATION, and a notification sound on that usage is silenced
     * whenever the phone is on silent or vibrate - which is exactly the case
     * for a timer that ends while the phone is face down. USAGE_ALARM keeps
     * the sound coming out.
     *
     * A channel's sound can never be changed while the channel exists, so a
     * channel with the wrong sound is deleted and created again.
     *
     * Resolves with { channels: true } on Android 8+, and { channels: false }
     * on older versions, where channels do not exist at all.
     */
    @PluginMethod
    public void ensureChannels(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            call.resolve(channelsCreated(false));
            return;
        }
        try {
            NotificationManager nm = (NotificationManager) getContext()
                    .getSystemService(Context.NOTIFICATION_SERVICE);

            Uri alertSound = rawUri(RAW_RINGTONE);
            if (alertSound == null) {
                alertSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            }
            ensureChannel(nm, CHANNEL_ALERT, "Alerts", NotificationManager.IMPORTANCE_HIGH,
                    alertSound, alarmAttributes());

            Uri reminderSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            ensureChannel(nm, CHANNEL_REMINDER, "Habit reminders",
                    NotificationManager.IMPORTANCE_DEFAULT, reminderSound, notificationAttributes());

            // This one is posted from the app while it is in the foreground,
            // where the sound is played by the app itself. A sound here would
            // ring twice, so it carries a genuinely silent file.
            ensureChannel(nm, CHANNEL_DONE, "Habit completed",
                    NotificationManager.IMPORTANCE_DEFAULT, rawUri(RAW_SILENT), notificationAttributes());

            call.resolve(channelsCreated(true));
        } catch (Exception e) {
            call.reject("Could not create the notification channels", e);
        }
    }

    /**
     * Plays a sound from res/raw.
     * @param call options: { name: 'ringtone_boom', volume: 0..1 }
     */
    @PluginMethod
    public void playRaw(PluginCall call) {
        final String name = call.getString("name", RAW_RINGTONE);
        play(name, volume(call));
        call.resolve();
    }

    /**
     * Plays the system notification sound. Used as a last resort when the
     * bundled ringtone cannot be found in res/raw.
     */
    @PluginMethod
    public void playSystem(PluginCall call) {
        if (!playSystemSound(volume(call))) {
            call.reject("No system sound available");
            return;
        }
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        release();
        call.resolve();
    }

    private float volume(PluginCall call) {
        Double v = call.getDouble("volume", 1.0);
        double d = v == null ? 1.0 : v;
        return (float) Math.max(0.0, Math.min(1.0, d));
    }

    private void play(String name, float volume) {
        int resId = getContext()
                .getResources()
                .getIdentifier(name, "raw", getContext().getPackageName());
        if (resId == 0) {
            // The sound was not copied into res/raw; fall back to the system
            // notification sound so the user still gets an alert.
            playSystemSound(volume);
            return;
        }
        try {
            // aapt does not compress .mp3 or .wav, so a file descriptor is
            // always available for them.
            AssetFileDescriptor afd = getContext().getResources().openRawResourceFd(resId);
            if (afd == null) {
                playSystemSound(volume);
                return;
            }
            MediaPlayer mp = new MediaPlayer();
            // setAudioAttributes has to happen before prepare(), which is why
            // the player is built by hand instead of via MediaPlayer.create().
            mp.setAudioAttributes(alarmAttributes());
            mp.setDataSource(afd.getFileDescriptor(), afd.getStartOffset(), afd.getLength());
            mp.setVolume(volume, volume);
            mp.setOnCompletionListener(m -> release());
            mp.prepare();
            start(mp);
            afd.close();
        } catch (Exception e) {
            playSystemSound(volume);
        }
    }

    private boolean playSystemSound(float volume) {
        try {
            Uri uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            if (uri == null) return false;
            MediaPlayer mp = new MediaPlayer();
            mp.setAudioAttributes(alarmAttributes());
            mp.setDataSource(getContext(), uri);
            mp.setVolume(volume, volume);
            mp.setOnCompletionListener(m -> release());
            mp.prepare();
            start(mp);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private void start(MediaPlayer mp) {
        release();
        player = mp;
        try {
            mp.start();
        } catch (IllegalStateException ignored) {
            // the player was already finished
        }
    }

    private void release() {
        if (player == null) return;
        try {
            if (player.isPlaying()) player.stop();
        } catch (IllegalStateException ignored) {
            // already stopped
        }
        player.release();
        player = null;
    }

    /**
     * The uri of a raw resource, or null when it is not bundled.
     */
    private Uri rawUri(String name) {
        int resId = getContext()
                .getResources()
                .getIdentifier(name, "raw", getContext().getPackageName());
        if (resId == 0) return null;
        return Uri.parse("android.resource://" + getContext().getPackageName() + "/raw/" + name);
    }

    /**
     * Creates a channel, or recreates it when it already exists with a
     * different sound or a different audio usage. Android never lets a
     * channel's sound or usage be changed, so deleting it is the only way to
     * correct one.
     */
    private void ensureChannel(NotificationManager nm, String id, String name, int importance,
            Uri sound, AudioAttributes attributes) {
        NotificationChannel existing = nm.getNotificationChannel(id);
        if (existing != null) {
            if (sameSound(existing.getSound(), sound)
                    && existing.getAudioAttributes() != null
                    && existing.getAudioAttributes().getUsage() == attributes.getUsage()) {
                return;
            }
            nm.deleteNotificationChannel(id);
        }
        NotificationChannel channel = new NotificationChannel(id, name, importance);
        channel.enableVibration(true);
        channel.setSound(sound, attributes);
        nm.createNotificationChannel(channel);
    }

    /**
     * Whether a channel already carries the wanted sound. The last path
     * segment is compared too, because Android normalises the uri it stores.
     */
    private boolean sameSound(Uri have, Uri want) {
        if (want == null) return have == null;
        if (have == null) return false;
        if (have.toString().equals(want.toString())) return true;
        String a = have.getLastPathSegment();
        String b = want.getLastPathSegment();
        return a != null && a.equals(b);
    }

    private JSObject channelsCreated(boolean created) {
        JSObject result = new JSObject();
        result.put("channels", created);
        return result;
    }

    /**
     * USAGE_ALARM so the sound still comes out when the device is on silent or
     * the ringer is off, which is the normal case for a timer that ends while
     * the phone is face down.
     */
    private AudioAttributes alarmAttributes() {
        return new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
    }

    private AudioAttributes notificationAttributes() {
        return new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
    }

    @Override
    protected void handleOnDestroy() {
        release();
        super.handleOnDestroy();
    }
}

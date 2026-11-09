// Run after `npx cap add android`. Adds the ScreenPin plugin, permissions,
// portrait lock and an auto-incrementing versionCode to the generated project.
import fs from 'node:fs';
import path from 'node:path';

const APP = 'android/app';
const PKG_DIR = path.join(APP, 'src/main/java/com/libr/focusforge');
const MANIFEST = path.join(APP, 'src/main/AndroidManifest.xml');
const GRADLE = path.join(APP, 'build.gradle');
const RAW = path.join(APP, 'src/main/res/raw');
const SFX = path.join('src', 'assets', 'sfx');

function must(cond, msg) {
  if (!cond) {
    console.error('patch-android: ' + msg);
    process.exit(1);
  }
}

must(fs.existsSync(APP), 'android/ not found. Run `npx cap add android` first.');
fs.mkdirSync(PKG_DIR, { recursive: true });

// 1) plugin + MainActivity registration
fs.copyFileSync('android-plugin/ScreenPinPlugin.java', path.join(PKG_DIR, 'ScreenPinPlugin.java'));
fs.copyFileSync('android-plugin/SoundPlugin.java', path.join(PKG_DIR, 'SoundPlugin.java'));
fs.writeFileSync(
  path.join(PKG_DIR, 'MainActivity.java'),
  `package com.libr.focusforge;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ScreenPinPlugin.class);
        registerPlugin(SoundPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
`,
);

// 2) manifest: permissions + portrait
let m = fs.readFileSync(MANIFEST, 'utf8');
const perms = ['POST_NOTIFICATIONS', 'VIBRATE', 'SCHEDULE_EXACT_ALARM']
  .filter((p) => !m.includes(`android.permission.${p}`))
  .map((p) => `    <uses-permission android:name="android.permission.${p}" />`)
  .join('\n');
if (perms) m = m.replace('</manifest>', `${perms}\n</manifest>`);
if (!m.includes('screenOrientation')) m = m.replace('<activity', '<activity\n            android:screenOrientation="portrait"');
fs.writeFileSync(MANIFEST, m);

// 3) versionCode from CI run number so each build can update the previous one
let g = fs.readFileSync(GRADLE, 'utf8');
const code = parseInt(process.env.GITHUB_RUN_NUMBER || '1', 10);
must(/versionCode\s+\d+/.test(g), 'versionCode not found in app/build.gradle');
g = g.replace(/versionCode\s+\d+/, `versionCode ${code}`).replace(/versionName\s+"[^"]*"/, 'versionName "1.0.0"');
fs.writeFileSync(GRADLE, g);

// 4) end-of-session ringtone into res/raw so the notification can play it.
//    Android resource names must be lowercase alphanumerics + underscore, so
//    ringtone-boom.mp3 becomes res/raw/ringtone_boom.mp3 (the extension must be
//    preserved - Android matches the resource by name without it, but the file
//    itself keeps its extension). Keep in sync with RINGTONE_NAME in src/native.js.
if (fs.existsSync(SFX)) {
  fs.mkdirSync(RAW, { recursive: true });
  for (const f of fs.readdirSync(SFX).filter((f) => f.endsWith('.mp3') || f.endsWith('.wav'))) {
    const ext = path.extname(f);
    const base = path.basename(f, ext).replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const resName = base + ext;
    fs.copyFileSync(path.join(SFX, f), path.join(RAW, resName));
    console.log('patch-android: sound ' + f + ' -> res/raw/' + resName);
  }
}

console.log('patch-android: done (versionCode ' + code + ')');

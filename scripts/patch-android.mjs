// Run after `npx cap add android`. Adds the ScreenPin plugin, permissions,
// portrait lock and an auto-incrementing versionCode to the generated project.
import fs from 'node:fs';
import path from 'node:path';

const APP = 'android/app';
const PKG_DIR = path.join(APP, 'src/main/java/com/libr/focusforge');
const MANIFEST = path.join(APP, 'src/main/AndroidManifest.xml');
const GRADLE = path.join(APP, 'build.gradle');

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
fs.writeFileSync(
  path.join(PKG_DIR, 'MainActivity.java'),
  `package com.libr.focusforge;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ScreenPinPlugin.class);
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

console.log('patch-android: done (versionCode ' + code + ')');

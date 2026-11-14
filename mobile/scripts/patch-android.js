'use strict';

/*
 * "npx cap add android" ile üretilen projeyi OA Radyo için yamalar (GitHub Actions'ta çalışır):
 *  - yerel eklenti ve arka plan hizmeti (mobile/native → app/src/main/java)
 *  - izinler: müzik, bildirim, ön plan hizmeti (medya), uyanık tutma
 *  - androidx.media bağımlılığı (bildirim ve kilit ekranı kontrolleri)
 *  - sürüm adı ve numarası; OA_RELEASE=1 ise yayın imzası (OA_KS_* ortam değişkenleri)
 *
 *   node mobile/scripts/patch-android.js <sürüm> <derleme-no>
 */

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = path.join(root, 'android', 'app');
const [version, build] = process.argv.slice(2);
if (!version || !/^\d+$/.test(build || '')) throw new Error('kullanım: patch-android.js <sürüm> <derleme-no>');
const release = process.env.OA_RELEASE === '1';

// 1) Java dosyaları
const javaDir = path.join(app, 'src', 'main', 'java', 'dev', 'oalabs', 'radyo');
fs.mkdirSync(javaDir, { recursive: true });
fs.cpSync(path.join(root, 'native', 'dev', 'oalabs', 'radyo'), javaDir, { recursive: true });

// 2) AndroidManifest.xml
const manFile = path.join(app, 'src', 'main', 'AndroidManifest.xml');
let man = fs.readFileSync(manFile, 'utf8');
const perms = [
  '<uses-permission android:name="android.permission.READ_MEDIA_AUDIO" />',
  '<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />',
  '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />',
  '<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />',
  '<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />',
  '<uses-permission android:name="android.permission.WAKE_LOCK" />',
];
for (const p of perms) {
  const name = p.match(/android:name="([^"]+)"/)[1];
  if (!man.includes(`"${name}"`)) man = man.replace(/(\s*)<application/, `$1${p}$1<application`);
}
if (!man.includes('usesCleartextTraffic')) man = man.replace('<application', '<application\n        android:usesCleartextTraffic="true"');
if (!man.includes('.PlaybackService')) {
  man = man.replace(/(\s*)<\/application>/, `$1    <service android:name=".PlaybackService" android:exported="false" android:foregroundServiceType="mediaPlayback" />$1</application>`);
}
fs.writeFileSync(manFile, man);

// 3) app/build.gradle
const gradleFile = path.join(app, 'build.gradle');
let g = fs.readFileSync(gradleFile, 'utf8');
g = g.replace(/versionName\s+"[^"]*"/, `versionName "${version}"`).replace(/versionCode\s+\d+/, `versionCode ${build}`);
if (!g.includes('androidx.media:media')) {
  g = g.replace(/dependencies\s*\{/, 'dependencies {\n    implementation "androidx.media:media:1.7.0"');
}
if (release && !g.includes('signingConfigs')) {
  g = g.replace(/(\n\s*buildTypes\s*\{)/, `
    signingConfigs {
        release {
            storeFile file(System.getenv("OA_KS_FILE"))
            storePassword System.getenv("OA_KS_PASSWORD")
            keyAlias System.getenv("OA_KS_ALIAS")
            keyPassword System.getenv("OA_KS_KEY_PASSWORD")
        }
    }$1`);
  g = g.replace(/(buildTypes\s*\{\s*release\s*\{)/, '$1\n            signingConfig signingConfigs.release');
}
fs.writeFileSync(gradleFile, g);

console.log(`Android projesi yamalandı: ${version} (${build})${release ? ', yayın imzası' : ''}`);
console.log(man.split('\n').filter((l) => /uses-permission|<service|usesCleartext/.test(l)).map((l) => l.trim()).join('\n'));

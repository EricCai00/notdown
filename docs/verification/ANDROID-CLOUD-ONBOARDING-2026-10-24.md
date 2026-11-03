<a id="android-首次云同步配置验证2026-10-24"></a>

# Android initial cloud sync setup validation (2026-10-24)

**English** · [简体中文](ANDROID-CLOUD-ONBOARDING-2026-10-24.zh-CN.md)

<a id="范围"></a>

## range

Android is used as an offline copy of the computer's existing cloud vault. When you open it for the first time, you must configure synchronization and select an existing cloud library. After the first synchronization is complete and successful, enter the editor; after that, you can edit offline. When not connected, first sync not completed, or disconnected, the settings page cannot be skipped by the close, Escape or Android return keys.

The mobile phone removes the independent database creation, library switching and ZIP recovery database creation entrance, and retains the import of Markdown and export of ZIP backup to the connected vault. Mobile API rejects cloud new requests that do not specify an existing vault ID; cloud libraries can still be created on the desktop. Upgrading does not automatically delete other users' old libraries.

<a id="验证"></a>

## Validation

| Check | result | evidence |
| --- | --- | --- |
| `npm test` | 991 items: 986 passed, 5 skipped, 0 failed | `.run/logs/mobile-cloud-onboarding-unit.log` |
| Final mobile front-end browser testing | 10 items passed: forced configuration, empty remote directory rejection, disconnection, Chinese editing, source code switching, reloading, Markdown import, attachment, ZIP database creation rejection, draft conflict and narrow screen offline editing | `.run/logs/mobile-cloud-onboarding-browser-delivery.log` |
| `npm run test:sync` | Supabase and WebDAV passed desktop/mobile cross-end synchronization, offline editing and conflict recovery, including independent desktop and mobile builds | `.run/logs/mobile-cloud-onboarding-sync.log` |
| `npm run android:build` | Finally, the front-end TypeScript and Vite were built, Capacitor copied, and Gradle assembleDebug were successful; the 8 native unit check was UP-TO-DATE, and there were no failures. | `.run/logs/mobile-cloud-onboarding-android-delivery.log` |
| Additional desktop editor and run settings checks | In the 33 item, 30 passed and 3 failed; the failed item still failed to be reviewed individually. | `.run/logs/mobile-cloud-onboarding-desktop.log`、`.run/logs/mobile-cloud-onboarding-desktop-recheck.log` |
| Connect to mobile phone to install | The overlay installation is successful. The mobile phone installation package SHA-256 is consistent with the final APK; the native WebView has displayed the forced cloud synchronization setting page. | `.run/logs/mobile-cloud-onboarding-install.log` |

The table failure is `editor.spec.ts` The common paragraphs of the Tab nest, subpage nodes are displayed, the Paragraph options in the overlay menu are waiting. They are not approved, and cannot be claimed to be backward-pass; this time, no modifications to the relevant editor implementation. Both mobile process and cross-end sync items are approved.

<a id="本机操作与交付"></a>

## Native operation and delivery

The user's explicit request is to stop the mobile app first and then only to use the app. `app.notdown.mobile` Implementation `pm clear`The original mobile library directory has been confirmed to have disappeared. This operation did not send the deleted records via a sync engine, and the computer and cloud library were retained.

- Installation package: `.run/android-release/Notdown-Android-cloud-linked-2026-10-24.apk`.
- SHA-256：`95658AD5BC83D2F3CE9BE0435D08B6488830A84586744594253AC510302E639F`。
- After the new version is launched, the local page directory is empty and there is no cloud connection; the account number and application password are left to the user to fill in on the first configuration page.
- The default WebDAV address and directory are consistent with the computer: `https://dav.jianguoyun.com/dav/`, `Notdown/My-notebook`; after logging in, select the existing `My notebook`.

Device verification covers installation, old local data clearing and native configuration page display; this time, the phone did not re-enter the real credentials after clearing and complete the download of the entire database, so it does not claim to have completed the complete synchronization acceptance of the new version of the real phone.

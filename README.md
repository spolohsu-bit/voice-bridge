# Voice Bridge Firebase

Static GitHub Pages version of Voice Bridge.

## Architecture

```text
Windows receiver page
  -> listens to Firebase Realtime Database
  -> receives latest text
  -> tries to copy it to the clipboard

iPhone sender page
  -> uses iPhone keyboard dictation in a text area
  -> sends text to Firebase
```

## Firebase setup

1. Open <https://console.firebase.google.com/>.
2. Create a project.
3. Add a Web App.
4. Copy the Firebase config into `firebase-config.js`.
5. Create Realtime Database.
6. Start in test mode for the first test.
7. Replace the database rules with `database.rules.json`.

## Current Firebase project

- Project name: `voice-bridge`
- Project ID: `voice-bridge-de67d`
- Realtime Database URL: `https://voice-bridge-de67d-default-rtdb.firebaseio.com`
- Plan: Spark free plan
- Web app nickname: `voice-bridge-web`

The local `firebase-config.js` already contains this project's web app config.

## GitHub Pages setup

1. Put this folder in a GitHub repository.
2. Enable GitHub Pages for the repository.
3. Open the published URL on Windows.
4. Bookmark the receiver URL.

## Use

1. Windows opens the receiver URL.
2. Click `Enable auto copy`.
3. iPhone scans the QR code.
4. iPhone dictates into the sender text area.
5. Tap `Send`.
6. Windows pastes with `Ctrl+V`.

## Important

Even on GitHub Pages, some browsers may still block clipboard writes that are
triggered by realtime events. This version uses a stronger fallback:

- `Copy latest` should work because it is a direct user click.
- If copy is still blocked, the latest text is selected automatically so you can press `Ctrl+C`.

## Test result

Local test with Firebase passed:

- Receiver listened on session `firebase-test-01`.
- Sender wrote `Firebase realtime bridge test.` and receiver received it.
- After `Enable auto copy`, sender wrote `Firebase auto copy test.` and receiver showed `Copied. Paste with Ctrl+V.`

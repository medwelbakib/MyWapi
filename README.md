# MyWapi

Personal WhatsApp sender for OTPs and notifications. Runs on an Android phone in Termux (Node.js), linked to your WhatsApp via **Linked Devices** with a pairing code. Your apps write a request to Firestore; MyWapi sends it and sets the status to `sent` or `failed`.

```
App ──write {to,text,status:"pending"}──► Firestore ──listener──► MyWapi (Termux) ──► WhatsApp
                                              ▲                         │
                                              └──── status: sent/failed ┘
```

> Unofficial (Baileys). Personal low-volume use only. Don't spam: WhatsApp can ban the number.

## 1. Firebase setup (once)

1. Create a project at <https://console.firebase.google.com>, enable **Firestore** (production mode).
2. **Project settings → Service accounts → Generate new private key.** Save as `serviceAccountKey.json`. Never commit it.
3. Deploy rules: paste `firestore.rules` into Firestore → Rules → Publish (or `firebase deploy --only firestore:rules`).
   Rules allow only the verified owner email (`owner@example.com`, replace with your own) to create/read requests; everyone else is denied. The service uses the Admin SDK, which bypasses rules.
4. Enable **Authentication** (Google or Email) so your apps sign in as the owner.

## 2. Phone setup (Termux)

Install **Termux** and **Termux:Boot** from F-Droid (not Play Store). Open Termux:Boot once.

```sh
pkg update && pkg upgrade
pkg install nodejs git termux-api
termux-setup-storage
git clone https://github.com/medwelbakib/MyWapi.git
cd MyWapi
npm install
cp .env.example .env      # edit: PHONE_NUMBER etc.
```

Copy `serviceAccountKey.json` into the `MyWapi` folder (e.g. via `termux-setup-storage` + `cp ~/storage/downloads/serviceAccountKey.json .`).

## 3. First run: pair WhatsApp

```sh
npm start
```

A pairing code like `ABCD-1234` is logged. On the phone: **WhatsApp → Settings → Linked Devices → Link a device → Link with phone number instead** and type the code. Session is saved in `./auth` (gitignored). Stop with Ctrl+C.

## 4. Auto-start on reboot

```sh
sh termux/install-boot.sh
```

Then in Android settings: disable battery optimization for Termux and Termux:Boot, and allow auto-start. Reboot to test. Check with `tail -f logs/mywapi.log`.

## 5. Sending from your apps

Add a document to `wa_messages`:

```js
await addDoc(collection(db, 'wa_messages'), {
  to: '15551234567',              // digits, country code, no +
  text: 'Your code is 482913',
  status: 'pending',
  createdAt: serverTimestamp(),
});
```

MyWapi updates the doc:

| status | meaning |
|---|---|
| `pending` | waiting |
| `sending` | claimed by MyWapi |
| `sent` | delivered to WhatsApp (`sentAt`, `waMessageId` set) |
| `failed` | gave up after `MAX_ATTEMPTS` (`error` set) |

Watch the doc with `onSnapshot` to react to the result.

## Config (`.env`)

| var | default | |
|---|---|---|
| `PHONE_NUMBER` | – | your number, digits only (pairing only) |
| `GOOGLE_APPLICATION_CREDENTIALS` | `./serviceAccountKey.json` | service account |
| `COLLECTION` | `wa_messages` | queue collection (keep in sync with rules) |
| `MAX_ATTEMPTS` | `3` | retries |
| `SEND_DELAY_MS` | `1500` | throttle |

## Logs

`logs/mywapi.log` (rotates at 2 MB, keeps `.1`) and `logs/stdout.log` (from the boot runner).

## Troubleshooting

- **Logged out**: delete `auth/`, rerun `npm start`, re-pair.
- **Stops after screen off**: battery optimization; `termux-wake-lock` is already called.
- **Permission denied in app**: signed-in email must match the one in `firestore.rules` and be verified.

MIT licensed.

# Axiom Pipeline Engine iPhone Install

This app is a private web app. No App Store, TestFlight, or Apple Developer account is required.

## Best Install Path

Use the Web Clip profile in `deliverables/ios/Axiom-Pipeline-Engine.mobileconfig`.

1. Deploy the latest `main` build to Cloudflare.
2. Send/open `deliverables/ios/Axiom-Pipeline-Engine.mobileconfig` on the iPhone.
3. Tap **Allow**.
4. Open **Settings**.
5. Tap **Profile Downloaded**.
6. Tap **Install**.
7. Enter device passcode.
8. Tap **Install** again.
9. Open **Axiom Ops** from the Home Screen.
10. Sign in with the approved Axiom account.

Use these accounts:

- Riley: `riley@getaxiom.ca`
- Aidan: `aidan@getaxiom.ca`

## Backup Install Path

If the profile is awkward to move onto the phone:

1. Open Safari on the iPhone.
2. Go to `https://operations.getaxiom.ca/dashboard`.
3. Tap Share.
4. Tap **Add to Home Screen**.
5. Keep name as **Axiom Ops**.
6. Tap **Add**.
7. Open **Axiom Ops** from the Home Screen.
8. Sign in.

After this PWA upgrade, this is not a basic browser bookmark. It launches as a standalone web app with the Axiom icon, app name, app switcher entry, and no Safari address bar.

## Expected Behavior

- Opens to Dashboard.
- Uses same production URL: `https://operations.getaxiom.ca`.
- Keeps CRM data online-only.
- Keeps first-party auth cookies like Safari/Chrome.
- Redirects to Sign In if the session expires.
- Shows a connection-needed screen when the phone is offline.

## Notes

- iOS browsers use WebKit under the hood. Chrome on iPhone cannot run a separate Chrome engine.
- The installed app still talks to the same Cloudflare Worker and D1 production backend.
- The profile is intentionally unsigned for simple two-person internal install. iOS will warn that it is unsigned; it only installs a removable Home Screen Web Clip for `operations.getaxiom.ca`.
- If the icon does not update after deploy, delete the old Home Screen icon/profile and reinstall.

## Deploy/Verify

After deploying, verify these URLs return `200`:

- `https://operations.getaxiom.ca/manifest.webmanifest`
- `https://operations.getaxiom.ca/apple-touch-icon.png`
- `https://operations.getaxiom.ca/icons/icon-192.png`
- `https://operations.getaxiom.ca/icons/icon-512.png`
- `https://operations.getaxiom.ca/sw.js`

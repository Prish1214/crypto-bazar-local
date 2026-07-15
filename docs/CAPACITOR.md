# Building the CryptoBazar Android app (Capacitor)

The web app continues to run on Lovable exactly as before. For Android, we
ship a **static SPA** bundle that talks to the same hosted API over HTTPS.

```
┌──────────────────────────────┐         ┌─────────────────────────────────┐
│  Android APK (Capacitor)     │  HTTPS  │  Lovable hosted TanStack app    │
│  dist-mobile/ inside WebView │────────▶│  /api/*  +  /_serverFn/*        │
└──────────────────────────────┘         └─────────────────────────────────┘
```

## One-time setup on your machine

1. Install **Android Studio** (includes JDK 17 + Android SDK).
2. From the project root:
   ```bash
   bun install
   npx cap add android          # creates ./android/ (do this once)
   ```

## Every build

```bash
# 1. Build the static SPA into dist-mobile/
VITE_API_BASE_URL=https://crypto-bazar-local.lovable.app \
VITE_SUPABASE_URL=https://jponeelmwvkufvsuxyes.supabase.co \
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-key> \
bun run build:mobile

# 2. Copy the web assets into the Android project
bun run cap:sync

# 3. Open in Android Studio (Run ▶ builds & installs on device/emulator)
bun run cap:open:android
```

## Required manual configuration

### Supabase Auth → URL Configuration

Add to **Redirect URLs**:

```
cryptobazar://auth/callback
```

Without this, the magic-link email will refuse to open the app.

### Android deep-link intent filter

Edit `android/app/src/main/AndroidManifest.xml` and add inside the
`<activity android:name=".MainActivity" ...>` block:

```xml
<intent-filter android:autoVerify="false">
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="cryptobazar" android:host="auth" />
</intent-filter>
```

## How auth works on mobile

1. User taps "Sign in" and enters email/password (existing flow).
2. For signup, Supabase sends a confirmation email whose link is
   `cryptobazar://auth/callback#access_token=…&refresh_token=…`.
3. Tapping the link opens the app; `src/lib/deep-links.ts` catches the URL,
   calls `supabase.auth.setSession(…)`, then navigates to `/wallet`.

## How API calls work on mobile

`src/lib/api-base.ts` installs a `window.fetch` patch at startup. Any relative
`/api/...` or `/_serverFn/...` call is rewritten to
`${VITE_API_BASE_URL}${path}` — so no existing call site needed changes.

All `/api/*` server routes now include CORS headers (`src/lib/cors.ts`) so
cross-origin calls from the Android WebView succeed.

## Release build

1. Generate a keystore (once): follow Android Studio's *Build → Generate Signed
   Bundle / APK* wizard.
2. Keep the keystore + credentials outside the repo.
3. Update `android/app/build.gradle` with your signing config.
4. Upload the `.aab` to Google Play Console.

# MNDBDY HealthKit PoC

A throwaway debugging app that validates exactly one question for MNDBDY.FIT:

> Can we reliably read heart rate, HRV, and sleep data from Apple HealthKit?

Everything else — visual design, navigation, session content — is out of scope.

## How it works

All health access goes through one small interface, `HealthProvider`
([src/health/types.ts](src/health/types.ts)). There are two implementations:

| File | Provider `name` | Used on |
| --- | --- | --- |
| [src/health/provider.ts](src/health/provider.ts) | `mock` | Linux, web, Android |
| [src/health/provider.ios.ts](src/health/provider.ios.ts) | `healthkit` | iOS |

Metro picks the right one from the `.ios` file extension. There is no
`Platform.OS` branching anywhere, and consumers always write
`import { provider } from './health'` with no extension.

`provider.ios.ts` is the **only** file allowed to import
`@kingstinct/react-native-healthkit`. Keeping the import out of the shared
files is what lets the whole app bundle and run on Linux.

The active provider name is shown at the top of the screen, so it is always
obvious which one you are looking at.

## Running on Linux (mock data)

```bash
npm install
npx tsc --noEmit      # zero errors
npx expo start --web  # opens the debug screen
```

The screen has two buttons, deliberately separate:

1. **Init & request permissions** — checks availability, then requests
   authorization.
2. **Load data** — disabled until step 1 finishes.

That ordering is not cosmetic. On iOS, querying HealthKit before authorization
has been requested **crashes the app** rather than throwing a catchable error.
Do not merge the buttons or auto-run the load on mount.

## Testing on a Mac (real HealthKit)

Requires Xcode 26.4+ and a physical iPhone — the simulator has no real Health
data (you can hand-add samples in the Health app on a simulator, but Apple
Watch–sourced data will not be there).

### 1. Install JS dependencies

```bash
cd mndbdy-poc
npm install
```

### 2. Set a real bundle identifier

`app.json` still says `"com.CHANGEME.mndbdypoc"`. Replace it with a real
identifier (e.g. `com.yourname.mndbdypoc`) **before** prebuilding — Xcode uses
it for signing.

### 3. Generate the native iOS project

```bash
npx expo prebuild --clean --platform ios
```

This generates the `ios/` folder (deliberately not committed — see
`.gitignore`). The HealthKit config plugin automatically adds the
`com.apple.developer.healthkit` entitlement and the two `Info.plist` usage
descriptions, so there is nothing to add by hand in Xcode (more on this
below).

### 4. Open the project in Xcode

```bash
open ios/mndbdypoc.xcworkspace
```

Open the `.xcworkspace` file, **not** `.xcodeproj` — CocoaPods is used.

### 5. Set up signing & device in Xcode

- Select the project root in the navigator → target **mndbdypoc** →
  **Signing & Capabilities** tab.
- Pick your **Team** (your Apple ID / developer account).
- Connect your iPhone (cable or same Wi-Fi network) and select it in the
  device selector next to the Run button.
- Make sure **Settings → Privacy & Security → Developer Mode** is enabled on
  the iPhone (only needed the first time it's used for development).

### 6. Build & run

Press **▶ (Cmd+R)** in Xcode. Or, from the terminal, without opening Xcode
manually:

```bash
npx expo run:ios --device
```

### 7. Test on the device

Once the app opens on the iPhone:

1. Tap **Init & request permissions** — grant heart rate, HRV and sleep in
   the sheet that appears.
2. Tap **Load data** (only enabled once step 1 finishes).

### Things that will bite you

- Never query HealthKit before requesting authorization — that **crashes**
  the app, it does not throw a catchable error.
- `expo prebuild --clean` wipes any manual changes made in Xcode — configure
  through `app.json` / the config plugin, never edit Xcode project settings
  directly.
- Don't commit `ios/` or `android/` — see
  [Do not commit `ios/` or `android/`](#do-not-commit-ios-or-android) below.

### About the entitlement

The library ships a config plugin, wired up in `app.json`. It sets the
`com.apple.developer.healthkit` entitlement **and** the two `Info.plist` usage
descriptions automatically, so there is nothing to add by hand in Xcode. This
matters because `expo prebuild --clean` wipes manual Xcode changes.

Background delivery is explicitly turned off (`"background": false`) — the
plugin enables it by default, and this PoC does not need it. Turn it back on
when the real app wants morning pre-fetch.

## Things to know before reading the iOS code

**Read permission status is unknowable.** HealthKit deliberately does not
distinguish "denied" from "not determined" for *read* access — that is a
privacy feature, not a bug. `requestAuthorization` resolving tells you the
sheet was shown, nothing more. An empty result means **no data available** and
nothing else. Never write UI copy claiming permission was denied.

**Heart rate's canonical unit is `count/s`, not `count/min`.** The provider
passes `unit: 'count/min'` explicitly on every heart rate query. Drop it and
values come back roughly 60x too small.

**Sleep needs aggregation.** HealthKit stores a night as many short interval
samples. The provider filters to genuinely-asleep values (excluding `inBed`
and `awake`), groups by the calendar day the interval *ends* on, and sums the
durations. Attributing to the end day means sleep from 23:30 Monday to 07:00
Tuesday counts as Tuesday's — which is what a morning session needs.

**Source names are preserved.** Every sample carries `source` (e.g. "Apple
Watch", "iPhone", a third-party app), read from
`sourceRevision.source.toJSON().name`. Plain `sourceRevision.source.name`
does **not** work — every Nitro `HybridObject` (which `source` is one of)
has its own built-in `name` describing the native binding's type (it reads
back as the literal string `"SourceProxy"`), and that shadows the
domain-specific `Source.name` declared on the same interface. `toJSON()`
returns a plain object instead of the proxy, sidestepping the collision. This
is how Apple Watch data is told apart from manual entries.

## Do not commit `ios/` or `android/`

Both are generated by `expo prebuild` and are already in `.gitignore`. If you
see them staged, something regenerated them into the index — unstage rather
than committing.

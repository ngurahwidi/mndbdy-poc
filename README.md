# MNDBDY PoC

A throwaway debugging app that validates two questions for MNDBDY.FIT:

> 1. Can we reliably read heart rate, HRV, and sleep data from Apple HealthKit?
> 2. Can we schedule a real system alarm with AlarmKit?

Everything else — visual design, navigation, session content — is out of scope.

The two features are independent: the alarm card at the top of the screen needs
no init step and does not touch HealthKit.

## How HealthKit works here

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

## How the alarm works here

Same shape, same rules. `AlarmProvider`
([src/alarm/types.ts](src/alarm/types.ts)) has two implementations:

| File | Provider `name` | Used on |
| --- | --- | --- |
| [src/alarm/provider.ts](src/alarm/provider.ts) | `mock` | Linux, web, Android |
| [src/alarm/provider.ios.ts](src/alarm/provider.ios.ts) | `alarmkit` | iOS |

`provider.ios.ts` is the **only** file allowed to import
`react-native-ios-alarmkit`.

The UI is one card ([src/components/AlarmSection.tsx](src/components/AlarmSection.tsx)):
a switch, the native iOS time wheel, and day chips.

## Things to know before reading the alarm code

**There is exactly one alarm, under a hardcoded UUID.** AlarmKit addresses
alarms by UUID and rejects anything that is not one, so the id lives as a
constant in `provider.ios.ts` and never leaves it. Scheduling again under the
same id replaces the previous schedule, which is what "edit the alarm" means
here. Changing that constant would strand a live alarm in the OS that the app
can no longer find or cancel.

**No days selected means "ring once", not "never" and not "daily".** The
library maps a non-empty weekday list to `Recurrence.weekly(days)` and
*everything else — including an empty array and an omitted field* — to
`Recurrence.never`, which fires a single time. Its README claims omitting the
field gives a daily alarm; the Swift it ships says otherwise. So a daily alarm
passes all seven days explicitly, and the UI says "Once, then stops" when no
day is selected.

**The toggle reads its state back from the OS, not from app state.** A
scheduled alarm outlives the app, and the user can cancel it from the lock
screen. `useAlarm` calls `getScheduled()` on mount and adopts whatever it
finds, so there is no AsyncStorage and nothing to keep in sync.

**Native calls are serialised.** Scheduling is cancel-then-create under the
hood, so two overlapping schedules can leave the OS holding the older one.
`useAlarm` runs every provider call through a single promise chain — do not
"simplify" that away by calling the provider directly from a handler.

**The time picker is native-only, on purpose.**
`@react-native-community/datetimepicker` (`mode="time"`, `display="spinner"`)
renders the real `UIDatePicker` wheel on iOS. It has no web implementation: on
web and Android it renders `null` and logs *"DateTimePicker is not supported
on: web"*. That is a warning, not a crash, so the web build still runs — the
`07:00` text above the picker is the readout there, and the switch, the day
chips and the log all still work against the mock provider.

**Wheel edits are debounced by 600 ms.** The iOS wheel fires a change for every
value it spins past, so writing straight through would mean dozens of native
reschedules per gesture. `useAlarm` moves local state immediately and only
touches the OS once the wheel settles. Two guards keep a pending edit from
resurrecting a cancelled alarm: flipping the switch clears the timer, and the
debounced task re-checks that the alarm is still on before it schedules.

**No Widget Extension is needed.** It is required for `scheduleTimer()` and for
countdown presentations, neither of which this PoC uses. `scheduleAlarm()`
alerts correctly without one.

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

The alarm card partly works on Linux, against the mock provider: the switch and
the day chips behave, and `provider: mock` is printed on the card so you never
mistake it for the real thing. The mock grants permission on request and forgets
everything on reload.

The time wheel itself is **blank on web** — see the note above. To exercise a
different time from Linux, change `DEFAULT_SCHEDULE` in
[src/hooks/useAlarm.ts](src/hooks/useAlarm.ts).

## Testing on a Mac (real HealthKit + AlarmKit)

Requires Xcode 26.4+ and a physical iPhone — the simulator has no real Health
data (you can hand-add samples in the Health app on a simulator, but Apple
Watch–sourced data will not be there), and AlarmKit needs **iOS 26 or newer**
on a real device. On anything older the card shows `supported -> false` and
every control stays locked; that is the library's documented no-op path, not a
failure.

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

For the alarm: flip the switch, grant the prompt, set a time a couple of
minutes out, and lock the phone. Then kill the app and relaunch it — the switch
must come back on with the same time, because it is read from the OS.

### About the entitlement

The HealthKit library ships a config plugin, wired up in `app.json`. It sets the
`com.apple.developer.healthkit` entitlement **and** the two `Info.plist` usage
descriptions automatically, so there is nothing to add by hand in Xcode. This
matters because `expo prebuild --clean` wipes manual Xcode changes.

`@react-native-community/datetimepicker` ships a config plugin too, and
`npx expo install` added it to `app.json` automatically.

`react-native-ios-alarmkit` ships **no** config plugin, so its one requirement —
`NSAlarmKitUsageDescription` — is set directly in `app.json` under
`ios.infoPlist`. Without it the OS refuses the authorization request and
`requestAuthorization()` throws instead of showing a prompt. AlarmKit needs no
entitlement.

### Known risk: Nitro version skew

`react-native-ios-alarmkit@0.7.6` ships C++/Swift generated by **nitrogen
0.33.2**, while this app resolves `react-native-nitro-modules@0.37.1` (pulled in
by the HealthKit library). Nitro is pre-1.0 and its generated code tracks the
runtime closely, so this pairing is unverified.

TODO(mac): if `pod install` or the Xcode build fails inside `NitroAlarmkit`,
that skew is the first suspect. Either pin `react-native-nitro-modules` to a
version both libraries accept, or regenerate the alarm library's bindings with
the matching nitrogen. This cannot be checked from Linux.

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

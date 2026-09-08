/**
 * Real Apple AlarmKit provider — iOS 26+ only.
 *
 * This is the ONLY file in the app that may import
 * 'react-native-ios-alarmkit'. Metro resolves this file instead of
 * `provider.ts` when bundling for iOS; every consumer imports './provider'
 * without an extension.
 *
 * Written against react-native-ios-alarmkit v0.7.6 (Nitro Modules). The
 * library's `lib/*.d.ts` and `ios/HybridAlarmKit.swift` were read directly —
 * see README.md for the API surface this targets.
 */

import AlarmKit from 'react-native-ios-alarmkit'
import type { Alarm } from 'react-native-ios-alarmkit'

import type {
  AlarmAuthorizationState,
  AlarmProvider,
  AlarmSchedule,
  Weekday,
} from './types'

/**
 * The PoC schedules exactly one alarm, so its id is a constant rather than
 * something generated per-save. AlarmKit rejects ids that are not valid UUIDs,
 * and `scheduleAlarm` cancels an existing alarm with the same id before
 * creating the new one — which is exactly the "edit the alarm" behaviour we
 * want.
 *
 * Do not change this value: an alarm scheduled under the old id would stay
 * live in the OS with no way for the app to find or cancel it.
 */
const ALARM_ID = 'b08e9989-7284-4f07-bfe1-128dffe18301'

/** Shown on the lock screen / Dynamic Island when the alarm fires. */
const ALARM_TITLE = 'MNDBDY — time to move'
const TINT_COLOR = '#0a58ca'

const fail = (operation: string, cause: unknown): never => {
  const detail = cause instanceof Error ? cause.message : String(cause)
  throw new Error(`AlarmKit ${operation} failed: ${detail}`)
}

class AlarmKitProvider implements AlarmProvider {
  readonly name = 'alarmkit'

  /**
   * `isSupported` is a native getter, hence the try — but note it cannot save
   * you in Expo Go: the library calls `NitroModules.createHybridObject()` at
   * *import* time, so a build without the native module dies on the import
   * above, before this method exists. That is the same deal the HealthKit
   * library makes, and it is why this app needs `expo run:ios`.
   *
   * On a dev build running iOS 25 or older the module is linked and this
   * correctly returns false.
   *
   * TODO(mac): confirm this returns `true` on an iOS 26 device and `false` —
   * not a crash — on an older one.
   */
  async isSupported(): Promise<boolean> {
    try {
      return AlarmKit.isSupported
    } catch {
      return false
    }
  }

  async getAuthorizationState(): Promise<AlarmAuthorizationState> {
    try {
      return await AlarmKit.getAuthorizationState()
    } catch (cause) {
      return fail('authorization state read', cause)
    }
  }

  /**
   * Requires `NSAlarmKitUsageDescription` in Info.plist — it is set from
   * app.json. Without it the OS rejects the request and this throws instead of
   * showing a prompt.
   *
   * The library resolves `true` for authorized and `false` for anything else,
   * which conflates "denied" with "prompt dismissed", so the actual state is
   * read back from the OS on the non-granted path.
   *
   * TODO(mac): confirm the prompt appears on first request and that a second
   * request after a grant resolves immediately instead of re-prompting.
   */
  async requestAuthorization(): Promise<AlarmAuthorizationState> {
    try {
      const granted = await AlarmKit.requestAuthorization()
      if (granted) return 'authorized'
      return await AlarmKit.getAuthorizationState()
    } catch (cause) {
      return fail('authorization request', cause)
    }
  }

  /**
   * Reads the alarm back out of the OS rather than out of app state, so the
   * toggle still reflects reality after the app is killed and relaunched, or
   * after the user cancels the alarm from the lock screen.
   */
  async getScheduled(): Promise<AlarmSchedule | null> {
    try {
      const alarms = await AlarmKit.getAlarms()
      const alarm = alarms.find((candidate: Alarm) => candidate.id === ALARM_ID)
      const schedule = alarm?.schedule
      // A one-shot alarm that has already fired is gone from this list, and a
      // 'fixed' schedule is never something this app creates.
      if (!schedule || schedule.type !== 'relative') return null

      return {
        hour: schedule.hour,
        minute: schedule.minute,
        weekdays: (schedule.weekdays ?? []) as readonly Weekday[],
      }
    } catch (cause) {
      return fail('alarm list read', cause)
    }
  }

  /**
   * NOTE: an empty `weekdays` list means "fire once", not "every day".
   * The library maps a non-empty list to `Recurrence.weekly(days)` and
   * everything else — including an empty array — to `Recurrence.never`. Its
   * README claims omitting the field gives a daily alarm; the Swift it ships
   * says otherwise, so a daily alarm passes all seven days explicitly and
   * `undefined` is only sent for the deliberate fire-once case.
   *
   * TODO(mac): verify on device that selecting all seven days really repeats
   * daily, and that selecting none fires exactly once and then disappears from
   * `getAlarms()`.
   */
  async schedule(schedule: AlarmSchedule): Promise<void> {
    try {
      await AlarmKit.scheduleAlarm(ALARM_ID, {
        hour: schedule.hour,
        minute: schedule.minute,
        weekdays:
          schedule.weekdays.length > 0 ? [...schedule.weekdays] : undefined,
        title: ALARM_TITLE,
        snoozeEnabled: false,
        tintColor: TINT_COLOR,
      })
    } catch (cause) {
      fail('schedule', cause)
    }
  }

  /** Idempotent — cancelling an alarm that is not scheduled is a no-op. */
  async cancel(): Promise<void> {
    try {
      await AlarmKit.cancel(ALARM_ID)
    } catch (cause) {
      fail('cancel', cause)
    }
  }
}

export const provider: AlarmProvider = new AlarmKitProvider()

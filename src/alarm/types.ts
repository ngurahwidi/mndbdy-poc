/**
 * Platform-agnostic alarm contract.
 *
 * This file must NOT import 'react-native-ios-alarmkit' or any other native
 * module. It is the shared contract that both the mock provider and the real
 * AlarmKit provider satisfy, and it has to compile and run on Linux, web and
 * Android where AlarmKit does not exist.
 */

export type AlarmAuthorizationState = 'notDetermined' | 'authorized' | 'denied'

export type Weekday =
  | 'sunday'
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'

/** Sunday-first, matching AlarmKit's `Locale.Weekday` naming. */
export const WEEKDAYS: readonly Weekday[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
]

export type AlarmSchedule = {
  /** 0–23 */
  hour: number
  /** 0–59 */
  minute: number
  /**
   * Days the alarm repeats on. An **empty** list means "fire once" at the next
   * occurrence of that time — it does NOT mean daily. A daily alarm passes all
   * seven days explicitly. See the note in `provider.ios.ts`.
   */
  weekdays: readonly Weekday[]
}

/**
 * The PoC owns exactly one alarm, so the provider hides the underlying alarm
 * id entirely. Scheduling again overwrites the previous schedule.
 */
export interface AlarmProvider {
  readonly name: string
  /** `false` on Android, web and iOS < 26. Every other method is then a no-op. */
  isSupported(): Promise<boolean>
  getAuthorizationState(): Promise<AlarmAuthorizationState>
  /** Shows the system prompt if needed, then reports the resulting state. */
  requestAuthorization(): Promise<AlarmAuthorizationState>
  /** The currently scheduled alarm, or `null` when nothing is scheduled. */
  getScheduled(): Promise<AlarmSchedule | null>
  schedule(schedule: AlarmSchedule): Promise<void>
  cancel(): Promise<void>
}

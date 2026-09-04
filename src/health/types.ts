/**
 * Platform-agnostic health data contract.
 *
 * This file must NOT import from '@kingstinct/react-native-healthkit' or any
 * other native module. It is the shared contract that both the mock provider
 * and the real HealthKit provider satisfy, and it has to compile and run on
 * Linux, web and Android where HealthKit does not exist.
 */

export type HealthSample = {
  value: number
  unit: string
  /** ISO 8601 */
  startDate: string
  /** ISO 8601 */
  endDate: string
  /** e.g. "Apple Watch", "Mock Data" */
  source: string
}

export type SleepSummary = {
  /** YYYY-MM-DD */
  date: string
  totalMinutes: number
  source: string
}

export type StepsSummary = {
  /** YYYY-MM-DD */
  date: string
  totalSteps: number
  source: string
}

export interface HealthProvider {
  readonly name: string
  isAvailable(): Promise<boolean>
  requestPermissions(): Promise<void>
  getHeartRate(limit?: number): Promise<HealthSample[]>
  getHRV(limit?: number): Promise<HealthSample[]>
  getSleep(days?: number): Promise<SleepSummary[]>
  getSteps(days?: number): Promise<StepsSummary[]>
  /**
   * Writes a short "asleep" sample ending now, `minutes` long. Exists to
   * validate the write side of HealthKit — call `getSleep` afterwards to
   * confirm it round-trips.
   */
  saveTestSleepSample(minutes?: number): Promise<void>
  /**
   * Writes a single instantaneous heart rate reading (`bpm`) timestamped now
   * — mirrors the "Add Data" flow in the Health app's Heart Rate screen.
   */
  saveHeartRateSample(bpm: number): Promise<void>
}

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

export interface HealthProvider {
  readonly name: string
  isAvailable(): Promise<boolean>
  requestPermissions(): Promise<void>
  getHeartRate(limit?: number): Promise<HealthSample[]>
  getHRV(limit?: number): Promise<HealthSample[]>
  getSleep(days?: number): Promise<SleepSummary[]>
}

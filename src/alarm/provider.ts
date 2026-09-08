/**
 * Mock alarm provider — used on Linux, web and Android.
 *
 * Metro picks `provider.ios.ts` over this file when bundling for iOS, so this
 * implementation must never import anything iOS-specific.
 *
 * State lives in memory only: a reload starts from "not determined, nothing
 * scheduled". The real provider reads its state back from the OS instead.
 */

import type {
  AlarmAuthorizationState,
  AlarmProvider,
  AlarmSchedule,
} from './types'

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/** 200–400ms, so loading states in the UI are actually exercised. */
const simulateLatency = (): Promise<void> => delay(200 + Math.random() * 200)

class MockAlarmProvider implements AlarmProvider {
  readonly name = 'mock'

  #authorization: AlarmAuthorizationState = 'notDetermined'
  #scheduled: AlarmSchedule | null = null

  async isSupported(): Promise<boolean> {
    await simulateLatency()
    return true
  }

  async getAuthorizationState(): Promise<AlarmAuthorizationState> {
    await simulateLatency()
    return this.#authorization
  }

  async requestAuthorization(): Promise<AlarmAuthorizationState> {
    await simulateLatency()
    // The mock always grants, so the happy path is what you exercise on Linux.
    // Flip this to 'denied' by hand when you want to see the denied UI.
    this.#authorization = 'authorized'
    return this.#authorization
  }

  async getScheduled(): Promise<AlarmSchedule | null> {
    await simulateLatency()
    return this.#scheduled
  }

  async schedule(schedule: AlarmSchedule): Promise<void> {
    await simulateLatency()
    this.#scheduled = { ...schedule, weekdays: [...schedule.weekdays] }
  }

  async cancel(): Promise<void> {
    await simulateLatency()
    this.#scheduled = null
  }
}

export const provider: AlarmProvider = new MockAlarmProvider()

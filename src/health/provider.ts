/**
 * Mock health provider — used on Linux, web and Android.
 *
 * Metro picks `provider.ios.ts` over this file when bundling for iOS, so this
 * implementation must never import anything iOS-specific.
 */

import type { HealthProvider, HealthSample, SleepSummary } from './types'

const SOURCE = 'Mock Data'

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/** 200–400ms, so loading states in the UI are actually exercised. */
const simulateLatency = (): Promise<void> => delay(200 + Math.random() * 200)

const randomBetween = (min: number, max: number): number =>
  min + Math.random() * (max - min)

const toDayKey = (date: Date): string => {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Builds `count` samples walking backwards from now, one every
 * `intervalMinutes`, most recent first — matching the descending sort order
 * the real HealthKit provider requests.
 */
const buildSamples = (
  count: number,
  unit: string,
  intervalMinutes: number,
  generate: () => number,
): HealthSample[] => {
  const now = Date.now()
  const intervalMs = intervalMinutes * 60_000

  return Array.from({ length: count }, (_, index) => {
    const end = new Date(now - index * intervalMs)
    const start = new Date(end.getTime() - 60_000)
    return {
      value: Math.round(generate() * 10) / 10,
      unit,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      source: SOURCE,
    }
  })
}

class MockHealthProvider implements HealthProvider {
  readonly name = 'mock'

  async isAvailable(): Promise<boolean> {
    await simulateLatency()
    return true
  }

  async requestPermissions(): Promise<void> {
    await simulateLatency()
  }

  async getHeartRate(limit = 50): Promise<HealthSample[]> {
    await simulateLatency()
    // Resting-ish heart rate, sampled every 5 minutes.
    return buildSamples(limit, 'count/min', 5, () => randomBetween(60, 80))
  }

  async getHRV(limit = 50): Promise<HealthSample[]> {
    await simulateLatency()
    // HRV SDNN is recorded far less often than heart rate — roughly hourly.
    return buildSamples(limit, 'ms', 60, () => randomBetween(30, 60))
  }

  async getSleep(days = 7): Promise<SleepSummary[]> {
    await simulateLatency()

    const now = new Date()
    return Array.from({ length: days }, (_, index) => {
      const day = new Date(now)
      day.setDate(day.getDate() - index)
      return {
        date: toDayKey(day),
        // 6–8 hours a night.
        totalMinutes: Math.round(randomBetween(360, 480)),
        source: SOURCE,
      }
    })
  }
}

export const provider: HealthProvider = new MockHealthProvider()

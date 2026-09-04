/**
 * Real Apple HealthKit provider — iOS only.
 *
 * This is the ONLY file in the app that may import
 * '@kingstinct/react-native-healthkit'. Metro resolves this file instead of
 * `provider.ts` when bundling for iOS; every consumer imports './provider'
 * without an extension.
 *
 * Written against @kingstinct/react-native-healthkit v14.1.0 (Nitro Modules).
 * The type definitions in node_modules were read directly — see README.md for
 * the API surface this targets.
 */

import {
  CategoryValueSleepAnalysis,
  isHealthDataAvailableAsync,
  queryCategorySamples,
  queryQuantitySamples,
  requestAuthorization,
} from '@kingstinct/react-native-healthkit'
import type {
  CategorySampleTyped,
  ObjectTypeIdentifier,
  QuantitySampleTyped,
} from '@kingstinct/react-native-healthkit'

import type { HealthProvider, HealthSample, SleepSummary } from './types'

const HEART_RATE = 'HKQuantityTypeIdentifierHeartRate' as const
const HRV_SDNN = 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN' as const
const SLEEP_ANALYSIS = 'HKCategoryTypeIdentifierSleepAnalysis' as const

/**
 * NOTE: the library's canonical unit for heart rate is 'count/s', NOT
 * 'count/min' (see QUANTITY_IDENTIFIER_CANONICAL_UNITS in the generated
 * types). If `unit` is omitted the values come back ~60x too small, so it is
 * passed explicitly on every heart rate query.
 *
 * TODO(mac): sanity-check that heart rate values land in the 40–200 range. If
 * they come back ~1.0, the explicit `unit` is being ignored and the canonical
 * 'count/s' is winning — multiply by 60 or use getPreferredUnit() instead.
 */
const HEART_RATE_UNIT = 'count/min' as const
const HRV_UNIT = 'ms' as const

const READ_TYPES: readonly ObjectTypeIdentifier[] = [
  HEART_RATE,
  HRV_SDNN,
  SLEEP_ANALYSIS,
]

/**
 * Sleep category values that count as actually asleep. `inBed` and `awake` are
 * deliberately excluded so totals reflect sleep, not time in bed.
 *
 * TODO(mac): compare a night's total against the Apple Health app. Older
 * iPhone-only data uses `asleepUnspecified` while Apple Watch writes the
 * Core/Deep/REM stages; if totals read roughly double, `inBed` samples are
 * overlapping the staged ones and the intervals need merging rather than
 * summing.
 */
const ASLEEP_VALUES: ReadonlySet<number> = new Set<number>([
  CategoryValueSleepAnalysis.asleepUnspecified,
  CategoryValueSleepAnalysis.asleepCore,
  CategoryValueSleepAnalysis.asleepDeep,
  CategoryValueSleepAnalysis.asleepREM,
])

const fail = (operation: string, cause: unknown): never => {
  const detail = cause instanceof Error ? cause.message : String(cause)
  throw new Error(`HealthKit ${operation} failed: ${detail}`)
}

/**
 * Reads the human-readable source name (e.g. "Apple Watch", "iPhone", or a
 * third-party app name) off a sample. This is how Apple Watch data is told
 * apart from manual entries, so it must not be dropped.
 *
 * `sourceRevision.source` is a Nitro HybridObject whose `name` is a native
 * property getter, so the access is defensive.
 *
 * TODO(mac): verify on device that `sourceRevision.source.name` is readable
 * for every sample and does not throw for a released/invalidated proxy. If it
 * does throw, switch to `sourceRevision.source.toJSON().name`.
 */
const readSourceName = (sample: {
  readonly sourceRevision?: { readonly source?: { readonly name?: string } }
}): string => {
  try {
    const name = sample.sourceRevision?.source?.name
    return typeof name === 'string' && name.length > 0 ? name : 'Unknown'
  } catch {
    return 'Unknown'
  }
}

const toHealthSample = (
  sample: QuantitySampleTyped<typeof HEART_RATE | typeof HRV_SDNN>,
  fallbackUnit: string,
): HealthSample => ({
  value: sample.quantity,
  unit: sample.unit ?? fallbackUnit,
  startDate: sample.startDate.toISOString(),
  endDate: sample.endDate.toISOString(),
  source: readSourceName(sample),
})

const toDayKey = (date: Date): string => {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

const startOfDaysAgo = (days: number): Date => {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() - days)
  return date
}

type SleepBucket = { minutes: number; sources: Set<string> }

/**
 * HealthKit stores sleep as many short interval samples per night, so they are
 * grouped and summed.
 *
 * A night is attributed to the calendar day the interval *ends* on: sleep from
 * 23:30 Monday to 07:00 Tuesday counts as Tuesday's sleep, which is what a
 * morning session needs. Intervals are not split across midnight — the whole
 * interval lands on its end day.
 */
const summariseSleep = (
  samples: readonly CategorySampleTyped<typeof SLEEP_ANALYSIS>[],
): SleepSummary[] => {
  const buckets = new Map<string, SleepBucket>()

  for (const sample of samples) {
    if (!ASLEEP_VALUES.has(sample.value)) continue

    const durationMs = sample.endDate.getTime() - sample.startDate.getTime()
    if (!Number.isFinite(durationMs) || durationMs <= 0) continue

    const key = toDayKey(sample.endDate)
    const bucket = buckets.get(key) ?? { minutes: 0, sources: new Set<string>() }
    bucket.minutes += durationMs / 60_000
    bucket.sources.add(readSourceName(sample))
    buckets.set(key, bucket)
  }

  return Array.from(buckets, ([date, bucket]) => ({
    date,
    totalMinutes: Math.round(bucket.minutes),
    source: bucket.sources.size > 0 ? [...bucket.sources].join(', ') : 'Unknown',
  })).sort((a, b) => b.date.localeCompare(a.date))
}

class HealthKitProvider implements HealthProvider {
  readonly name = 'healthkit'

  async isAvailable(): Promise<boolean> {
    try {
      return await isHealthDataAvailableAsync()
    } catch (cause) {
      return fail('availability check', cause)
    }
  }

  /**
   * Must be called — and awaited — before any query. Querying before
   * authorization has been requested crashes the app on iOS rather than
   * throwing, which is why the UI keeps this behind its own button.
   *
   * Note: read authorization status is intentionally unknowable on iOS.
   * `requestAuthorization` resolving does NOT mean read access was granted,
   * and an empty result set means "no data available" — never "denied". The
   * boolean it resolves with is deliberately ignored for that reason.
   *
   * TODO(mac): confirm the permission sheet appears on first launch and that
   * this resolves rather than hanging when the user dismisses it without
   * choosing. Also confirm it does not reject when re-run after a grant.
   */
  async requestPermissions(): Promise<void> {
    try {
      await requestAuthorization({
        toRead: READ_TYPES,
        // Declared so NSHealthUpdateUsageDescription is exercised and writing
        // completed sessions later does not need a second prompt.
        toShare: [SLEEP_ANALYSIS],
      })
    } catch (cause) {
      fail('authorization request', cause)
    }
  }

  async getHeartRate(limit = 50): Promise<HealthSample[]> {
    try {
      const samples = await queryQuantitySamples(HEART_RATE, {
        limit,
        ascending: false,
        unit: HEART_RATE_UNIT,
      })
      return samples.map((sample) => toHealthSample(sample, HEART_RATE_UNIT))
    } catch (cause) {
      return fail('heart rate query', cause)
    }
  }

  async getHRV(limit = 50): Promise<HealthSample[]> {
    try {
      const samples = await queryQuantitySamples(HRV_SDNN, {
        limit,
        ascending: false,
        unit: HRV_UNIT,
      })
      return samples.map((sample) => toHealthSample(sample, HRV_UNIT))
    } catch (cause) {
      return fail('HRV query', cause)
    }
  }

  async getSleep(days = 7): Promise<SleepSummary[]> {
    try {
      // One extra day of lookback so a night that started before the window
      // but ended inside it is still captured.
      const samples = await queryCategorySamples(SLEEP_ANALYSIS, {
        // Non-positive limit means "all samples" in this library (documented
        // on GenericQueryOptions.limit). A night can easily be hundreds of
        // interval samples, so no cap is applied here.
        // TODO(mac): confirm `limit: -1` really returns everything in the
        // window and that ~8 days of sleep intervals is not slow enough to
        // block the UI. If it is, page with queryCategorySamplesWithAnchor.
        limit: -1,
        ascending: false,
        filter: { date: { startDate: startOfDaysAgo(days + 1) } },
      })
      return summariseSleep(samples).slice(0, days)
    } catch (cause) {
      return fail('sleep query', cause)
    }
  }
}

export const provider: HealthProvider = new HealthKitProvider()

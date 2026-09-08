import { useCallback, useEffect, useRef, useState } from 'react'

import { provider } from '../alarm'
import type {
  AlarmAuthorizationState,
  AlarmSchedule,
  Weekday,
} from '../alarm'
import { WEEKDAYS } from '../alarm'

const MAX_LOG_ENTRIES = 50

/**
 * The iOS wheel fires a change for every value it passes while spinning, so a
 * write-through would mean dozens of native reschedules per gesture. Edits land
 * in local state immediately and only reach the OS once the wheel settles.
 */
const RESCHEDULE_DEBOUNCE_MS = 600

const DEFAULT_SCHEDULE: AlarmSchedule = {
  hour: 7,
  minute: 0,
  weekdays: WEEKDAYS,
}

const timestamp = (): string => new Date().toLocaleTimeString()

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/** Keeps chips in a stable Sunday-first order regardless of tap order. */
const sortWeekdays = (days: readonly Weekday[]): readonly Weekday[] =>
  WEEKDAYS.filter((day) => days.includes(day))

export type UseAlarm = {
  supported: boolean
  authorization: AlarmAuthorizationState
  enabled: boolean
  schedule: AlarmSchedule
  busy: boolean
  log: string[]
  setEnabled: (next: boolean) => void
  setTime: (hour: number, minute: number) => void
  toggleWeekday: (day: Weekday) => void
}

export function useAlarm(): UseAlarm {
  const [supported, setSupported] = useState(false)
  const [authorization, setAuthorization] =
    useState<AlarmAuthorizationState>('notDetermined')
  const [enabled, setEnabledState] = useState(false)
  const [schedule, setSchedule] = useState<AlarmSchedule>(DEFAULT_SCHEDULE)
  const [pending, setPending] = useState(0)
  const [log, setLog] = useState<string[]>([])

  // Mirror the pieces the queued tasks read, so a task that runs after several
  // taps still sees the latest values instead of the ones captured at tap time.
  const scheduleRef = useRef<AlarmSchedule>(DEFAULT_SCHEDULE)
  const enabledRef = useRef(false)
  const supportedRef = useRef(false)
  const authorizationRef = useRef<AlarmAuthorizationState>('notDetermined')

  const append = useCallback((message: string) => {
    setLog((entries) =>
      [`[${timestamp()}] ${message}`, ...entries].slice(0, MAX_LOG_ENTRIES),
    )
  }, [])

  // Every native call goes through one chain. Scheduling is cancel-then-create
  // under the hood, so two of them overlapping can leave the OS holding the
  // older schedule — running them one at a time is what keeps the toggle and
  // the actual alarm in agreement.
  const queue = useRef<Promise<void>>(Promise.resolve())

  const enqueue = useCallback(
    (label: string, task: () => Promise<void>) => {
      setPending((count) => count + 1)
      queue.current = queue.current
        // A failed task must not poison everything queued behind it.
        .catch(() => {})
        .then(task)
        .catch((error) => append(`${label} failed: ${describe(error)}`))
        .finally(() => setPending((count) => count - 1))
    },
    [append],
  )

  const rescheduleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearPendingReschedule = useCallback(() => {
    if (rescheduleTimer.current === null) return
    clearTimeout(rescheduleTimer.current)
    rescheduleTimer.current = null
  }, [])

  useEffect(() => clearPendingReschedule, [clearPendingReschedule])

  const applySchedule = useCallback((next: AlarmSchedule) => {
    scheduleRef.current = next
    setSchedule(next)
  }, [])

  const markEnabled = useCallback((next: boolean) => {
    enabledRef.current = next
    setEnabledState(next)
  }, [])

  const markAuthorization = useCallback((next: AlarmAuthorizationState) => {
    authorizationRef.current = next
    setAuthorization(next)
  }, [])

  // Read the truth out of the OS on mount: the alarm survives app restarts, and
  // the user can cancel it from the lock screen without the app knowing.
  useEffect(() => {
    enqueue('refresh', async () => {
      const available = await provider.isSupported()
      supportedRef.current = available
      setSupported(available)
      append(`provider: ${provider.name} · supported -> ${available}`)
      if (!available) {
        append('AlarmKit needs iOS 26 or newer — controls stay disabled')
        return
      }

      markAuthorization(await provider.getAuthorizationState())
      append(`authorization -> ${authorizationRef.current}`)

      const existing = await provider.getScheduled()
      if (existing) {
        applySchedule({
          ...existing,
          weekdays: sortWeekdays(existing.weekdays),
        })
        markEnabled(true)
        append('found an alarm already scheduled — adopted its time')
      } else {
        append('no alarm scheduled')
      }
    })
  }, [append, applySchedule, enqueue, markAuthorization, markEnabled])

  const setEnabled = useCallback(
    (next: boolean) => {
      if (!supportedRef.current) {
        append('ignored: AlarmKit is not supported on this device')
        return
      }

      // Flipping the switch settles the question now — a half-finished time
      // edit from a moment ago must not land on top of it.
      clearPendingReschedule()

      if (!next) {
        enqueue('cancel', async () => {
          await provider.cancel()
          markEnabled(false)
          append('alarm cancelled')
        })
        return
      }

      enqueue('enable', async () => {
        if (authorizationRef.current !== 'authorized') {
          markAuthorization(await provider.requestAuthorization())
          append(`authorization -> ${authorizationRef.current}`)
        }
        if (authorizationRef.current !== 'authorized') {
          // Leave the toggle off rather than showing an alarm that cannot ring.
          append('alarm permission not granted — enable it in iOS Settings')
          return
        }

        await provider.schedule(scheduleRef.current)
        markEnabled(true)
        append('alarm scheduled')
      })
    },
    [append, clearPendingReschedule, enqueue, markAuthorization, markEnabled],
  )

  // Editing while the alarm is on rewrites it in place; while it is off it only
  // moves the draft, so nothing is scheduled behind the user's back.
  const commit = useCallback(
    (next: AlarmSchedule) => {
      applySchedule(next)
      if (!enabledRef.current) return

      clearPendingReschedule()
      rescheduleTimer.current = setTimeout(() => {
        rescheduleTimer.current = null
        enqueue('reschedule', async () => {
          // The switch can be flipped off while the debounce is pending — an
          // alarm the user just cancelled must not come back to life.
          if (!enabledRef.current) return
          await provider.schedule(scheduleRef.current)
          append('alarm rescheduled')
        })
      }, RESCHEDULE_DEBOUNCE_MS)
    },
    [append, applySchedule, clearPendingReschedule, enqueue],
  )

  const setTime = useCallback(
    (hour: number, minute: number) => {
      const current = scheduleRef.current
      if (current.hour === hour && current.minute === minute) return
      commit({ ...current, hour, minute })
    },
    [commit],
  )

  const toggleWeekday = useCallback(
    (day: Weekday) => {
      const current = scheduleRef.current
      const next = current.weekdays.includes(day)
        ? current.weekdays.filter((candidate) => candidate !== day)
        : sortWeekdays([...current.weekdays, day])
      commit({ ...current, weekdays: next })
    },
    [commit],
  )

  return {
    supported,
    authorization,
    enabled,
    schedule,
    busy: pending > 0,
    log,
    setEnabled,
    setTime,
    toggleWeekday,
  }
}

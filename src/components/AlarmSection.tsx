import DateTimePicker from '@react-native-community/datetimepicker'
import { useMemo } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native'

import { provider, WEEKDAYS } from '../alarm'
import type { AlarmSchedule, Weekday } from '../alarm'
import { useAlarm } from '../hooks/useAlarm'

const WEEKDAY_LABELS: Readonly<Record<Weekday, string>> = {
  sunday: 'Sun',
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
}

const pad = (value: number): string => `${value}`.padStart(2, '0')

const formatTime = (schedule: AlarmSchedule): string =>
  `${pad(schedule.hour)}:${pad(schedule.minute)}`

/**
 * No days selected is a real, reachable state — AlarmKit reads it as "ring
 * once at the next occurrence" rather than "never", so the copy has to say so.
 */
const formatRepeat = (schedule: AlarmSchedule): string => {
  if (schedule.weekdays.length === 0) return 'Once, then stops'
  if (schedule.weekdays.length === WEEKDAYS.length) return 'Every day'
  return schedule.weekdays.map((day) => WEEKDAY_LABELS[day]).join(', ')
}

/**
 * The picker is controlled by hour+minute, but wants a whole `Date`. Today's
 * date carries it; only the time is ever read back out. Memoised so the value's
 * identity only changes when the time does, rather than on every render.
 */
const usePickerDate = (schedule: AlarmSchedule): Date =>
  useMemo(() => {
    const date = new Date()
    date.setHours(schedule.hour, schedule.minute, 0, 0)
    return date
  }, [schedule.hour, schedule.minute])

type ChipProps = {
  label: string
  selected: boolean
  onPress: () => void
  disabled: boolean
}

function Chip({ label, selected, onPress, disabled }: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        disabled && styles.chipDisabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
        {label}
      </Text>
    </Pressable>
  )
}

export function AlarmSection() {
  const {
    supported,
    authorization,
    enabled,
    schedule,
    busy,
    log,
    setEnabled,
    setTime,
    toggleWeekday,
  } = useAlarm()

  const pickerDate = usePickerDate(schedule)

  // The picker stays live while the alarm is off so the time can be set before
  // switching it on; only "unsupported" and in-flight work lock it.
  const locked = !supported || busy

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.sectionTitle}>Alarm</Text>
          <Text style={styles.meta}>
            provider: {provider.name} · {authorization}
          </Text>
        </View>
        {busy ? <ActivityIndicator /> : null}
        <Switch
          accessibilityLabel="Enable alarm"
          disabled={locked}
          onValueChange={setEnabled}
          value={enabled}
        />
      </View>

      {!supported ? (
        <Text style={styles.warning}>
          AlarmKit is unavailable here — it needs a real device on iOS 26 or
          newer.
        </Text>
      ) : null}

      <Text style={styles.time}>{formatTime(schedule)}</Text>
      <Text style={styles.repeat}>{formatRepeat(schedule)}</Text>

      {/*
        iOS renders the real UIDatePicker wheel inline. On web and Android the
        library renders null and logs a warning — the time text above stays the
        readout there, which is what keeps the Linux dev loop usable.

        TODO(mac): confirm the wheel actually shows at this height and is not
        clipped, and that `disabled` greys it out rather than being ignored.
        Neither can be checked from Linux, where it renders nothing at all.
      */}
      <DateTimePicker
        accessibilityLabel="Alarm time"
        disabled={locked}
        display="spinner"
        is24Hour
        mode="time"
        onValueChange={(_event, date) =>
          setTime(date.getHours(), date.getMinutes())
        }
        style={styles.picker}
        value={pickerDate}
      />

      <View style={styles.chipRow}>
        {WEEKDAYS.map((day) => (
          <Chip
            key={day}
            label={WEEKDAY_LABELS[day]}
            selected={schedule.weekdays.includes(day)}
            onPress={() => toggleWeekday(day)}
            disabled={locked}
          />
        ))}
      </View>

      {authorization === 'denied' ? (
        <Text style={styles.warning}>
          Alarm permission was denied. Turn it back on in iOS Settings →
          MNDBDY → Alarms.
        </Text>
      ) : null}

      <View style={styles.logBox}>
        {log.length === 0 ? (
          <Text style={styles.empty}>Nothing logged yet</Text>
        ) : (
          log.slice(0, 6).map((entry, index) => (
            <Text key={`${index}-${entry}`} style={styles.logLine}>
              {entry}
            </Text>
          ))
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  section: { backgroundColor: '#fff', borderRadius: 10, padding: 12, gap: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerText: { flex: 1, gap: 2 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#111' },
  meta: { fontSize: 11, color: '#999' },
  time: {
    fontSize: 44,
    fontWeight: '200',
    color: '#111',
    fontVariant: ['tabular-nums'],
  },
  repeat: { fontSize: 13, color: '#666' },
  // The iOS spinner has no intrinsic height, so one is given here. It collapses
  // to nothing where the library renders null.
  picker: { height: 180 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#d5d8dd',
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  chipSelected: { backgroundColor: '#0a58ca', borderColor: '#0a58ca' },
  chipDisabled: { opacity: 0.5 },
  chipLabel: { fontSize: 12, fontWeight: '600', color: '#444' },
  chipLabelSelected: { color: '#fff' },
  pressed: { opacity: 0.75 },
  warning: { fontSize: 12, color: '#a33' },
  logBox: { gap: 2 },
  empty: { fontSize: 13, color: '#999', fontStyle: 'italic' },
  logLine: { fontSize: 11, color: '#444', fontFamily: 'monospace' },
})

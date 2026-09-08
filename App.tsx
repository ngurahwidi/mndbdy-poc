import { StatusBar } from 'expo-status-bar'
import { useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

import { AlarmSection } from './src/components/AlarmSection'
import { provider } from './src/health'
import type { HealthSample } from './src/health'
import { useHealthData } from './src/hooks/useHealthData'

const average = (samples: readonly HealthSample[]): number | null => {
  if (samples.length === 0) return null
  const total = samples.reduce((sum, sample) => sum + sample.value, 0)
  return total / samples.length
}

const formatAverage = (samples: readonly HealthSample[]): string => {
  const value = average(samples)
  if (value === null) return '—'
  return `${Math.round(value)} ${samples[0].unit}`
}

const formatDuration = (totalMinutes: number): string => {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = Math.round(totalMinutes % 60)
  return `${hours}h ${minutes}m`
}

const formatTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

type ButtonProps = {
  label: string
  onPress: () => void
  disabled: boolean
}

function Button({ label, onPress, disabled }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.buttonPressed,
      ]}
    >
      <Text style={[styles.buttonLabel, disabled && styles.buttonLabelDisabled]}>
        {label}
      </Text>
    </Pressable>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  )
}

export default function App() {
  const {
    ready,
    loading,
    heartRate,
    hrv,
    sleep,
    steps,
    log,
    init,
    load,
    save,
    saveHeartRate,
  } = useHealthData()
  const [bpmInput, setBpmInput] = useState('')

  return (
    <View style={styles.root}>
      <StatusBar style="auto" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>MNDBDY PoC</Text>
          <Text style={styles.providerLine}>
            health provider:{' '}
            <Text style={styles.providerName}>{provider.name}</Text>
          </Text>
          <Text style={styles.status}>
            {ready ? 'initialized' : 'not initialized'}
            {loading ? ' · working…' : ''}
          </Text>
        </View>

        {/* Independent of the HealthKit flow below — it needs no init step. */}
        <AlarmSection />

        <View style={styles.buttonRow}>
          <Button
            label="1. Init & request permissions"
            onPress={() => void init()}
            disabled={loading}
          />
          <Button
            label="2. Load data"
            onPress={() => void load()}
            disabled={!ready || loading}
          />
          <Button
            label="3. Save test sleep sample"
            onPress={() => void save()}
            disabled={!ready || loading}
          />
        </View>

        <Section title="Save heart rate">
          <Text style={styles.fieldLabel}>Date & time</Text>
          <Text style={styles.fieldValue}>{new Date().toLocaleString()}</Text>
          <Text style={styles.fieldLabel}>BPM</Text>
          <TextInput
            style={styles.input}
            value={bpmInput}
            onChangeText={setBpmInput}
            placeholder="e.g. 72"
            keyboardType="number-pad"
            editable={ready && !loading}
          />
          <Button
            label="4. Save heart rate now"
            onPress={() => {
              void saveHeartRate(Number(bpmInput))
              setBpmInput('')
            }}
            disabled={!ready || loading || bpmInput.trim().length === 0}
          />
        </Section>

        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator />
            <Text style={styles.loadingText}>Loading…</Text>
          </View>
        ) : null}

        <View style={styles.cardRow}>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Avg heart rate</Text>
            <Text style={styles.cardValue}>{formatAverage(heartRate)}</Text>
            <Text style={styles.cardMeta}>{heartRate.length} samples</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Avg HRV</Text>
            <Text style={styles.cardValue}>{formatAverage(hrv)}</Text>
            <Text style={styles.cardMeta}>{hrv.length} samples</Text>
          </View>
        </View>

        <Section title="Sleep — last 7 days">
          {sleep.length === 0 ? (
            <Text style={styles.empty}>No data</Text>
          ) : (
            sleep.slice(0, 7).map((night) => (
              <View key={night.date} style={styles.row}>
                <Text style={styles.rowPrimary}>{night.date}</Text>
                <Text style={styles.rowValue}>
                  {formatDuration(night.totalMinutes)}
                </Text>
                <Text style={styles.rowSource}>{night.source}</Text>
              </View>
            ))
          )}
        </Section>

        <Section title="Steps — last 7 days">
          {steps.length === 0 ? (
            <Text style={styles.empty}>No data</Text>
          ) : (
            steps.slice(0, 7).map((day) => (
              <View key={day.date} style={styles.row}>
                <Text style={styles.rowPrimary}>{day.date}</Text>
                <Text style={styles.rowValue}>
                  {day.totalSteps.toLocaleString()} steps
                </Text>
                <Text style={styles.rowSource}>{day.source}</Text>
              </View>
            ))
          )}
        </Section>

        <Section title="Recent heart rate samples">
          {heartRate.length === 0 ? (
            <Text style={styles.empty}>No data</Text>
          ) : (
            heartRate.slice(0, 8).map((sample) => (
              <View
                key={`${sample.startDate}-${sample.value}`}
                style={styles.row}
              >
                <Text style={styles.rowPrimary}>
                  {formatTime(sample.endDate)}
                </Text>
                <Text style={styles.rowValue}>
                  {sample.value} {sample.unit}
                </Text>
                <Text style={styles.rowSource}>{sample.source}</Text>
              </View>
            ))
          )}
        </Section>

        <Section title="Log">
          {log.length === 0 ? (
            <Text style={styles.empty}>Nothing logged yet</Text>
          ) : (
            log.map((entry, index) => (
              <Text key={`${index}-${entry}`} style={styles.logLine}>
                {entry}
              </Text>
            ))
          )}
        </Section>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f5f5f7' },
  content: { padding: 16, paddingTop: 64, gap: 16, paddingBottom: 48 },
  header: { gap: 4 },
  title: { fontSize: 20, fontWeight: '700', color: '#111' },
  providerLine: { fontSize: 16, color: '#333' },
  providerName: { fontWeight: '700', color: '#0a58ca' },
  status: { fontSize: 13, color: '#666' },
  buttonRow: { gap: 8 },
  button: {
    backgroundColor: '#0a58ca',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  buttonPressed: { opacity: 0.75 },
  buttonDisabled: { backgroundColor: '#c9ccd1' },
  buttonLabel: { color: '#fff', fontWeight: '600', fontSize: 15 },
  buttonLabelDisabled: { color: '#7a7d82' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  loadingText: { color: '#666' },
  cardRow: { flexDirection: 'row', gap: 12 },
  card: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    gap: 2,
  },
  cardLabel: { fontSize: 12, color: '#666' },
  cardValue: { fontSize: 22, fontWeight: '700', color: '#111' },
  cardMeta: { fontSize: 11, color: '#999' },
  section: { backgroundColor: '#fff', borderRadius: 10, padding: 12, gap: 6 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#111' },
  fieldLabel: { fontSize: 12, color: '#666' },
  fieldValue: { fontSize: 14, color: '#111', marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#d0d2d6',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    fontSize: 15,
    color: '#111',
    marginBottom: 4,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowPrimary: { width: 96, fontSize: 13, color: '#111' },
  rowValue: { width: 110, fontSize: 13, fontWeight: '600', color: '#111' },
  rowSource: { flex: 1, fontSize: 12, color: '#666' },
  empty: { fontSize: 13, color: '#999', fontStyle: 'italic' },
  logLine: { fontSize: 11, color: '#444', fontFamily: 'monospace' },
})

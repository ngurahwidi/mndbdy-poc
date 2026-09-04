import { useCallback, useRef, useState } from "react";

import { provider } from "../health";
import type { HealthSample, SleepSummary, StepsSummary } from "../health";

const MAX_LOG_ENTRIES = 50;

const timestamp = (): string => new Date().toLocaleTimeString();

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export type UseHealthData = {
  ready: boolean;
  loading: boolean;
  heartRate: HealthSample[];
  hrv: HealthSample[];
  sleep: SleepSummary[];
  steps: StepsSummary[];
  log: string[];
  init: () => Promise<void>;
  load: () => Promise<void>;
  save: () => Promise<void>;
  saveHeartRate: (bpm: number) => Promise<void>;
};

export function useHealthData(): UseHealthData {
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [heartRate, setHeartRate] = useState<HealthSample[]>([]);
  const [hrv, setHrv] = useState<HealthSample[]>([]);
  const [sleep, setSleep] = useState<SleepSummary[]>([]);
  const [steps, setSteps] = useState<StepsSummary[]>([]);
  const [log, setLog] = useState<string[]>([]);

  // Mirrors `ready` so `load` can guard on it without becoming stale.
  const readyRef = useRef(false);

  const append = useCallback((message: string) => {
    setLog((entries) =>
      [`[${timestamp()}] ${message}`, ...entries].slice(0, MAX_LOG_ENTRIES),
    );
  }, []);

  const init = useCallback(async () => {
    setLoading(true);
    try {
      append(`provider: ${provider.name}`);

      const available = await provider.isAvailable();
      append(`isAvailable -> ${available}`);
      if (!available) {
        append("health data is not available on this device — stopping");
        return;
      }

      // Authorization must complete before any query runs. On iOS, querying
      // first crashes the app rather than throwing.
      await provider.requestPermissions();
      append("permissions requested");
      // iOS never reveals read-permission status, so this only means the
      // prompt was shown — not that access was granted.
      append("note: read access status is not observable on iOS");

      readyRef.current = true;
      setReady(true);
    } catch (error) {
      append(`init failed: ${describe(error)}`);
    } finally {
      setLoading(false);
    }
  }, [append]);

  const load = useCallback(async () => {
    if (!readyRef.current) {
      append("load refused: not initialized yet");
      return;
    }

    setLoading(true);
    try {
      append("loading heart rate, HRV, sleep and steps…");
      const [heartRateSamples, hrvSamples, sleepSummaries, stepsSummaries] =
        await Promise.all([
          provider.getHeartRate(50),
          provider.getHRV(50),
          provider.getSleep(7),
          provider.getSteps(7),
        ]);

      setHeartRate(heartRateSamples);
      setHrv(hrvSamples);
      setSleep(sleepSummaries);
      setSteps(stepsSummaries);

      append(
        `loaded: ${heartRateSamples.length} HR, ${hrvSamples.length} HRV, ` +
          `${sleepSummaries.length} nights, ${stepsSummaries.length} days of steps`,
      );
      if (heartRateSamples.length === 0 && hrvSamples.length === 0) {
        // Empty means "no data", never "denied" — see rule 4 in the README.
        append("no samples returned — no data available for these types");
      }
    } catch (error) {
      append(`load failed: ${describe(error)}`);
    } finally {
      setLoading(false);
    }
  }, [append]);

  const save = useCallback(async () => {
    if (!readyRef.current) {
      append("save refused: not initialized yet");
      return;
    }

    setLoading(true);
    try {
      append("saving test sleep sample…");
      await provider.saveTestSleepSample(5);
      append("saved 5-minute test sleep sample");
    } catch (error) {
      append(`save failed: ${describe(error)}`);
    } finally {
      setLoading(false);
    }
  }, [append]);

  const saveHeartRate = useCallback(
    async (bpm: number) => {
      if (!readyRef.current) {
        append("save refused: not initialized yet");
        return;
      }
      if (!Number.isFinite(bpm) || bpm <= 0) {
        append(`save refused: invalid BPM value "${bpm}"`);
        return;
      }

      setLoading(true);
      try {
        append(`saving heart rate sample (${bpm} bpm)…`);
        await provider.saveHeartRateSample(bpm);
        append(`saved heart rate sample: ${bpm} bpm`);
      } catch (error) {
        append(`save failed: ${describe(error)}`);
      } finally {
        setLoading(false);
      }
    },
    [append],
  );

  return {
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
  };
}

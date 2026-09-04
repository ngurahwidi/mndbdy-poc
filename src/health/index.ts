export type { HealthProvider, HealthSample, SleepSummary } from './types'
// Metro resolves this to `provider.ios.ts` on iOS and `provider.ts` everywhere
// else. Never add a file extension here, and never branch on Platform.OS.
export { provider } from './provider'

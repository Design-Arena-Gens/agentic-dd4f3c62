import dayjs from 'dayjs';
import type { Session, ConsumptionEvent } from './types';

const STORAGE_KEY = 'WEED_SESSIONS_V1';

export function loadSessions(): Session[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as Session[];
    if (parsed && Array.isArray(parsed.sessions)) return parsed.sessions as Session[];
    return [];
  } catch {
    return [];
  }
}

export function saveSessions(sessions: Session[]): void {
  const payload = { sessions, createdAt: Date.now(), version: 1 as const };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function generateId(): string {
  return 's_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function getTimeOfDay(date: Date): 'Morning' | 'Afternoon' | 'Evening' | 'Night' {
  const h = date.getHours();
  if (h >= 5 && h < 12) return 'Morning';
  if (h >= 12 && h < 17) return 'Afternoon';
  if (h >= 17 && h < 22) return 'Evening';
  return 'Night';
}

export function doseFromEvent(ev: ConsumptionEvent, sharers: number | undefined): number {
  const thcFrac = Math.max(0, Math.min(ev.thcPercent, 100)) / 100;
  const baseDose = ev.weightGrams * thcFrac; // grams of THC-equivalent
  const people = Math.max(1, sharers ?? 1);
  return baseDose / people;
}

export function computeTolerance(now: number, sessions: Session[]): number {
  // Exponential decay with half-life 48h
  const halfLifeHours = 48;
  const lambda = Math.log(2) / (halfLifeHours * 3600 * 1000);
  let score = 0;
  for (const s of sessions) {
    for (const ev of s.consumptions) {
      const elapsed = Math.max(0, now - ev.timestamp);
      const contribution = doseFromEvent(ev, s.social.numPeopleSharing) * Math.exp(-lambda * elapsed);
      score += contribution;
    }
  }
  // Scale to more readable range
  return Math.round(score * 1000) / 10; // e.g., 12.3
}

export function computeSessionDose(s: Session): number {
  return s.consumptions.reduce((acc, ev) => acc + doseFromEvent(ev, s.social.numPeopleSharing), 0);
}

export function intervalSincePrevious(sessions: Session[], index: number): number | undefined {
  if (index <= 0) return undefined;
  const curr = sessions[index];
  const prev = sessions[index - 1];
  if (!curr || !prev) return undefined;
  const t1 = curr.startTime;
  const t0 = prev.endTime ?? prev.startTime;
  return Math.max(0, t1 - t0);
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [] as string[];
  if (hours) parts.push(hours + 'h');
  if (minutes) parts.push(minutes + 'm');
  if (seconds && !hours) parts.push(seconds + 's');
  return parts.join(' ') || '0m';
}

export function byTimeAsc(a: Session, b: Session): number {
  return a.startTime - b.startTime;
}

export function downloadJSON(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function toLocalDateTimeInputValue(date: Date): string {
  return dayjs(date).format('YYYY-MM-DDTHH:mm');
}

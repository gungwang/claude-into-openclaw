import type { SessionEventJournal } from "./session-event-journal.js";

const activeJournals = new Map<string, SessionEventJournal>();
const MAX_JOURNAL_ENTRIES = 100;

export function registerSessionJournal(sessionKey: string, journal: SessionEventJournal): void {
  if (activeJournals.size >= MAX_JOURNAL_ENTRIES) {
    const oldest = activeJournals.keys().next().value;
    if (oldest) {
      activeJournals.delete(oldest);
    }
  }
  activeJournals.set(sessionKey, journal);
}

export function getSessionJournal(sessionKey: string): SessionEventJournal | undefined {
  return activeJournals.get(sessionKey);
}

export function removeSessionJournal(sessionKey: string): boolean {
  return activeJournals.delete(sessionKey);
}

export function clearAllSessionJournals(): void {
  activeJournals.clear();
}

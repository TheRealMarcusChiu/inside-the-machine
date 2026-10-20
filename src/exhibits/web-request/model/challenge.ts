import { buildJourney, type Conditions } from './journey';

export interface ChallengeResult {
  solved: boolean;
  hint: string;
}

export const CHALLENGES = [
  {
    id: 'one-round-trip',
    title: 'Fresh data in one round trip',
    prompt:
      'Get order 42 from the database — not from any cache — after only one network round trip between the browser and the server. There is more than one way.',
  },
  {
    id: 'db-bottleneck',
    title: 'When is the database the slow part?',
    prompt:
      'On a brand-new connection that still reaches the database, find conditions where the database accounts for more than half of the total time.',
  },
] as const;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function checkOneRoundTrip(c: Conditions): ChallengeResult {
  const j = buildJourney(c);
  if (!j.reachesDatabase) {
    return {
      solved: false,
      hint: j.reachesServer
        ? 'The service cache answered, so the database was never asked. The challenge needs data from the database.'
        : 'The browser answered from its own cache, so the database was never asked. The challenge needs data from the database.',
    };
  }
  if (j.roundTrips > 1) {
    return {
      solved: false,
      hint: `Still ${plural(j.roundTrips, 'round trip')} before the answer arrives. Which handshakes could be avoided?`,
    };
  }
  return { solved: true, hint: 'Solved — one round trip, and the answer came from the database.' };
}

export function checkDatabaseBottleneck(c: Conditions): ChallengeResult {
  const j = buildJourney(c);
  if (c.connection !== 'new') return { solved: false, hint: 'Start from a new connection: set Connection to “New”.' };
  if (!j.reachesDatabase) return { solved: false, hint: 'This request never reaches the database. Clear the caches.' };
  const db = j.active.find((s) => s.id === 'database')!;
  const share = Math.round((db.durationMs / j.totalMs) * 100);
  if (db.durationMs * 2 > j.totalMs) {
    return { solved: true, hint: `Solved — the database is ${share}% of the total. Now the network is the small part.` };
  }
  return { solved: false, hint: `The database is only ${share}% of the total so far. Compare the two sliders.` };
}

/**
 * Push notifications through the Expo Push Service (spec §1, §11). Tokens are stored by the
 * app on users/{uid}.pushToken (creators) and teams/{uid}.pushToken (participants). A refusal
 * or a missing token simply means no push: play never depends on one.
 */
import { everyoneFinished, plural } from '@qualk/shared';
import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const isExpoToken = (t: unknown): t is string =>
  typeof t === 'string' && /^Expo(nent)?PushToken\[.+\]$/.test(t);

/** Sends in chunks of 100 (the service's limit). Failures are logged, never thrown. */
export async function sendPush(messages: PushMessage[]): Promise<void> {
  const valid = messages.filter((m) => isExpoToken(m.to));
  if (valid.length === 0 || process.env.FUNCTIONS_EMULATOR === 'true') {
    if (valid.length > 0) logger.info('Push (emulator, not sent)', { messages: valid });
    return;
  }
  for (let i = 0; i < valid.length; i += 100) {
    const chunk = valid.slice(i, i + 100).map((m) => ({ ...m, sound: 'default' }));
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(chunk),
      });
      if (!res.ok) logger.warn('Expo push failed', { status: res.status, body: await res.text() });
    } catch (err) {
      logger.warn('Expo push failed', { err: String(err) });
    }
  }
}

async function teamTokens(db: Firestore, walkId: string) {
  const teams = await db.collection(`walks/${walkId}/teams`).get();
  return teams.docs.map((d) => d.data().pushToken).filter(isExpoToken);
}

async function ownerToken(db: Firestore, ownerUid: string): Promise<string | undefined> {
  const user = await db.doc(`users/${ownerUid}`).get();
  const token = user.data()?.pushToken;
  return isExpoToken(token) ? token : undefined;
}

/** onWalkStatusChanged: "Walk is open" and "Final results" to every joined team. */
export async function pushStatusChange(
  db: Firestore,
  walkId: string,
  before: string | undefined,
  after: FirebaseFirestore.DocumentData,
): Promise<void> {
  if (before === after.status) return;
  const tokens = await teamTokens(db, walkId);
  if (after.status === 'open') {
    await sendPush(
      tokens.map((to) => ({
        to,
        title: `${after.title} is open`,
        body: 'Head to the start and tap Start walk.',
        data: { walkId, kind: 'open' },
      })),
    );
  } else if (after.status === 'ended') {
    await sendPush(
      tokens.map((to) => ({
        to,
        title: 'Final results are in',
        body: `See how you did on ${after.title}.`,
        data: { walkId, kind: 'ended' },
      })),
    );
  }
}

/** onAlertCreated: "Fjord Kids: way to stop 4 is blocked". */
export async function pushBlockedAlert(
  db: Firestore,
  walkId: string,
  alert: FirebaseFirestore.DocumentData,
): Promise<void> {
  const walk = (await db.doc(`walks/${walkId}`).get()).data();
  if (!walk) return;
  const to = await ownerToken(db, walk.ownerUid);
  if (!to) return;
  const [team, stop] = await Promise.all([
    db.doc(`walks/${walkId}/teams/${alert.teamUid}`).get(),
    db.doc(`walks/${walkId}/stops/${alert.stopId}`).get(),
  ]);
  const stopNumber = (stop.data()?.order ?? 0) + 1;
  await sendPush([
    {
      to,
      title: `${team.data()?.name ?? 'A team'}: way to stop ${stopNumber} is blocked`,
      body: 'They have moved on. You can skip the stop for everyone.',
      data: { walkId, kind: 'blocked' },
    },
  ]);
}

/**
 * A team that leaves can be the last one still walking, so leaving runs the same check as an
 * answer (spec §4: a team that left no longer counts as "still walking").
 */
export function teamJustLeft(
  before: FirebaseFirestore.DocumentData | undefined,
  after: FirebaseFirestore.DocumentData | undefined,
): boolean {
  return before?.leftAt == null && after?.leftAt != null && after?.startedAt != null;
}

/**
 * After a team's totals change, or a team leaves: in a day walk, tell the creator once when
 * nobody is still walking; in a week-long walk, tell them about each team that finishes.
 */
export async function pushFinishNews(
  db: Firestore,
  walkId: string,
  teamUid: string,
  wasFinished: boolean,
): Promise<void> {
  const walkRef = db.doc(`walks/${walkId}`);
  const walk = (await walkRef.get()).data();
  if (!walk || walk.status !== 'open') return;
  const to = await ownerToken(db, walk.ownerUid);

  if (walk.openFor === 'week') {
    const team = (await walkRef.collection('teams').doc(teamUid).get()).data();
    if (!to || !team || wasFinished || !team.finishedAt) return;
    await sendPush([
      {
        to,
        title: `${team.name} finished: ${plural(team.score, 'point')}`,
        body: `${walk.title} stays open until you end it or the week is over.`,
        data: { walkId, kind: 'teamFinished' },
      },
    ]);
    return;
  }

  if (walk.allFinishedNotifiedAt) return;
  const teams = (await walkRef.collection('teams').get()).docs.map((d) => d.data());
  if (!everyoneFinished(teams)) return;
  await walkRef.update({ allFinishedNotifiedAt: FieldValue.serverTimestamp() });
  if (!to) return;
  await sendPush([
    {
      to,
      title: 'Everyone has finished',
      body: `End ${walk.title} to publish the results.`,
      data: { walkId, kind: 'allFinished' },
    },
  ]);
}

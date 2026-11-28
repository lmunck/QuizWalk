/** P4's Report question (spec §3 P4, §7): one questionReports document per person and question. */
import { questionReportId, type ReportReason } from '@qualk/shared';
import { doc, serverTimestamp, setDoc } from '@react-native-firebase/firestore';

import { reportError } from './errors';
import { db } from './firebase';

/**
 * Not awaited, like every player write: offline it is queued and sent later. The rules refuse a
 * second report from the same person; that counts as already reported, so it is not an error.
 */
export function reportQuestion(input: {
  uid: string;
  walkId: string;
  stopId: string;
  bankQuestionId?: string;
  reason: ReportReason;
}): void {
  const target = {
    walkId: input.walkId,
    stopId: input.stopId,
    ...(input.bankQuestionId ? { questionId: input.bankQuestionId } : {}),
  };
  setDoc(doc(db, 'questionReports', questionReportId(target, input.uid)), {
    uid: input.uid,
    reason: input.reason,
    createdAt: serverTimestamp(),
    ...target,
  }).catch((err: unknown) => {
    if ((err as { code?: string }).code !== 'firestore/permission-denied') {
      reportError('Could not send the report', err);
    }
  });
}

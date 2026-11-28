/**
 * Background tasks (m1-design §3). `TaskManager.defineTask` must run when the JavaScript starts,
 * also when the system wakes the app for a task with no screen showing, so this module is
 * imported first by the root layout and does nothing else.
 */
import * as TaskManager from 'expo-task-manager';

import { handlePocketTask, POCKET_TASK } from '@/location/pocket';

TaskManager.defineTask(POCKET_TASK, async ({ data, error }) => {
  handlePocketTask(data, error);
});

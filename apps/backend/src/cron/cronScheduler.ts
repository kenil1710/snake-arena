import cron, { type ScheduledTask } from 'node-cron';
import { createLogger } from '../lib/logger.js';
import type { TournamentFinalizer } from './tournamentFinalizer.js';
import type { HealthMonitor } from './healthMonitor.js';

/** Finalizer sweep: every minute (the contract tolerates late calls). */
export const FINALIZER_SCHEDULE = '* * * * *';
/** Health check: every 5 minutes. */
export const HEALTH_SCHEDULE = '*/5 * * * *';

export interface CronJobs {
  stop(): void;
}

export interface CronJobsDeps {
  finalizer: TournamentFinalizer;
  healthMonitor: HealthMonitor;
  /** Run both jobs once at startup (default true) to catch backlog immediately. */
  runOnStart?: boolean;
}

/**
 * Schedules the keeper jobs. Call the returned `stop()` on shutdown so a
 * draining process doesn't fire new chain transactions.
 */
export function startCronJobs(deps: CronJobsDeps): CronJobs {
  const logger = createLogger('cron/scheduler');

  // node-cron swallows nothing for us: every run is wrapped so a rejected
  // promise can never become an unhandled rejection that kills the process.
  const runFinalizer = async () => {
    try {
      await deps.finalizer.checkAndFinalizeAll();
    } catch (error) {
      logger.error('finalizer sweep failed', error);
    }
  };
  const runHealthCheck = async () => {
    try {
      await deps.healthMonitor.runHealthCheck();
    } catch (error) {
      logger.error('health check failed', error);
    }
  };

  const tasks: ScheduledTask[] = [
    cron.schedule(FINALIZER_SCHEDULE, () => void runFinalizer()),
    cron.schedule(HEALTH_SCHEDULE, () => void runHealthCheck()),
  ];
  logger.info('cron jobs scheduled', {
    finalizer: FINALIZER_SCHEDULE,
    health: HEALTH_SCHEDULE,
  });

  if (deps.runOnStart ?? true) {
    // After downtime a tournament may be long expired — sweep now, not in 60s.
    void runFinalizer();
    void runHealthCheck();
  }

  return {
    stop() {
      for (const task of tasks) task.stop();
      logger.info('cron jobs stopped');
    },
  };
}

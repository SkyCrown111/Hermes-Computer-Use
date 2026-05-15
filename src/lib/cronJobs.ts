import type { CronJob } from '../types/cron';

function isSameLocalDay(date: Date, startOfDay: Date, startOfNextDay: Date): boolean {
  return date >= startOfDay && date < startOfNextDay;
}

export function isTodayPendingCronJob(
  job: CronJob,
  startOfToday = new Date(new Date().setHours(0, 0, 0, 0)),
  startOfTomorrow = new Date(new Date(new Date().setHours(0, 0, 0, 0)).setDate(new Date().getDate() + 1)),
): boolean {
  if (!job.enabled) return false;

  const nextRunToday = job.next_run_at
    ? isSameLocalDay(new Date(job.next_run_at), startOfToday, startOfTomorrow)
    : false;
  const overdueByToday = job.next_run_at
    ? new Date(job.next_run_at) < startOfTomorrow
    : false;

  const createdToday = job.created_at
    ? isSameLocalDay(new Date(job.created_at), startOfToday, startOfTomorrow)
    : false;

  const hasNotRunYet = !job.last_run_at && (job.run_count ?? 0) === 0;
  const notRunToday = job.last_run_at
    ? new Date(job.last_run_at) < startOfToday
    : true;

  return nextRunToday || (createdToday && hasNotRunYet) || (overdueByToday && notRunToday);
}

export function getTodayPendingCronJobs(jobs: CronJob[], now = new Date()): CronJob[] {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

  return jobs.filter((job) => isTodayPendingCronJob(job, startOfToday, startOfTomorrow));
}

import { isCloudConfigured } from './cloud-client.js';
import { getUnpublishedDays } from '../db/daily-summaries.js';
import { brandText, dimText, streakText } from '../tui/theme.js';

export function showCatchupBanner(): void {
  if (!isCloudConfigured()) return;

  const unpublished = getUnpublishedDays();
  if (unpublished.length === 0) return;

  const count = unpublished.length;
  const label = count === 1 ? 'day' : 'days';

  console.log('  ' + streakText('\u2601') + '  You have ' + brandText(String(count)) + ` unpublished ${label}.`);
  console.log('  ' + dimText('Run') + ' ' + brandText('worktale publish') + ' ' + dimText('to sync to worktale.dev'));
  console.log('');
}

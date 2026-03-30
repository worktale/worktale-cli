import chalk from 'chalk';
import { closeDb } from '../db/index.js';
import { brandText, dimText, positiveText, streakText } from '../tui/theme.js';
import { isCloudConfigured, cloudFetch } from '../utils/cloud-client.js';

interface ProfileData {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  githubUrl: string | null;
  twitterUrl: string | null;
  websiteUrl: string | null;
  subscriptionTier: string;
  createdAt: string;
}

export async function profileCommand(action?: string, key?: string, value?: string): Promise<void> {
  try {
    if (!isCloudConfigured()) {
      console.log('');
      console.log('  ' + dimText('Profile management requires Worktale Cloud.'));
      console.log('  ' + dimText('Run') + ' ' + brandText('worktale cloud login') + ' ' + dimText('to connect.'));
      console.log('');
      closeDb();
      process.exit(0);
      return;
    }

    if (action === 'set' && key && value) {
      await setProfile(key, value);
    } else {
      await showProfile();
    }

    closeDb();
    process.exit(0);
  } catch (err: unknown) {
    console.error(chalk.red('  Error:'), err instanceof Error ? err.message : String(err));
    closeDb();
    process.exit(1);
  }
}

async function showProfile(): Promise<void> {
  const result = await cloudFetch<ProfileData>('/api/v1/profile');

  if (!result.data) {
    console.log('  ' + dimText('Could not load profile.'));
    return;
  }

  const p = result.data;

  console.log('');
  console.log('  ' + streakText('\u26A1') + ' ' + chalk.bold('Your Worktale Profile'));
  console.log('  ' + dimText('\u2500'.repeat(40)));
  console.log('  Username:     ' + brandText(`@${p.username}`));
  console.log('  Display Name: ' + (p.displayName || dimText('not set')));
  console.log('  Bio:          ' + (p.bio || dimText('not set')));
  console.log('  Plan:         ' + (p.subscriptionTier === 'pro' ? streakText('Pro') : dimText('Free')));
  console.log('');
  console.log('  ' + dimText('Links:'));
  if (p.githubUrl) console.log('    GitHub:   ' + dimText(p.githubUrl));
  if (p.twitterUrl) console.log('    Twitter:  ' + dimText(p.twitterUrl));
  if (p.websiteUrl) console.log('    Website:  ' + dimText(p.websiteUrl));
  console.log('');
  console.log('  Profile URL: ' + brandText(`https://worktale.dev/${p.username}`));
  console.log('');
  console.log('  ' + dimText('Update with:'));
  console.log('    ' + brandText('worktale profile set --bio "your bio"'));
  console.log('    ' + brandText('worktale profile set --display-name "Your Name"'));
  console.log('');
}

async function setProfile(key: string, value: string): Promise<void> {
  const fieldMap: Record<string, string> = {
    'bio': 'bio',
    '--bio': 'bio',
    'display-name': 'displayName',
    '--display-name': 'displayName',
    'github': 'githubUrl',
    '--github': 'githubUrl',
    'twitter': 'twitterUrl',
    '--twitter': 'twitterUrl',
    'website': 'websiteUrl',
    '--website': 'websiteUrl',
  };

  const field = fieldMap[key];
  if (!field) {
    console.log('');
    console.log('  ' + chalk.yellow('Unknown field: ' + key));
    console.log('  ' + dimText('Available: bio, display-name, github, twitter, website'));
    console.log('');
    return;
  }

  await cloudFetch('/api/v1/profile', {
    method: 'PATCH',
    body: { [field]: value },
  });

  console.log('');
  console.log('  ' + positiveText('\u2713') + '  Profile updated: ' + key + ' = ' + value);
  console.log('');
}

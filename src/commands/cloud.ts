import chalk from 'chalk';
import { loadConfig, saveConfig } from '../config/index.js';
import { closeDb } from '../db/index.js';
import { brandText, dimText, positiveText, streakText } from '../tui/theme.js';
import { getCloudApiUrl, getCloudToken, isCloudConfigured } from '../utils/cloud-client.js';

async function openBrowser(url: string): Promise<void> {
  const { exec } = await import('node:child_process');
  const platform = process.platform;
  const cmd = platform === 'win32' ? 'start' : platform === 'darwin' ? 'open' : 'xdg-open';
  exec(`${cmd} ${url}`);
}

export async function cloudCommand(action?: string): Promise<void> {
  try {
    switch (action) {
      case 'signup':
        await signupAction();
        break;
      case 'login':
        await loginAction();
        break;
      case 'logout':
        await logoutAction();
        break;
      case 'status':
        await statusAction();
        break;
      default:
        console.log('');
        console.log('  ' + brandText('Worktale Cloud'));
        console.log('');
        console.log('  ' + dimText('Commands:'));
        console.log('    worktale cloud signup    ' + dimText('Create an account'));
        console.log('    worktale cloud login     ' + dimText('Sign in (device-code flow)'));
        console.log('    worktale cloud logout    ' + dimText('Sign out'));
        console.log('    worktale cloud status    ' + dimText('Show account status'));
        console.log('');
        break;
    }
    closeDb();
    process.exit(0);
  } catch (err: unknown) {
    console.error(chalk.red('  Error:'), err instanceof Error ? err.message : String(err));
    closeDb();
    process.exit(1);
  }
}

async function signupAction(): Promise<void> {
  const webUrl = process.env.WEB_URL || 'https://worktale.dev';
  console.log('');
  console.log('  ' + brandText('Opening Worktale Cloud signup...'));
  console.log('  ' + dimText(webUrl + '/Login'));
  console.log('');
  console.log('  ' + dimText('After signing up, run:'));
  console.log('    ' + brandText('worktale cloud login'));
  console.log('');
  await openBrowser(`${webUrl}/Login`);
}

async function loginAction(): Promise<void> {
  const apiUrl = getCloudApiUrl();
  const webUrl = process.env.WEB_URL || 'https://worktale.dev';

  console.log('');
  console.log('  ' + brandText('Worktale Cloud Login'));
  console.log('  ' + dimText('Requesting device code...'));

  // Request device code
  const response = await fetch(`${apiUrl}/api/v1/auth/device-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error('Failed to request device code');
  }

  const result = (await response.json()) as {
    success: boolean;
    data: { deviceCode: string; userCode: string; verificationUrl: string; expiresIn: number };
  };

  const { deviceCode, userCode, verificationUrl } = result.data;

  console.log('');
  console.log('  ' + streakText('\u26A1') + '  Open this URL in your browser:');
  console.log('    ' + brandText(verificationUrl));
  console.log('');
  console.log('  ' + dimText('Your code:') + '  ' + chalk.bold.white(userCode));
  console.log('');
  console.log('  ' + dimText('Waiting for confirmation...'));

  await openBrowser(verificationUrl);

  // Poll for confirmation
  const maxAttempts = 60; // 15 minutes at 15s intervals
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, 15000));

    const pollResponse = await fetch(`${apiUrl}/api/v1/auth/device-poll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceCode }),
    });

    if (!pollResponse.ok) continue;

    const pollResult = (await pollResponse.json()) as {
      success: boolean;
      data: { confirmed: boolean; token?: string };
    };

    if (pollResult.data.confirmed && pollResult.data.token) {
      // Save token to config
      const config = loadConfig();
      (config as any).cloudEnabled = true;
      (config as any).cloudToken = pollResult.data.token;
      saveConfig(config);

      console.log('');
      console.log('  ' + positiveText('\u2713') + '  ' + chalk.bold('Logged in to Worktale Cloud!'));
      console.log('');
      console.log('  ' + dimText('Your token has been saved. You can now use:'));
      console.log('    ' + brandText('worktale publish') + '    ' + dimText('Sync today\'s digest'));
      console.log('    ' + brandText('worktale standup') + '    ' + dimText('Generate standup'));
      console.log('    ' + brandText('worktale profile') + '    ' + dimText('View your profile'));
      console.log('');
      return;
    }

    process.stdout.write('.');
  }

  console.log('');
  console.log(chalk.yellow('  Timed out waiting for confirmation. Try again.'));
}

async function logoutAction(): Promise<void> {
  const config = loadConfig();
  (config as any).cloudEnabled = false;
  (config as any).cloudToken = null;
  saveConfig(config);

  console.log('');
  console.log('  ' + positiveText('\u2713') + '  Logged out of Worktale Cloud.');
  console.log('');
}

async function statusAction(): Promise<void> {
  console.log('');

  if (!isCloudConfigured()) {
    console.log('  ' + dimText('Not logged in to Worktale Cloud.'));
    console.log('  ' + dimText('Run') + ' ' + brandText('worktale cloud login') + ' ' + dimText('to connect.'));
    console.log('');
    return;
  }

  try {
    const apiUrl = getCloudApiUrl();
    const token = getCloudToken();

    const response = await fetch(`${apiUrl}/api/v1/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      console.log('  ' + chalk.yellow('Token invalid or expired.'));
      console.log('  ' + dimText('Run') + ' ' + brandText('worktale cloud login') + ' ' + dimText('to re-authenticate.'));
      console.log('');
      return;
    }

    const result = (await response.json()) as {
      data: {
        username: string;
        email: string;
        subscriptionTier: string;
      };
    };

    const { username, email, subscriptionTier } = result.data;

    console.log('  ' + brandText('Worktale Cloud') + '  ' + positiveText('Connected'));
    console.log('');
    console.log('  User:         ' + chalk.bold(username));
    console.log('  Email:        ' + dimText(email));
    console.log('  Plan:         ' + (subscriptionTier === 'pro' ? streakText('Pro') : dimText('Free')));
    console.log('  Profile:      ' + brandText(`https://worktale.dev/${username}`));
    console.log('');
  } catch {
    console.log('  ' + chalk.yellow('Could not reach Worktale Cloud.'));
    console.log('');
  }
}

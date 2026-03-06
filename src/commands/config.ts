import chalk from 'chalk';
import { loadConfig, getConfigValue, setConfigValue, getConfigPath } from '../config/index.js';
import { brandText, dimText, streakText } from '../tui/theme.js';
import { closeDb } from '../db/index.js';

function parseValue(raw: string): unknown {
  // Boolean
  if (raw === 'true') return true;
  if (raw === 'false') return false;

  // Null
  if (raw === 'null') return null;

  // Number
  const num = Number(raw);
  if (!Number.isNaN(num) && raw.trim() !== '') return num;

  // String (strip surrounding quotes if present)
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1);
  }

  return raw;
}

function prettyPrint(obj: unknown, indent: number = 2): void {
  const pad = ' '.repeat(indent);
  if (obj === null || obj === undefined) {
    console.log(pad + dimText('null'));
    return;
  }
  if (typeof obj !== 'object') {
    console.log(pad + String(obj));
    return;
  }

  const entries = Object.entries(obj as Record<string, unknown>);
  for (const [key, value] of entries) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      console.log(pad + brandText(key) + ':');
      prettyPrint(value, indent + 2);
    } else if (Array.isArray(value)) {
      console.log(pad + brandText(key) + ': ' + dimText(JSON.stringify(value)));
    } else if (value === null) {
      console.log(pad + brandText(key) + ': ' + dimText('null'));
    } else if (typeof value === 'boolean') {
      console.log(pad + brandText(key) + ': ' + (value ? chalk.green('true') : chalk.red('false')));
    } else {
      console.log(pad + brandText(key) + ': ' + String(value));
    }
  }
}

export async function configCommand(action?: string, key?: string, value?: string): Promise<void> {
  try {
    // No args: show full config
    if (!action) {
      const config = loadConfig();
      console.log('');
      console.log('  ' + streakText('\u26A1') + ' ' + chalk.bold('WORKTALE CONFIG'));
      console.log('');
      prettyPrint(config, 2);
      console.log('');
      console.log('  ' + dimText('Config path: ' + getConfigPath()));
      console.log('');
      closeDb();
      process.exit(0);
      return;
    }

    // worktale config path
    if (action === 'path') {
      console.log(getConfigPath());
      closeDb();
      process.exit(0);
      return;
    }

    // worktale config get <key>
    if (action === 'get') {
      if (!key) {
        console.log(chalk.red('  Usage: worktale config get <key>'));
        console.log('  Example: worktale config get ai.provider');
        closeDb();
        process.exit(1);
        return;
      }

      const val = getConfigValue(key);

      if (val === undefined) {
        console.log(dimText('  (not set)'));
      } else if (typeof val === 'object' && val !== null) {
        prettyPrint(val, 2);
      } else {
        console.log(String(val));
      }

      closeDb();
      process.exit(0);
      return;
    }

    // worktale config set <key> <value>
    if (action === 'set') {
      if (!key || value === undefined) {
        console.log(chalk.red('  Usage: worktale config set <key> <value>'));
        console.log('  Example: worktale config set ai.provider ollama');
        closeDb();
        process.exit(1);
        return;
      }

      const parsed = parseValue(value);
      setConfigValue(key, parsed);
      console.log('  ' + chalk.green('\u2713') + '  ' + brandText(key) + ' = ' + String(parsed));

      closeDb();
      process.exit(0);
      return;
    }

    // Unknown action
    console.log(chalk.red('  Unknown config action: ' + action));
    console.log('');
    console.log('  Usage:');
    console.log('    worktale config           ' + dimText('Show all config'));
    console.log('    worktale config get <key>  ' + dimText('Get a value'));
    console.log('    worktale config set <k> <v>' + dimText(' Set a value'));
    console.log('    worktale config path       ' + dimText('Show config file path'));
    console.log('');
    closeDb();
    process.exit(1);
  } catch (err: unknown) {
    console.error(chalk.red('  Error:'), err instanceof Error ? err.message : String(err));
    closeDb();
    process.exit(1);
  }
}

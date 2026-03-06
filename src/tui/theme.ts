import chalk from 'chalk';

export const colors = {
  brand: '#4ADE80',
  positive: '#4ADE80',
  negative: '#FB7185',
  streak: '#FBBF24',
  dim: '#374151',
  textPrimary: '#F9FAFB',
  textSecondary: '#9CA3AF',
  heatNone: '#374151',
  heatLight: '#64748B',
  heatModerate: '#4ADE80',
  heatHeavy: '#4ADE80',
} as const;

export function brandText(text: string): string {
  return chalk.hex(colors.brand)(text);
}

export function positiveText(text: string): string {
  return chalk.hex(colors.positive)(text);
}

export function negativeText(text: string): string {
  return chalk.hex(colors.negative)(text);
}

export function streakText(text: string): string {
  return chalk.hex(colors.streak)(text);
}

export function dimText(text: string): string {
  return chalk.hex(colors.dim)(text);
}

export function primaryText(text: string): string {
  return chalk.hex(colors.textPrimary)(text);
}

export function secondaryText(text: string): string {
  return chalk.hex(colors.textSecondary)(text);
}

export function heatChar(level: 0 | 1 | 2 | 3): string {
  switch (level) {
    case 0:
      return chalk.hex(colors.heatNone)('\u2591');
    case 1:
      return chalk.hex(colors.heatLight)('\u2592');
    case 2:
      return chalk.hex(colors.heatModerate)('\u2593');
    case 3:
      return chalk.bold.hex(colors.heatHeavy)('\u2588');
  }
}

export function banner(): string {
  const top    = chalk.hex(colors.brand)('  \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557');
  const mid1   = chalk.hex(colors.brand)('  \u2551') + '  ' + chalk.hex(colors.streak)('\u26A1') + '  ' + chalk.bold.hex(colors.brand)('W O R K T A L E') + ' '.repeat(33) + chalk.hex(colors.brand)('\u2551');
  const mid2   = chalk.hex(colors.brand)('  \u2551') + '     ' + chalk.hex(colors.textSecondary)('Your dev story starts here.') + ' '.repeat(22) + chalk.hex(colors.brand)('\u2551');
  const bottom = chalk.hex(colors.brand)('  \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D');

  return `${top}\n${mid1}\n${mid2}\n${bottom}`;
}

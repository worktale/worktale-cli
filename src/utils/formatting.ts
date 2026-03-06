export function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function formatDateShort(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);

  if (diffMinutes < 1) {
    return 'just now';
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (remaining === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${remaining}m`;
}

export function formatLines(added: number, removed: number): string {
  return `+${formatNumber(added)} / -${formatNumber(removed)}`;
}

export function daysAgo(date: string | Date): number {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();

  const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const diffMs = startOfToday.getTime() - startOfDay.getTime();
  return Math.floor(diffMs / (24 * 60 * 60 * 1000));
}

export function getDateString(date?: Date): string {
  const d = date ?? new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getWeekDates(): string[] {
  const now = new Date();
  const dayOfWeek = now.getDay();
  // Monday = 1, Sunday = 0 -> shift so Monday is start
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset);
  const dates: string[] = [];

  for (let i = 0; i < 5; i++) {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    dates.push(getDateString(d));
  }

  return dates;
}

export function getMonthDates(year: number, month: number): string[] {
  const dates: string[] = [];
  // month is 1-based (1 = January)
  const daysInMonth = new Date(year, month, 0).getDate();

  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month - 1, day);
    dates.push(getDateString(d));
  }

  return dates;
}

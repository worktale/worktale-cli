import { loadConfig } from '../config/index.js';

const DEFAULT_API_URL = 'https://api.worktale.dev';

export interface CloudResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: string[];
}

export interface PagedCloudResponse<T> {
  success: boolean;
  data: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export function getCloudApiUrl(): string {
  const config = loadConfig();
  return (config as any).cloudApiUrl || DEFAULT_API_URL;
}

export function getCloudToken(): string | null {
  const config = loadConfig();
  return (config as any).cloudToken || null;
}

export function isCloudConfigured(): boolean {
  return !!getCloudToken();
}

export async function cloudFetch<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    token?: string;
  } = {},
): Promise<CloudResponse<T>> {
  const apiUrl = getCloudApiUrl();
  const token = options.token || getCloudToken();

  if (!token) {
    throw new Error('Not logged in to Worktale Cloud. Run: worktale cloud login');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  const response = await fetch(`${apiUrl}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(
      (errorBody as any)?.message || (errorBody as any)?.error || `API error: ${response.status}`,
    );
  }

  return (await response.json()) as CloudResponse<T>;
}

export async function cloudFetchPaged<T>(
  path: string,
  page = 1,
  pageSize = 20,
): Promise<PagedCloudResponse<T>> {
  const apiUrl = getCloudApiUrl();
  const token = getCloudToken();

  if (!token) {
    throw new Error('Not logged in to Worktale Cloud. Run: worktale cloud login');
  }

  const separator = path.includes('?') ? '&' : '?';
  const url = `${apiUrl}${path}${separator}page=${page}&pageSize=${pageSize}`;

  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(
      (errorBody as any)?.message || `API error: ${response.status}`,
    );
  }

  return (await response.json()) as PagedCloudResponse<T>;
}

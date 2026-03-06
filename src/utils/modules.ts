export function classifyFilePath(filePath: string): string {
  // Normalize to forward slashes
  const normalized = filePath.replace(/\\/g, '/');
  const segments = normalized.split('/').filter((s) => s.length > 0);

  if (segments.length <= 1) {
    return 'root';
  }

  if (segments[0] === 'src' && segments.length >= 2) {
    return `${segments[0]}/${segments[1]}`;
  }

  return segments[0];
}

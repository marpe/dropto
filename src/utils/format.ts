export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) {
    return '0 B';
  }
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export function formatSpeed(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`;
}

/** A rough, calm age: "10 s", "3 min", "2 h"; finer steps would only make the text flicker. */
export function formatElapsed(fromMs: number, nowMs: number): string {
  const seconds = Math.max(Math.floor((nowMs - fromMs) / 1000), 0);
  if (seconds < 60) {
    return `${seconds} s`;
  }
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)} min`;
  }
  return `${Math.floor(seconds / 3600)} h`;
}

export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0 || !isFinite(seconds)) {
    return '--';
  }
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}h ${mins}m ${secs}s`;
  }
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

/** A file's last-modified time, as short as it can be: the time today, the date otherwise (year only when not this year). */
export function formatModified(timestampMs: number | undefined, nowMs: number = Date.now(), locale?: string): string {
  if (timestampMs === undefined || !isFinite(timestampMs)) {
    return '';
  }
  const date = new Date(timestampMs);
  const now = new Date(nowMs);
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  }
  const isThisYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(locale, { day: 'numeric', month: 'short', ...(!isThisYear && { year: 'numeric' }) });
}

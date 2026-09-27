export type FileKind =
  | 'image'
  | 'video'
  | 'audio'
  | 'archive'
  | 'pdf'
  | 'document'
  | 'spreadsheet'
  | 'presentation'
  | 'code'
  | 'data'
  | 'text'
  | 'font'
  | 'executable'
  | 'key'
  | 'other';

const EXTENSIONS: Record<Exclude<FileKind, 'other'>, string[]> = {
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'svg', 'ico', 'heic', 'heif', 'tif', 'tiff', 'raw', 'psd'],
  video: ['mp4', 'mkv', 'mov', 'avi', 'webm', 'm4v', 'wmv', 'flv', 'mpg', 'mpeg', '3gp'],
  audio: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'opus', 'm4a', 'wma', 'aiff', 'mid', 'midi'],
  archive: ['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'zst', 'iso', 'dmg'],
  pdf: ['pdf'],
  document: ['doc', 'docx', 'odt', 'rtf', 'pages', 'epub'],
  spreadsheet: ['xls', 'xlsx', 'ods', 'csv', 'tsv', 'numbers'],
  presentation: ['ppt', 'pptx', 'odp'],
  code: [
    'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift', 'c', 'h', 'cpp', 'hpp',
    'cs', 'php', 'html', 'css', 'scss', 'vue', 'svelte', 'sql', 'lua', 'dart',
  ],
  data: ['json', 'yaml', 'yml', 'toml', 'xml', 'ini', 'env', 'lock'],
  text: ['txt', 'md', 'markdown', 'log', 'rst'],
  font: ['ttf', 'otf', 'woff', 'woff2'],
  executable: ['exe', 'msi', 'app', 'apk', 'deb', 'rpm', 'sh', 'bat', 'cmd', 'ps1', 'bin'],
  key: ['pem', 'key', 'crt', 'cer', 'p12', 'pfx', 'pub', 'gpg', 'asc'],
};

const KIND_BY_EXTENSION = new Map<string, FileKind>(
  (Object.entries(EXTENSIONS) as [FileKind, string[]][]).flatMap(([kind, extensions]) =>
    extensions.map((extension) => [extension, kind] as const)
  )
);

const KIND_BY_MIME_PREFIX: [string, FileKind][] = [
  ['image/', 'image'],
  ['video/', 'video'],
  ['audio/', 'audio'],
  ['font/', 'font'],
  ['text/', 'text'],
];

/** Classifies a file for its icon; the extension wins because shared files often arrive as octet-stream. */
export function getFileKind(name: string, mimeType: string): FileKind {
  const dotIndex = name.lastIndexOf('.');
  const extension = dotIndex > 0 ? name.slice(dotIndex + 1).toLowerCase() : '';
  const byExtension = KIND_BY_EXTENSION.get(extension);
  if (byExtension) {
    return byExtension;
  }
  if (mimeType === 'application/pdf') {
    return 'pdf';
  }
  return KIND_BY_MIME_PREFIX.find(([prefix]) => mimeType.startsWith(prefix))?.[1] ?? 'other';
}

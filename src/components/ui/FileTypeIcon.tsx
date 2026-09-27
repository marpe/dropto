import React from 'react';
import {
  File,
  FileArchive,
  FileBraces,
  FileCode,
  FileHeadphone,
  FileImage,
  FileKey,
  FilePenLine,
  FileSpreadsheet,
  FileTerminal,
  FileText,
  FileType,
  FileVideoCamera,
  Presentation,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { getFileKind } from '../../utils/fileKind';
import type { FileKind } from '../../utils/fileKind';
import { cn } from '../../utils/cn';

// Glyph from lucide, accent from Catppuccin (Latte in light mode, Mocha in dark)
const KIND_STYLES: Record<FileKind, { Icon: LucideIcon; colorClass: string }> = {
  image: { Icon: FileImage, colorClass: 'text-ctp-mauve' },
  video: { Icon: FileVideoCamera, colorClass: 'text-ctp-red' },
  audio: { Icon: FileHeadphone, colorClass: 'text-ctp-pink' },
  archive: { Icon: FileArchive, colorClass: 'text-ctp-yellow' },
  pdf: { Icon: FileText, colorClass: 'text-ctp-maroon' },
  document: { Icon: FilePenLine, colorClass: 'text-ctp-blue' },
  spreadsheet: { Icon: FileSpreadsheet, colorClass: 'text-ctp-green' },
  presentation: { Icon: Presentation, colorClass: 'text-ctp-peach' },
  code: { Icon: FileCode, colorClass: 'text-ctp-sapphire' },
  data: { Icon: FileBraces, colorClass: 'text-ctp-teal' },
  text: { Icon: FileText, colorClass: 'text-ctp-lavender' },
  font: { Icon: FileType, colorClass: 'text-ctp-flamingo' },
  executable: { Icon: FileTerminal, colorClass: 'text-ctp-sky' },
  key: { Icon: FileKey, colorClass: 'text-ctp-flamingo' },
  other: { Icon: File, colorClass: 'text-ctp-overlay1' },
};

interface FileTypeIconProps {
  name: string;
  mimeType: string;
  className?: string;
}

export const FileTypeIcon: React.FC<FileTypeIconProps> = ({ name, mimeType, className }) => {
  const kind = getFileKind(name, mimeType);
  const { Icon, colorClass } = KIND_STYLES[kind];
  return <Icon data-file-kind={kind} className={cn('w-4 h-4 shrink-0', colorClass, className)} />;
};

import React, { createContext, useContext, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { FileTypeIcon } from './ui/FileTypeIcon';
import { FileProgressCell } from './FileProgressCell';
import type { ManifestFile } from '../types/transfer';
import type { FileProgress } from '../utils/transferProgress';
import { formatBytes, formatModified } from '../utils/format';
import { displayPath } from '../utils/filePath';
import { cn } from '../utils/cn';

type SortKey = 'name' | 'size' | 'modified';

interface Sort {
  key: SortKey;
  direction: 'asc' | 'desc';
}

const COMPARE: Record<SortKey, (a: ManifestFile, b: ManifestFile) => number> = {
  name: (a, b) => displayPath(a).localeCompare(displayPath(b), undefined, { numeric: true, sensitivity: 'base' }),
  size: (a, b) => a.size - b.size,
  modified: (a, b) => (a.lastModified ?? 0) - (b.lastModified ?? 0),
};

interface IndexedFile<F> {
  file: F;
  index: number;
}

/** Display order only: files keep their index, and are still sent in the order they were added. */
function sortFiles<F extends ManifestFile>(files: readonly F[], sort: Sort | null): IndexedFile<F>[] {
  const indexed = files.map((file, index) => ({ file, index }));
  if (!sort) {
    return indexed;
  }
  const sign = sort.direction === 'asc' ? 1 : -1;
  return indexed.sort((a, b) => sign * COMPARE[sort.key](a.file, b.file));
}

/** Ascending, then descending, then back to the order the files were added. */
function nextSort(current: Sort | null, key: SortKey): Sort | null {
  if (current?.key !== key) {
    return { key, direction: 'asc' };
  }
  return current.direction === 'asc' ? { key, direction: 'desc' } : null;
}

interface Columns {
  hasLead: boolean;
  trailClassName?: string;
}

// Header and rows render the same fixed-width cells, so the columns line up; "Modified" only when the table is wide enough
const ColumnsContext = createContext<Columns>({ hasLead: false });

const CELL = {
  lead: 'flex shrink-0 w-4',
  name: 'flex-1 min-w-0 truncate',
  size: 'shrink-0 w-18 text-right tabular-nums',
  modified: 'hidden @md:block shrink-0 w-26 text-right tabular-nums',
  trail: 'flex shrink-0 items-center justify-end gap-3',
};

const ROW = 'flex items-center gap-3 px-2';

interface SortHeaderProps {
  label: string;
  sortKey: SortKey;
  sort: Sort | null;
  onSort: (key: SortKey) => void;
  className?: string;
}

const SortHeader: React.FC<SortHeaderProps> = ({ label, sortKey, sort, onSort, className }) => {
  const direction = sort?.key === sortKey ? sort.direction : null;
  const Arrow = direction === 'desc' ? ArrowDown : ArrowUp;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={cn(
        'inline-flex items-center gap-1 uppercase tracking-wider hover:text-text-2 transition-colors',
        direction && 'text-text-3',
        className
      )}
    >
      {label}
      <Arrow className={cn('w-3 h-3', !direction && 'invisible')} />
    </button>
  );
};

interface FileTableRowProps extends React.LiHTMLAttributes<HTMLLIElement> {
  file: ManifestFile;
  /** Before the icon, e.g. a checkbox; the table needs `hasLead` */
  lead?: React.ReactNode;
  /** After the sizes, e.g. a remove button; the table needs `trailClassName` (`FILE_PROGRESS_COLUMN` for `progress`) */
  trail?: React.ReactNode;
  /** The file's place in a download, shown after the sizes unless `trail` is given */
  progress?: FileProgress | null;
  /** The whole row is a label, so clicking anywhere toggles the checkbox in `lead` */
  isLabel?: boolean;
}

export const FileTableRow: React.FC<FileTableRowProps> = ({
  file,
  lead,
  trail,
  progress,
  isLabel = false,
  className,
  ...liProps
}) => {
  const { hasLead, trailClassName } = useContext(ColumnsContext);
  const Row = isLabel ? 'label' : 'div';
  return (
    <li
      data-testid="file-row"
      data-status={progress?.status}
      {...liProps}
      className={cn(
        'rounded-md text-sm sm:text-xs hover:bg-surface-2 transition-[background-color,opacity,transform] duration-300 starting:opacity-0 starting:translate-y-1 [content-visibility:auto] [contain-intrinsic-size:auto_2rem]',
        progress?.status === 'active' && 'bg-brand-500/5',
        className
      )}
    >
      <Row className={cn(ROW, 'py-2.5 sm:py-1', isLabel && 'cursor-pointer')}>
        {hasLead && <span className={CELL.lead}>{lead}</span>}
        <FileTypeIcon name={file.name} mimeType={file.type} />
        <span
          className={cn(CELL.name, 'font-semibold', progress?.status === 'corrupted' ? 'text-text-warning-1' : 'text-text-2')}
          title={displayPath(file)}
        >
          {displayPath(file)}
        </span>
        <span className={cn(CELL.size, 'text-text-4')}>{formatBytes(file.size)}</span>
        <span data-testid="file-modified" className={cn(CELL.modified, 'text-text-5')}>
          {formatModified(file.lastModified)}
        </span>
        {trailClassName !== undefined && (
          <span className={cn(CELL.trail, trailClassName)}>
            {trail ?? (progress && <FileProgressCell progress={progress} />)}
          </span>
        )}
      </Row>
    </li>
  );
};

interface FileTableProps<F extends ManifestFile> {
  files: readonly F[];
  /** A column before the icon, for each row's `lead` */
  hasLead?: boolean;
  /** Width of a column after the sizes, for each row's `trail`; none when omitted */
  trailClassName?: string;
  /** A `FileTableRow`, keyed; `index` is the file's position in `files`, whatever order it is shown in */
  renderRow: (file: F, index: number) => React.ReactNode;
  className?: string;
}

/** A file list with sortable Name, Size and Modified columns, and optional columns before and after them. */
export function FileTable<F extends ManifestFile>({
  files,
  renderRow,
  hasLead = false,
  trailClassName,
  className,
}: FileTableProps<F>) {
  const [sort, setSort] = useState<Sort | null>(null);
  const onSort = (key: SortKey) => setSort((current) => nextSort(current, key));

  return (
    <ColumnsContext.Provider value={{ hasLead, trailClassName }}>
      <div className={cn('@container', className)}>
        <div className={cn(ROW, 'pb-1 border-b border-border-1 text-2xs font-semibold text-text-5')}>
          {hasLead && <span className={CELL.lead} />}
          <span className="w-4 shrink-0" />
          <SortHeader label="Name" sortKey="name" sort={sort} onSort={onSort} className={CELL.name} />
          <SortHeader label="Size" sortKey="size" sort={sort} onSort={onSort} className={cn(CELL.size, 'justify-end')} />
          <SortHeader
            label="Modified"
            sortKey="modified"
            sort={sort}
            onSort={onSort}
            className={cn(CELL.modified, '@md:inline-flex justify-end')}
          />
          {trailClassName !== undefined && <span className={cn(CELL.trail, trailClassName)} />}
        </div>
        <ul className="scroll-fade max-h-80 overflow-y-auto overscroll-contain divide-y divide-border-1">
          {sortFiles(files, sort).map(({ file, index }) => renderRow(file, index))}
        </ul>
      </div>
    </ColumnsContext.Provider>
  );
}

import React, { createContext, useContext, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { FileTypeIcon } from './ui/FileTypeIcon';
import { FileProgressCell } from './FileProgressCell';
import type { ManifestFile } from '../types/transfer';
import type { FileProgress } from '../utils/transferProgress';
import { formatBytes, formatModified } from '../utils/format';
import { displayPath, fileExtension } from '../utils/filePath';
import { cn } from '../utils/cn';

type SortKey = 'name' | 'type' | 'size' | 'modified';

interface Sort {
  key: SortKey;
  direction: 'asc' | 'desc';
}

const COMPARE: Record<SortKey, (a: ManifestFile, b: ManifestFile) => number> = {
  name: (a, b) => displayPath(a).localeCompare(displayPath(b), undefined, { numeric: true, sensitivity: 'base' }),
  type: (a, b) => fileExtension(a.name).localeCompare(fileExtension(b.name)),
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

type ResizableColumn = 'type' | 'size' | 'modified';

/** Widths in px the user dragged columns to; a column not in here keeps its default width */
type ColumnWidths = Partial<Record<ResizableColumn, number>>;

const MIN_COLUMN_WIDTH_PX = 32;
const MAX_COLUMN_WIDTH_PX = 320;

interface Columns {
  hasLead: boolean;
  trailClassName?: string;
  widths: ColumnWidths;
}

// Header and rows render the same cells at the same widths, so the columns line up; "Type" and "Modified" only
// when the table is wide enough
const ColumnsContext = createContext<Columns>({ hasLead: false, widths: {} });

const widthStyle = (width: number | undefined) => (width === undefined ? undefined : { width });

const CELL = {
  lead: 'flex shrink-0 w-4',
  name: 'flex-1 min-w-0 truncate',
  type: 'hidden @sm:block shrink-0 w-12 truncate uppercase',
  size: 'shrink-0 w-18 text-right tabular-nums',
  modified: 'hidden @md:block shrink-0 w-26 text-right tabular-nums',
  trail: 'flex shrink-0 items-center justify-end gap-3',
};

const ROW = 'flex items-center gap-3 px-2';

interface ResizeHandleProps {
  width: number | undefined;
  onResize: (width: number | undefined) => void;
}

/**
 * Drags the column's left edge: moving left widens it, and the Name column takes up what is left. The pointer is
 * captured so the drag carries on outside the handle; a double click puts the default width back.
 */
const ResizeHandle: React.FC<ResizeHandleProps> = ({ width, onResize }) => {
  const startDrag = (event: React.PointerEvent<HTMLSpanElement>) => {
    const handle = event.currentTarget;
    const startX = event.clientX;
    const startWidth = width ?? handle.parentElement?.getBoundingClientRect().width ?? 0;
    handle.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => {
      const next = startWidth - (moveEvent.clientX - startX);
      onResize(Math.min(Math.max(next, MIN_COLUMN_WIDTH_PX), MAX_COLUMN_WIDTH_PX));
    };
    const stop = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', stop);
      handle.removeEventListener('pointercancel', stop);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', stop);
    handle.addEventListener('pointercancel', stop);
    event.preventDefault();
  };

  return (
    <span
      data-testid="column-resize"
      onPointerDown={startDrag}
      onDoubleClick={() => onResize(undefined)}
      className="absolute -left-2 inset-y-0 w-3 cursor-col-resize touch-none select-none after:absolute after:left-1/2 after:inset-y-0.5 after:w-px after:bg-border-2 after:opacity-0 hover:after:opacity-100 after:transition-opacity"
    />
  );
};

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
  const { hasLead, trailClassName, widths } = useContext(ColumnsContext);
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
        <span className={cn(CELL.type, 'text-text-5')} style={widthStyle(widths.type)}>
          {fileExtension(file.name)}
        </span>
        <span className={cn(CELL.size, 'text-text-4')} style={widthStyle(widths.size)}>
          {formatBytes(file.size)}
        </span>
        <span data-testid="file-modified" className={cn(CELL.modified, 'text-text-5')} style={widthStyle(widths.modified)}>
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
  /** The lead column's header, e.g. a checkbox that ticks every row */
  headerLead?: React.ReactNode;
  /** Width of a column after the sizes, for each row's `trail`; none when omitted */
  trailClassName?: string;
  /** A `FileTableRow`, keyed; `index` is the file's position in `files`, whatever order it is shown in */
  renderRow: (file: F, index: number) => React.ReactNode;
  className?: string;
}

/**
 * A file list with sortable Name, Type, Size and Modified columns (the last three resizable from the header), and
 * optional columns before and after them.
 */
export function FileTable<F extends ManifestFile>({
  files,
  renderRow,
  hasLead = false,
  headerLead,
  trailClassName,
  className,
}: FileTableProps<F>) {
  const [sort, setSort] = useState<Sort | null>(null);
  const [widths, setWidths] = useState<ColumnWidths>({});
  const onSort = (key: SortKey) => setSort((current) => nextSort(current, key));
  const resizer = (column: ResizableColumn) => (
    <ResizeHandle width={widths[column]} onResize={(width) => setWidths((current) => ({ ...current, [column]: width }))} />
  );

  return (
    <ColumnsContext.Provider value={{ hasLead, trailClassName, widths }}>
      <div className={cn('@container', className)}>
        <div className={cn(ROW, 'pb-1 border-b border-border-1 text-2xs font-semibold text-text-5')}>
          {hasLead && <span className={CELL.lead}>{headerLead}</span>}
          <span className="w-4 shrink-0" />
          <SortHeader label="Name" sortKey="name" sort={sort} onSort={onSort} className={CELL.name} />
          <span className={cn(CELL.type, 'relative @sm:flex')} style={widthStyle(widths.type)}>
            {resizer('type')}
            <SortHeader label="Type" sortKey="type" sort={sort} onSort={onSort} className="min-w-0" />
          </span>
          <span className={cn(CELL.size, 'relative flex justify-end')} style={widthStyle(widths.size)}>
            {resizer('size')}
            <SortHeader label="Size" sortKey="size" sort={sort} onSort={onSort} />
          </span>
          <span className={cn(CELL.modified, 'relative @md:flex justify-end')} style={widthStyle(widths.modified)}>
            {resizer('modified')}
            <SortHeader label="Modified" sortKey="modified" sort={sort} onSort={onSort} />
          </span>
          {trailClassName !== undefined && <span className={cn(CELL.trail, trailClassName)} />}
        </div>
        <ul className="scroll-fade max-h-80 overflow-y-auto overscroll-contain divide-y divide-border-1">
          {sortFiles(files, sort).map(({ file, index }) => renderRow(file, index))}
        </ul>
      </div>
    </ColumnsContext.Provider>
  );
}

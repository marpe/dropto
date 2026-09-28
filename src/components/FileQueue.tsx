import type { RefObject } from 'react';
import React, { useState } from 'react';
import { RotateCcw, Trash2, X } from 'lucide-react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { IconButton } from './ui/IconButton';
import { Checkbox } from './ui/Checkbox';
import { Notice } from './ui/Notice';
import { FilePickerButtons } from './FilePickerButtons';
import { FileTable, FileTableRow } from './FileTable';
import { FileTotals } from './FileTotals';
import type { AddFiles, ManifestFile, TransferFile } from '../types/transfer';

interface FileQueueProps {
	files: TransferFile[];
	/** Listed before a reload but not added again yet; shown faded, and not offered to anyone */
	missingFiles?: ManifestFile[];
	/** How many missing files the browser can read back after one OK (Chromium kept their handles) */
	restorableCount?: number;
	onRestoreFiles?: () => void;
	onAddFiles: AddFiles;
	/** Lets other controls (e.g. the approval dialog) open the file picker */
	fileInputRef: RefObject<HTMLInputElement | null>;
	/** One file (its remove button) or several (ticked, then Remove) */
	onRemoveFiles: (fileIds: string[]) => void;
	onClearFiles: () => void;
	/** Below the list, e.g. the Share button */
	footer?: React.ReactNode;
}

export const FileQueue: React.FC<FileQueueProps> = ({
	                                                    files,
	                                                    missingFiles = [],
	                                                    restorableCount = 0,
	                                                    onRestoreFiles,
	                                                    onAddFiles,
	                                                    fileInputRef,
	                                                    onRemoveFiles,
	                                                    onClearFiles,
	                                                    footer,
                                                    }) => {
	const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
	const missingIds = new Set(missingFiles.map((file) => file.id));
	const allFiles = [...files, ...missingFiles];
	// Ticked for removal; ids of files removed meanwhile simply drop out
	const [tickedIds, setTickedIds] = useState<ReadonlySet<string>>(new Set());
	const ticked = allFiles.filter((file) => tickedIds.has(file.id));
	const canTick = allFiles.length > 1;
	const isAllTicked = ticked.length === allFiles.length;

	const toggle = (fileId: string) => {
		setTickedIds((current) => {
			const next = new Set(current);
			if (!next.delete(fileId)) {
				next.add(fileId);
			}
			return next;
		});
	};
	const removeTicked = () => {
		onRemoveFiles(ticked.map((file) => file.id));
		setTickedIds(new Set());
	};

	return (
		<Card padding="sm"
		      data-testid="file-queue">
			{missingFiles.length > 0 && (
				<Notice tone="warning"
				        icon={RotateCcw}
				        className="mb-3">
					<span className="flex flex-wrap items-center justify-between gap-3">
						<span>
							{missingFiles.length === 1 ? '1 file needs' : `${missingFiles.length} files need`} adding again after
							the reload. {restorableCount > 0 ? 'Restore them, or pick' : 'Pick'} or drop them and they fill back in.
						</span>
						{restorableCount > 0 && onRestoreFiles && (
							<Button data-testid="restore-files"
							        variant="secondary"
							        size="sm"
							        onClick={onRestoreFiles}>
								Restore
							</Button>
						)}
					</span>
				</Notice>
			)}
			<FileTable files={allFiles}
			           hasLead={canTick}
			           headerLead={
				           <Checkbox aria-label="Select all"
				                     checked={isAllTicked}
				                     isIndeterminate={ticked.length > 0 && !isAllTicked}
				                     onChange={() => setTickedIds(isAllTicked ? new Set() : new Set(allFiles.map((file) => file.id)))} />
			           }
			           trailClassName="w-9"
			           renderRow={(file) => (
				           <FileTableRow key={file.id}
				                         file={file}
				                         isLabel={canTick}
				                         lead={canTick && (
					                         <Checkbox checked={tickedIds.has(file.id)}
					                                   onChange={() => toggle(file.id)} />
				                         )}
				                         data-missing={missingIds.has(file.id) || undefined}
				                         title={missingIds.has(file.id) ? 'Add this file again' : undefined}
				                         className={missingIds.has(file.id) ? 'opacity-50' : undefined}
				                         trail={
					                         <IconButton title={`Remove ${file.name}`}
					                                     size="sm"
					                                     onClick={() => onRemoveFiles([file.id])}
					                                     className="p-1 hover:text-text-danger-1 pointer-coarse:p-2.5 pointer-coarse:-my-2">
						                         <X className="w-4 h-4" />
					                         </IconButton>
				                         } />
			           )} />

			{/* While files are ticked, the footer is about them; otherwise it counts the list and adds to it */}
			<div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border-1 sm:rounded-xl">
				{ticked.length > 0 ? (
					<>
						<span data-testid="ticked-count"
						      className="text-xs font-semibold text-text-3 tabular-nums">
							{ticked.length} selected
						</span>
						<div className="flex items-center gap-2">
							<Button variant="ghost"
							        size="sm"
							        onClick={() => setTickedIds(new Set())}>
								Cancel
							</Button>
							<Button data-testid="remove-ticked"
							        variant="danger"
							        size="sm"
							        onClick={removeTicked}>
								<Trash2 className="w-3.5 h-3.5" />
								<span>Remove</span>
							</Button>
						</div>
					</>
				) : (
					<>
						<FileTotals count={files.length}
						            ofCount={files.length + missingFiles.length}
						            totalBytes={totalBytes} />
						<div className="flex items-center gap-2">
							<FilePickerButtons onAddFiles={onAddFiles}
							                   fileInputRef={fileInputRef}
							                   size="sm" />
						</div>
					</>
				)}
			</div>

			{footer && <div className="pt-4 mt-3 border-t border-border-1">{footer}</div>}
		</Card>
	);
};

import type { RefObject } from 'react';
import React from 'react';
import { RotateCcw, X } from 'lucide-react';
import { Card } from './ui/Card';
import { IconButton } from './ui/IconButton';
import { Notice } from './ui/Notice';
import { FilePickerButtons } from './FilePickerButtons';
import { FileTable, FileTableRow } from './FileTable';
import { FileTotals } from './FileTotals';
import type { ManifestFile, TransferFile } from '../types/transfer';

interface FileQueueProps {
	files: TransferFile[];
	/** Listed before a reload but not added again yet; shown faded, and not offered to anyone */
	missingFiles?: ManifestFile[];
	onAddFiles: (files: File[]) => void;
	/** Lets other controls (e.g. the approval dialog) open the file picker */
	fileInputRef: RefObject<HTMLInputElement | null>;
	onRemoveFile: (fileId: string) => void;
	onClearFiles: () => void;
	/** Below the list, e.g. the Share button */
	footer?: React.ReactNode;
}

export const FileQueue: React.FC<FileQueueProps> = ({
	                                                    files,
	                                                    missingFiles = [],
	                                                    onAddFiles,
	                                                    fileInputRef,
	                                                    onRemoveFile,
	                                                    onClearFiles,
	                                                    footer,
                                                    }) => {
	const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
	const missingIds = new Set(missingFiles.map((file) => file.id));

	return (
		<Card padding="sm"
		      data-testid="file-queue">
			{missingFiles.length > 0 && (
				<Notice tone="warning"
				        icon={RotateCcw}
				        className="mb-3">
					{missingFiles.length === 1 ? '1 file needs' : `${missingFiles.length} files need`} adding again after the
					reload. Pick or drop them and they fill back in.
				</Notice>
			)}
			<FileTable files={[...files, ...missingFiles]}
			           trailClassName="w-9"
			           renderRow={(file) => (
				           <FileTableRow key={file.id}
				                         file={file}
				                         data-missing={missingIds.has(file.id) || undefined}
				                         title={missingIds.has(file.id) ? 'Add this file again' : undefined}
				                         className={missingIds.has(file.id) ? 'opacity-50' : undefined}
				                         trail={
					                         <IconButton title={`Remove ${file.name}`}
					                                     size="sm"
					                                     onClick={() => onRemoveFile(file.id)}
					                                     className="p-1 hover:text-text-danger-1 pointer-coarse:p-2.5 pointer-coarse:-my-2">
						                         <X className="w-4 h-4" />
					                         </IconButton>
				                         } />
			           )} />

			<div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border-1 sm:rounded-xl">
				<FileTotals count={files.length}
				            ofCount={files.length + missingFiles.length}
				            totalBytes={totalBytes} />
				<div className="flex items-center gap-2">
					<FilePickerButtons onAddFiles={onAddFiles}
					                   fileInputRef={fileInputRef}
					                   size="sm" />
				</div>
			</div>

			{footer && <div className="pt-4 mt-3 border-t border-border-1">{footer}</div>}
		</Card>
	);
};

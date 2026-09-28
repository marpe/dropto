import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Modal } from './ui/Modal';

interface QrModalProps {
	url: string;
	onClose: () => void;
}

export const QrModal: React.FC<QrModalProps> = ({ url, onClose }) => {
	return (
		<Modal
			onClose={onClose}
			bodyClassName="text-center"
		>
			{/* QR codes need dark modules on white in both themes to scan reliably */}
			<div className="p-4 bg-white rounded-2xl inline-block shadow-inner border border-border-2">
				<QRCodeSVG value={url}
				           size={200}
				           level="M"
				           fgColor="#121212" />
			</div>
		</Modal>
	);
};

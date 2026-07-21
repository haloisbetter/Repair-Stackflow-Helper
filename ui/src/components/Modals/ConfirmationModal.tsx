import { Modal } from "./Modal.js";

interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmationModal({ title, message, confirmLabel = "Confirm", cancelLabel = "Cancel", onConfirm, onCancel }: Props) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="confirm-message">{message}</p>
      <div className="confirm-actions">
        <button className="confirm-btn" onClick={onConfirm}>{confirmLabel}</button>
        <button className="confirm-btn secondary" onClick={onCancel}>{cancelLabel}</button>
      </div>
    </Modal>
  );
}

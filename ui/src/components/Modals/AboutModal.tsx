import { Modal } from "./Modal.js";

interface Props {
  onClose: () => void;
}

export function AboutModal({ onClose }: Props) {
  return (
    <Modal title="About" onClose={onClose}>
      <div className="about-content">
        <h3 className="about-title">Repair StackFlow Helper</h3>
        <p className="about-version">Version 0.1.0-dev (Development Prototype)</p>
        <p className="about-text">
          A local AI execution companion for Repair StackFlow. Formats technician notes
          using approved local AI tasks.
        </p>
        <div className="about-limitations">
          <h4 className="about-subheading">Current Limitations</h4>
          <ul className="about-list">
            <li>Development prototype — not for production use</li>
            <li>Pairing is simulated with development codes</li>
            <li>Only format_technician_note is enabled</li>
            <li>Temporary in-memory storage only</li>
            <li>Results must be copied into Repair StackFlow manually</li>
            <li>Native macOS app is not yet built</li>
          </ul>
        </div>
      </div>
    </Modal>
  );
}

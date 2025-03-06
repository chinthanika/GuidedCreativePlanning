import { useState } from "react";

const NewNodeModal = ({ isOpen, onClose, onSave }) => {
  const [name, setName] = useState("");
  const [group, setGroup] = useState("");
  const [aliases, setAliases] = useState("");
  const [attributes, setAttributes] = useState({});
  const [note, setNote] = useState("");

  // Function to generate SHA-256 hash for node ID
  const hashName = async (name) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(name);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
  };

  const handleSave = async () => {
    if (!name) return; // Ensure name is provided

    const id = await hashName(name); // Generate ID from name

    const newNode = {
      id,
      label: name,
      group: group || "Uncategorized",
      aliases: aliases || "",
      attributes: attributes || {},
      hidden: false,
      level: 1,
      note: note || "",
    };

    onSave(newNode); // Send data to parent
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>Add New Node</h2>
        <label>
          Name (Required):
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          Group:
          <input type="text" value={group} onChange={(e) => setGroup(e.target.value)} />
        </label>
        <label>
          Aliases:
          <input type="text" value={aliases} onChange={(e) => setAliases(e.target.value)} />
        </label>
        <label>
          Note:
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <button onClick={handleSave} disabled={!name}>Save</button>
        <button onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
};

export default NewNodeModal;

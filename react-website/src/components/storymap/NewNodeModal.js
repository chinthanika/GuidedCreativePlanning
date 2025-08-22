import { useState, useEffect } from "react";
import { Modal, Box, Button, TextField, Typography, Select, MenuItem } from "@material-ui/core";

import "../common/modal.css";

const NewNodeModal = ({ isOpen, closeModal, onSave }) => {
  const [name, setName] = useState("");
  const [group, setGroup] = useState("Person"); // Default to "Person"
  const [aliases, setAliases] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setName("");
      setGroup("Person"); // Reset to default
      setAliases("");
    }
  }, [isOpen]);

  // Function to generate SHA-256 hash for node ID
  const hashName = async (name) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(name);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
  };

  const handleSave = async () => {
    if (!name.trim()) return; // Ensure name is provided

    const id = await hashName(name); // Generate ID from name

    const newNode = {
      id,
      label: name.trim(),
      group: group, // Use selected group
      aliases: aliases || "",
      hidden: false,
      level: 1,
    };

    onSave(newNode); // Send data to parent
    closeModal();
  };

  if (!isOpen) return null;

  return (
    <Modal open={isOpen} onClose={closeModal} aria-labelledby="modal-title">
      <Box
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 300,
          maxHeight: "70vh",
          backgroundColor: "rgba(255, 255, 255, 0.95)",
          boxShadow: "0px 4px 10px rgba(0, 0, 0, 0.2)",
          padding: 16,
          borderRadius: 8,
          overflowY: "auto",
        }}
      >
        <Typography id="modal-title" variant="h6" style={{ marginBottom: 16, textAlign: "center" }}>
          Add New Node
        </Typography>

        <TextField
          label="Name (Required)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          fullWidth
          size="small"
          required
          style={{ marginBottom: 12 }}
        />

        {/* Group Dropdown */}
        <Select
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          fullWidth
          size="small"
          style={{ marginBottom: 12 }}
        >
          <MenuItem value="Person">Person</MenuItem>
          <MenuItem value="Organization">Organization</MenuItem>
          <MenuItem value="Location">Location</MenuItem>
        </Select>

        <TextField
          label="Aliases"
          value={aliases}
          onChange={(e) => setAliases(e.target.value)}
          fullWidth
          size="small"
          style={{ marginBottom: 12 }}
        />

        <Box style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
          <Button
            onClick={handleSave}
            className="modal-btn save-btn"
            disabled={!name}
          >
            Save
          </Button>
          <Button
            onClick={closeModal}
            className="modal-btn cancel-btn"
          >
            Cancel
          </Button>
        </Box>
      </Box>
    </Modal>
  );
};

export default NewNodeModal;
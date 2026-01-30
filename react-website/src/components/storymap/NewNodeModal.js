import { useState, useEffect } from "react";
import { Modal, Box, Button, TextField, Typography, Select, MenuItem } from "@mui/material";
import { useAuthValue } from '../../Firebase/AuthContext';
import { logTemplateUsage, logCognitiveLoad } from '../../utils/analytics';

import "../common/modal.css";

const NewNodeModal = ({ isOpen, closeModal, onSave }) => {
  const { currentUser } = useAuthValue();
  const userId = currentUser ? currentUser.uid : null;
  
  const [name, setName] = useState("");
  const [group, setGroup] = useState("Person");
  const [aliases, setAliases] = useState("");
  
  // Analytics tracking
  const [modalOpenTime, setModalOpenTime] = useState(null);
  const [fieldEditCount, setFieldEditCount] = useState({
    name: 0,
    group: 0,
    aliases: 0
  });
  const [errorCount, setErrorCount] = useState(0);
  const [saveAttempts, setSaveAttempts] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setModalOpenTime(Date.now());
      // Reset analytics
      setFieldEditCount({ name: 0, group: 0, aliases: 0 });
      setErrorCount(0);
      setSaveAttempts(0);
    } else {
      // Modal closed without saving - track abandonment
      if (modalOpenTime && (name || aliases)) {
        const timeSpent = Date.now() - modalOpenTime;
        
        if (userId) {
          logCognitiveLoad(userId, 'modal_abandoned', {
            modalType: 'new_node',
            timeSpent,
            fieldsCompleted: {
              name: !!name,
              aliases: !!aliases
            },
            fieldEditCount,
            errorCount
          });
        }
      }
      
      // Reset state
      setName("");
      setGroup("Person");
      setAliases("");
      setModalOpenTime(null);
    }
  }, [isOpen]);

  // Track field edits
  const handleNameChange = (e) => {
    setName(e.target.value);
    setFieldEditCount(prev => ({ ...prev, name: prev.name + 1 }));
  };
  
  const handleGroupChange = (e) => {
    setGroup(e.target.value);
    setFieldEditCount(prev => ({ ...prev, group: prev.group + 1 }));
  };
  
  const handleAliasesChange = (e) => {
    setAliases(e.target.value);
    setFieldEditCount(prev => ({ ...prev, aliases: prev.aliases + 1 }));
  };

  // Function to generate SHA-256 hash for node ID
  const hashName = async (name) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(name);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
  };

  const handleSave = async () => {
    setSaveAttempts(prev => prev + 1);
    
    if (!name.trim()) {
      // Track validation error
      setErrorCount(prev => prev + 1);
      
      if (userId) {
        logCognitiveLoad(userId, 'validation_error', {
          modalType: 'new_node',
          errorType: 'empty_name',
          attemptNumber: saveAttempts + 1
        });
      }
      return;
    }

    const timeSpent = Date.now() - modalOpenTime;
    const id = await hashName(name);

    const newNode = {
      id,
      label: name.trim(),
      group: group,
      aliases: aliases || "",
      hidden: false,
      level: 1,
    };
    
    // Track template usage
    if (userId) {
      logTemplateUsage(userId, 'node_creation', {
        nodeType: group,
        fieldsCompleted: {
          name: true,
          group: true,
          aliases: !!aliases
        },
        aliasesProvided: !!aliases,
        timeSpent,
        fieldEditCount,
        errorCount,
        saveAttempts: saveAttempts + 1
      });
    }

    onSave(newNode);
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
          onChange={handleNameChange}
          fullWidth
          size="small"
          required
          style={{ marginBottom: 12 }}
        />
        {/* Group Dropdown */}
        <Select
          value={group}
          onChange={handleGroupChange}
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
          onChange={handleAliasesChange}
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
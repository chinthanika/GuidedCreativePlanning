import { useState, useEffect } from "react";
import { Modal, Box, Button, TextField, Typography } from "@material-ui/core";

const SYSTEM_FIELDS = new Set([
  "attributes", "index", "fx", "fy", "vx", "vy", "__indexColor", "indexColor", "x", "y"
]);

const GraphModal = ({ isModalOpen, handleCloseModal, selectedNode, updateNode, deleteNode }) => {
  const [nodeData, setNodeData] = useState({});
  const [attributes, setAttributes] = useState({});
  const [newFieldName, setNewFieldName] = useState("");

  useEffect(() => {
    if (selectedNode) {
      // Remove system fields from nodeData before setting state
      const filteredData = Object.fromEntries(
        Object.entries(selectedNode).filter(([key]) => !SYSTEM_FIELDS.has(key))
      );
      // Parse attributes field separately
      const parsedAttributes = selectedNode.attributes ? { ...selectedNode.attributes } : {};

      setNodeData(filteredData);
      setAttributes(parsedAttributes);
    } else {
      setNodeData({});
      setAttributes({});
    }
  }, [selectedNode]);

  // Handles input change for any field dynamically
  const handleInputChange = (field, value) => {
    setNodeData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleAttributeChange = (field, value) => {
    setAttributes((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  // Handles adding new custom fields
  const handleAddNewField = () => {
    console.log("Adding new field...")
    if (!newFieldName.trim() || SYSTEM_FIELDS.has(newFieldName)) return; // Prevent empty/system field names

    setNodeData((prev) => ({
      ...prev,
      [newFieldName]: "" // Initialize new field with an empty string
    }));

    setNewFieldName(""); // Reset input
  };

  // Saves node changes (without system fields)
  const handleSaveClick = () => {
    // if (!nodeData.text?.trim()) return; // Ensure the text field is not empty
    const updatedNode = {
      ...nodeData,
      attributes: attributes
    }
    updateNode(updatedNode); // Save without system fields
    handleCloseModal();
  };

  // Deletes node
  const handleDeleteClick = () => {
    if (window.confirm("Are you sure you want to delete this node?")) {
      deleteNode(selectedNode.id);
      handleCloseModal();
    }
  };

  return (
    <Modal open={isModalOpen} onClose={handleCloseModal} aria-labelledby="modal-title">
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
          Edit Node
        </Typography>

        {/* Dynamically Create Input Fields */}
        <Box style={{ maxHeight: "50vh", overflowY: "auto", paddingRight: 8 }}>
          {Object.entries(nodeData).map(([key, value]) => (
            <TextField
              key={key}
              label={key}
              value={value}
              onChange={(e) => handleInputChange(key, e.target.value)}
              fullWidth
              size="small"
              style={{ marginTop: 8 }}
            />
          ))}
          {/* Attributes Section */}
          <Typography variant="subtitle1" style={{ marginTop: 16 }}>
            Attributes
          </Typography>
          <Box style={{ maxHeight: "20vh", overflowY: "auto", paddingRight: 8 }}>
            {Object.entries(attributes).map(([key, value]) => (
              <TextField
                key={key}
                label={key}
                value={value}
                onChange={(e) => handleAttributeChange(key, e.target.value)}
                fullWidth
                size="small"
                style={{ marginTop: 8 }}
              />
            ))}
          </Box>
        </Box>
        {/* Add New Field */}
        <Box style={{ marginTop: 16 }}>
          <TextField
            label="New Field Name"
            value={newFieldName}
            onChange={(e) => setNewFieldName(e.target.value)}
            fullWidth
            size="small"
          />
          <Button
            onClick={handleAddNewField}
            variant="contained"
            color="primary"
            size="small"
            style={{ marginTop: 8 }}
            disabled={!newFieldName.trim()}
          >
            Add Field
          </Button>
        </Box>
        {/* Action Buttons */}
        <Box style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
          <Button onClick={handleSaveClick} variant="contained" color="primary" size="small">
            Save
          </Button>
          <Button onClick={handleDeleteClick} variant="outlined" color="secondary" size="small">
            Delete
          </Button>
          <Button onClick={handleCloseModal} variant="text" size="small">
            Cancel
          </Button>
        </Box>
      </Box>
    </Modal>
  );
};

export default GraphModal;

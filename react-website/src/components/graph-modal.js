import { useState, useEffect } from "react";
import { Modal, Box, Button, TextField, Typography, Select, MenuItem } from "@material-ui/core";

const SYSTEM_FIELDS = new Set([
  "index", "fx", "fy", "vx", "vy", "__indexColor", "indexColor", "x", "y", "hidden", "level", "note"
]);

const GraphModal = ({ isModalOpen, handleCloseModal, selectedNode, updateNode, deleteNode }) => {
  const [nodeData, setNodeData] = useState({});
  const [newFieldName, setNewFieldName] = useState("");

  useEffect(() => {
    if (selectedNode) {
      // Remove system fields from nodeData before setting state
      const filteredData = Object.fromEntries(
        Object.entries(selectedNode).filter(([key]) => !SYSTEM_FIELDS.has(key))
      );

      // Default the group to "Person" if not already set
      setNodeData({
        group: "Person", // Default group
        attributes: {}, // Initialize attributes if not present
        ...filteredData,
      });
    } else {
      setNodeData({ group: "Person", attributes: {} }); // Default group and attributes for new nodes
    }
  }, [selectedNode]);

  // Handles input change for any field dynamically
  const handleInputChange = (field, value) => {
    setNodeData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  // Handles input change for attributes
  const handleAttributeChange = (attribute, value) => {
    setNodeData((prev) => ({
      ...prev,
      attributes: {
        ...prev.attributes,
        [attribute]: value,
      },
    }));
  };

  // Handles adding new custom fields
  const handleAddNewField = () => {
    if (!newFieldName.trim() || SYSTEM_FIELDS.has(newFieldName)) return; // Prevent empty/system field names

    setNodeData((prev) => ({
      ...prev,
      [newFieldName]: "" // Initialize new field with an empty string
    }));

    setNewFieldName(""); // Reset input
  };

  // Saves node changes (including attributes)
  const handleSaveClick = () => {
    const updatedNode = {
      ...nodeData,
      attributes: { ...nodeData.attributes }, // Ensure attributes are included
    };
    updateNode(updatedNode); // Save the updated node
    handleCloseModal();
  };

  // Deletes node
  const handleDeleteClick = () => {
    if (window.confirm("Are you sure you want to delete this node?")) {
      deleteNode(selectedNode.id);
      handleCloseModal();
    }
  };

  // Define attributes based on the group
  const getAttributesForGroup = (group) => {
    if (group === "Person") {
      return [
        "Character Motivation",
        "Backstory",
        "Personality Traits",
        "Speech Patterns",
        "Appearance",
        "Goals",
        "Flaws",
      ];
    } else if (group === "Location") {
      return [
        "Time",
        "Place",
        "Mood",
        "Context",
      ];
    } else if (group === "Organization") {
      return [
        "Purpose",
        "Structure",
        "Factions",
      ];
    }
    return [];
  };

  return (
    <Modal open={isModalOpen} onClose={handleCloseModal} aria-labelledby="modal-title">
      <Box
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 400,
          backgroundColor: "rgba(255, 255, 255, 0.95)",
          boxShadow: "0px 4px 10px rgba(0, 0, 0, 0.2)",
          padding: 16,
          borderRadius: 8,
          overflowY: "auto",
          maxHeight: "80vh",
        }}
      >
        <Typography id="modal-title" variant="h6" style={{ marginBottom: 16, textAlign: "center" }}>
          Edit Node
        </Typography>

        {/* Add New Field at the Top */}
        <Box style={{ marginBottom: 16 }}>
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

        {/* Dynamically Create Input Fields */}
        <Box>
          {Object.entries(nodeData).map(([key, value]) => {
            if (key === "id" || key === "attributes") {
              // Do not render the "id" or "attributes" field but keep it in nodeData
              return null;
            }
            if (key === "group") {
              // Render dropdown for the "group" field
              return (
                <Select
                  key={key}
                  value={value}
                  onChange={(e) => handleInputChange(key, e.target.value)}
                  fullWidth
                  size="small"
                  style={{ marginBottom: 12 }}
                >
                  <MenuItem value="Person">Person</MenuItem>
                  <MenuItem value="Organization">Organization</MenuItem>
                  <MenuItem value="Location">Location</MenuItem>
                </Select>
              );
            }
            return (
              <TextField
                key={key}
                label={key}
                value={value}
                onChange={(e) => handleInputChange(key, e.target.value)}
                fullWidth
                size="small"
                style={{ marginBottom: 12 }}
              />
            );
          })}
        </Box>

        {/* Color Picker */}
        <Box style={{ marginTop: 16 }}>
          <Typography variant="subtitle1" style={{ marginBottom: 8 }}>
            Node Color
          </Typography>
          <input
            type="color"
            value={nodeData.color}
            onChange={(e) => handleInputChange("color", e.target.value)}
            style={{
              width: "100%",
              height: "40px",
              border: "none",
              cursor: "pointer",
            }}
          />
        </Box>

        {/* Attributes Section Based on Group */}
        {nodeData.group && (
          <Box style={{ marginTop: 16 }}>
            <Typography variant="subtitle1" style={{ marginBottom: 8 }}>
              Attributes
            </Typography>
            {getAttributesForGroup(nodeData.group).map((attribute) => (
              <TextField
                key={attribute}
                label={attribute}
                value={nodeData.attributes?.[attribute] || ""}
                onChange={(e) => handleAttributeChange(attribute, e.target.value)}
                fullWidth
                size="small"
                multiline
                rows={3} // Allow input as a paragraph or list
                style={{ marginBottom: 12 }}
              />
            ))}
          </Box>
        )}

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
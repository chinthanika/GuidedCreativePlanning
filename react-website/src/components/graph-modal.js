import { useState, useEffect } from "react";
import { Modal, Box, Button, TextField, Typography } from "@material-ui/core";

const GraphModal = ({ isModalOpen, handleCloseModal, selectedNode, updateNode, deleteNode, nodes, links }) => {
  const [nodeData, setNodeData] = useState({});

  useEffect(() => {
    setNodeData(selectedNode ? { ...selectedNode } : {});
  }, [selectedNode]);

  
  // Handles input change for any field dynamically
  const handleInputChange = (field, value) => {
    setNodeData((prev) => ({
      ...prev,
      [field]: value,
    }));
    console.log(nodeData)
  };

  // Saves node changes
  const handleSaveClick = () => {
    if (!nodeData.text?.trim()) return; // Ensure the text field is not empty
    updateNode(nodeData);
    handleCloseModal();
  };

  // Deletes node
  const handleDeleteClick = () => {
    if (window.confirm("Are you sure you want to delete this node?")) {
      deleteNode(selectedNode.label);
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
          width: 300, // Reduced width
          maxHeight: "70vh", // Limit height
          backgroundColor: "rgba(255, 255, 255, 0.95)", // Opaque background
          boxShadow: "0px 4px 10px rgba(0, 0, 0, 0.2)",
          padding: 16,
          borderRadius: 8,
          overflowY: "auto", // Scroll if content exceeds maxHeight
        }}
      >
        <Typography id="modal-title" variant="h6" style={{ marginBottom: 16, textAlign: "center" }}>
          Edit Node
        </Typography>

        {/* Dynamically Create Input Fields */}
        <Box style={{ maxHeight: "50vh", overflowY: "auto", paddingRight: 8 }}> {/* Scrollable content */}
          {Object.entries(nodeData).map(([key, value]) => (
            key !== "id" && ( // Exclude the ID field from editing
              <TextField
                key={key}
                label={key}
                value={value}
                onChange={(e) => handleInputChange(key, e.target.value)}
                fullWidth
                size="small"
                style={{ marginTop: 8 }}
              />
            )
          ))}
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

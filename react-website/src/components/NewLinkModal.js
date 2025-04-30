import React, { useState, useEffect } from 'react';
import { Modal, Box, Button, TextField, Typography } from '@material-ui/core';

import "./modal.css";

const NewLinkModal = ({ isOpen, closeModal, onSave, nodes }) => {
    const [context, setContext] = useState('');
    const [source, setSource] = useState('');
    const [target, setTarget] = useState('');
    const [type, setType] = useState('');

    useEffect(() => {
        if (!isOpen) {
            setContext('');
            setSource('');
            setTarget('');
            setType('');
        }
    }, [isOpen]);

    const handleSave = () => {
        if (source && target && source !== target) {
            onSave({ context, source, target, type });
            closeModal();
        } else {
            alert("Source and target must be different and not empty.");
        }
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
                    Add New Link
                </Typography>
                <TextField
                    label="Relationship Context"
                    value={context}
                    onChange={(e) => setContext(e.target.value)}
                    fullWidth
                    size="small"
                    style={{ marginBottom: 12 }}
                />
                <TextField
                    label="Source Node"
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    select
                    SelectProps={{ native: true }}
                    fullWidth
                    size="small"
                    required
                    style={{ marginBottom: 12 }}
                >
                    <option value=""></option>
                    {nodes.map((node) => (
                        <option key={node.id} value={node.id}>
                            {node.label}
                        </option>
                    ))}
                </TextField>
                <TextField
                    label="Target Node"
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    select
                    SelectProps={{ native: true }}
                    fullWidth
                    size="small"
                    required
                    style={{ marginBottom: 12 }}
                >
                    <option value=""></option>
                    {nodes.map((node) => (
                        <option key={node.id} value={node.id}>
                            {node.label}
                        </option>
                    ))}
                </TextField>
                <TextField
                    label="Relationship"
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    fullWidth
                    size="small"
                    style={{ marginBottom: 12 }}
                />

                <Box style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
                    <Button
                        onClick={handleSave}
                        className="modal-btn save-btn"
                        disabled={!source || !target || source === target}
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

export default NewLinkModal;
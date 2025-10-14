import React, { useState, useEffect } from "react";
import { Modal, Box, Button, TextField, Typography, Select, MenuItem } from "@material-ui/core";
import { DatePicker, LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";

import "../common/modal.css";

const NewEventModal = ({ isOpen, closeModal, onSave, stages }) => {
    const [event, setEvent] = useState({
        date: null, // Optional now
        title: "",
        description: "",
        isMainEvent: false,
        stage: stages[0],
    }); 

    useEffect(() => {
        if (!isOpen) {
            setEvent({
                date: null,
                title: "",
                description: "",
                isMainEvent: false,
                stage: stages[0],
            });
        }
    }, [isOpen, stages]);

    const handleSave = () => {
        if (event.title && event.description) { // Date no longer required
            onSave(event);
            closeModal();
        } else {
            alert("Please fill in title and description.");
        }
    };

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
                    Add New Event
                </Typography>
                <TextField
                    label="Title"
                    value={event.title}
                    onChange={(e) => setEvent({ ...event, title: e.target.value })}
                    fullWidth
                    size="small"
                    required
                    style={{ marginBottom: 12 }}
                />
                <TextField
                    label="Description"
                    value={event.description}
                    onChange={(e) => setEvent({ ...event, description: e.target.value })}
                    fullWidth
                    size="small"
                    multiline
                    rows={3}
                    required
                    style={{ marginBottom: 12 }}
                />
                <Select
                    value={event.stage}
                    onChange={(e) => setEvent({ ...event, stage: e.target.value })}
                    fullWidth
                    size="small"
                    style={{ marginBottom: 12 }}
                >
                    {stages.map((stage) => (
                        <MenuItem key={stage} value={stage}>
                            {stage.replace(/^\w/, (c) => c.toUpperCase())}
                        </MenuItem>
                    ))}
                </Select>
                <Select
                    value={event.isMainEvent ? "true" : "false"}
                    onChange={(e) => setEvent({ ...event, isMainEvent: e.target.value === "true" })}
                    fullWidth
                    size="small"
                    style={{ marginBottom: 12 }}
                >
                    <MenuItem value="false">Not a Main Event</MenuItem>
                    <MenuItem value="true">Main Event</MenuItem>
                </Select>
                <LocalizationProvider dateAdapter={AdapterDateFns}>
                    <DatePicker
                        label="Date (Optional)"
                        value={event.date}
                        onChange={(newValue) => setEvent({ ...event, date: newValue })}
                        renderInput={(params) => (
                            <TextField {...params} 
                            fullWidth 
                            size="small" 
                            style={{ marginBottom: 12 }} />
                        )}
                    />
                </LocalizationProvider>
                <Box style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
                    <Button onClick={handleSave} className="modal-btn save-btn">
                        Save
                    </Button>
                    <Button onClick={closeModal} className="modal-btn cancel-btn">
                        Cancel
                    </Button>
                </Box>
            </Box>
        </Modal>
    );
};

export default NewEventModal;
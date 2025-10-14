import React, { useState, useEffect } from "react";
import axios from "axios";
import { Modal, Box, Button, TextField, Typography, Checkbox, FormControlLabel } from "@material-ui/core";
import { DatePicker, LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";

import "../common/modal.css";

const EventDetailsModal = ({ isOpen, closeModal, event, onSave }) => {
    const [isEditing, setIsEditing] = useState(true); // Start in edit mode
    const [editableEvent, setEditableEvent] = useState(event || {});
    const [imageUrl, setImageUrl] = useState(event?.imageUrl || "");
    const [isGenerating, setIsGenerating] = useState(false);

    useEffect(() => {
        if (event) {
            setEditableEvent(event);
            setImageUrl(event.imageUrl || "");
        } else {
            setEditableEvent({ 
                date: "", 
                title: "", 
                description: "", 
                stage: "", 
                isMainEvent: false,
                useImageAsBackground: false 
            });
            setImageUrl("");
        }
        setIsEditing(true); // Always start in edit mode when modal opens
    }, [event]);

    const handleEditToggle = () => {
        setIsEditing(!isEditing);
    };

    const handleGenerateImage = async () => {
        setIsGenerating(true);
        try {
            console.log("Sending request to generate image with description:", editableEvent.description);
            const response = await axios.post('https://guidedcreativeplanning-1.onrender.com/images', { 
                description: editableEvent.description 
            });
            setImageUrl(response.data.image_url);
            setEditableEvent({ 
                ...editableEvent, 
                imageUrl: response.data.image_url 
            });
            console.log("Image generated:", response.data.image_url);
        } catch (error) {
            console.error("Error generating image:", error);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleSetAsBackground = () => {
        setEditableEvent({
            ...editableEvent,
            useImageAsBackground: true
        });
    };

    const handleSave = () => {
        // Ensure we're saving the updated image URL and background setting
        const eventToSave = {
            ...editableEvent,
            imageUrl: imageUrl || editableEvent.imageUrl
        };
        onSave(eventToSave);
        setIsEditing(false);
        closeModal();
    };

    const handleClose = () => {
        setIsEditing(true); // Reset to edit mode for next open
        closeModal();
    };

    if (!editableEvent) {
        return null;
    }

    return (
        <Modal open={isOpen} onClose={handleClose} aria-labelledby="modal-title">
            <Box
                style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    width: 400,
                    maxHeight: "80vh",
                    backgroundColor: "rgba(255, 255, 255, 0.95)",
                    boxShadow: "0px 4px 10px rgba(0, 0, 0, 0.2)",
                    padding: 16,
                    borderRadius: 8,
                    overflowY: "auto",
                }}
            >
                <Typography id="modal-title" variant="h6" style={{ marginBottom: 16, textAlign: "center" }}>
                    Edit Event
                </Typography>

                <TextField
                    label="Title"
                    value={editableEvent.title || ""}
                    onChange={(e) => setEditableEvent({ ...editableEvent, title: e.target.value })}
                    fullWidth
                    size="small"
                    disabled={!isEditing}
                    InputProps={{
                        style: {
                            color: "#63666A",
                        },
                    }}
                    style={{ marginBottom: 16 }}
                />

                <LocalizationProvider dateAdapter={AdapterDateFns}>
                    <DatePicker
                        label="Date (MM/DD/YYYY)"
                        value={editableEvent.date ? new Date(editableEvent.date) : null}
                        onChange={(newValue) => {
                            if (newValue) {
                                // Format as MM/DD/YYYY
                                const month = String(newValue.getMonth() + 1).padStart(2, '0');
                                const day = String(newValue.getDate()).padStart(2, '0');
                                const year = newValue.getFullYear();
                                setEditableEvent({ 
                                    ...editableEvent, 
                                    date: `${month}/${day}/${year}` 
                                });
                            }
                        }}
                        renderInput={(params) => (
                            <TextField
                                {...params}
                                fullWidth
                                size="small"
                                disabled={!isEditing}
                                InputProps={{
                                    ...params.InputProps,
                                    style: {
                                        color: "#63666A",
                                    },
                                }}
                                style={{ marginBottom: 16 }}
                            />
                        )}
                    />
                </LocalizationProvider>

                <TextField
                    label="Stage"
                    value={editableEvent.stage || ""}
                    onChange={(e) => setEditableEvent({ ...editableEvent, stage: e.target.value })}
                    fullWidth
                    size="small"
                    disabled={!isEditing}
                    select
                    SelectProps={{
                        native: true,
                    }}
                    InputProps={{
                        style: {
                            color: "#63666A",
                        },
                    }}
                    style={{ marginBottom: 16 }}
                >
                    <option value="">Select Stage</option>
                    <option value="introduction">Introduction</option>
                    <option value="rising action">Rising Action</option>
                    <option value="climax">Climax</option>
                    <option value="falling action">Falling Action</option>
                    <option value="resolution">Resolution</option>
                </TextField>

                <TextField
                    label="Description"
                    value={editableEvent.description || ""}
                    onChange={(e) => setEditableEvent({ ...editableEvent, description: e.target.value })}
                    fullWidth
                    size="small"
                    multiline
                    minRows={3}
                    disabled={!isEditing}
                    InputProps={{
                        style: {
                            color: "#63666A",
                        },
                    }}
                    style={{ marginBottom: 16 }}
                />

                <FormControlLabel
                    control={
                        <Checkbox
                            checked={editableEvent.isMainEvent || false}
                            onChange={(e) => setEditableEvent({ 
                                ...editableEvent, 
                                isMainEvent: e.target.checked 
                            })}
                            disabled={!isEditing}
                        />
                    }
                    label="Mark as Main Event"
                    style={{ marginBottom: 16 }}
                />

                {imageUrl && (
                    <div style={{ marginBottom: 16 }}>
                        <img src={imageUrl} alt="Event" style={{ width: "100%", borderRadius: 8 }} />
                    </div>
                )}

                {imageUrl && (
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={editableEvent.useImageAsBackground || false}
                                onChange={(e) => setEditableEvent({ 
                                    ...editableEvent, 
                                    useImageAsBackground: e.target.checked 
                                })}
                                disabled={!isEditing}
                            />
                        }
                        label="Use as card background"
                        style={{ marginBottom: 16 }}
                    />
                )}

                <Button
                    onClick={handleGenerateImage}
                    variant="contained"
                    color="primary"
                    disabled={isGenerating || !isEditing}
                    fullWidth
                    style={{ marginBottom: 16 }}
                >
                    {isGenerating ? "Generating..." : "Generate Image from Description"}
                </Button>

                <Box style={{ display: "flex", justifyContent: "space-between", marginTop: 16, gap: 8 }}>
                    <Button 
                        onClick={handleSave} 
                        className="modal-btn save-btn"
                        variant="contained"
                        color="primary"
                        fullWidth
                    >
                        Save Changes
                    </Button>
                    <Button 
                        onClick={handleClose} 
                        className="modal-btn cancel-btn"
                        variant="outlined"
                        fullWidth
                    >
                        Cancel
                    </Button>
                </Box>
            </Box>
        </Modal>
    );
};

export default EventDetailsModal;
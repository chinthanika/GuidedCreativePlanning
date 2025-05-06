import React, { useState, useEffect } from "react";
import axios from "axios";
import { Modal, Box, Button, TextField, Typography } from "@material-ui/core";
import { DatePicker, LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";

import "./modal.css";

const EventDetailsModal = ({ isOpen, closeModal, event, onSave, setAsBackground }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editableEvent, setEditableEvent] = useState(event || {});
    const [imageUrl, setImageUrl] = useState(event?.imageUrl || "");
    const [isGenerating, setIsGenerating] = useState(false);

    useEffect(() => {
        if (event) {
            setEditableEvent(event);
            setImageUrl(event.imageUrl || ""); // Set default image URL
        } else {
            setEditableEvent({ date: "", title: "", description: "", stage: "", isMainEvent: false }); // Provide default values
            setImageUrl(""); // Reset image URL
        }
    }, [event]);

    const handleEditToggle = () => {
        setIsEditing(!isEditing);
    };

    const handleGenerateImage = async () => {
        setIsGenerating(true);
        try {
            console.log("Sending request to generate image with description:", editableEvent.description);
            const response = await axios.post("http://127.0.0.1:5000/images", { description: editableEvent.description });
            setImageUrl(response.data.image_url);
            setEditableEvent({ ...editableEvent, imageUrl: response.data.image_url });
            console.log("Image generated:", response.data.image_url);
        } catch (error) {
            console.error("Error generating image:", error);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleSave = () => {
        onSave(editableEvent);
        setIsEditing(false);
        closeModal();
    };

    if (!editableEvent) {
        return null; // Render nothing if editableEvent is not set
    }

    return (
        <Modal open={isOpen} onClose={closeModal} aria-labelledby="modal-title">
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
                    Event Details
                </Typography>
                <LocalizationProvider dateAdapter={AdapterDateFns}>
                    <DatePicker
                        label="Date"
                        value={editableEvent.date ? new Date(editableEvent.date) : null}
                        onChange={(newValue) => setEditableEvent({ ...editableEvent, date: newValue })}
                        renderInput={(params) => (
                            <TextField
                                {...params}
                                fullWidth
                                size="small"
                                required
                                disabled={!isEditing}
                                InputProps={{
                                    ...params.InputProps,
                                    style: {
                                        color: "#63666A", // Darker text color
                                    },
                                }}
                                style={{ marginBottom: 24 }}
                            />
                        )}
                    />
                </LocalizationProvider>
                <TextField
                    label="Title"
                    value={editableEvent.title || ""}
                    onChange={(e) => setEditableEvent({ ...editableEvent, title: e.target.value })}
                    fullWidth
                    size="small"
                    disabled={!isEditing}
                    InputProps={{
                        style: {
                            color: "#63666A", // Darker text color
                        },
                    }}
                    style={{ marginBottom: 24 }}
                />
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
                            color: "#63666A", // Darker text color
                        },
                    }}
                    style={{ marginBottom: 12 }}
                />
                {imageUrl && (
                    <div style={{ marginBottom: 16 }}>
                        <img src={imageUrl} alt="Generated" style={{ width: "100%", borderRadius: 8 }} />
                    </div>
                )}
                {imageUrl && (
                    <Button
                        onClick={() => setAsBackground(imageUrl)}
                        variant="contained"
                        color="secondary"
                        style={{ marginBottom: 16 }}
                    >
                        Set as Event Background
                    </Button>
                )}
                <Button
                    onClick={handleGenerateImage}
                    variant="contained"
                    color="primary"
                    disabled={isGenerating}
                    style={{ marginBottom: 16 }}
                >
                    {isGenerating ? "Generating..." : "Generate Image"}
                </Button>
                <TextField
                    label="Stage"
                    value={editableEvent.stage || ""}
                    onChange={(e) => setEditableEvent({ ...editableEvent, stage: e.target.value })}
                    fullWidth
                    size="small"
                    disabled={!isEditing}
                    InputProps={{
                        style: {
                            color: "#63666A", // Darker text color
                        },
                    }}
                    style={{ marginBottom: 12 }}
                />
                <TextField
                    label="Main Event"
                    value={editableEvent.isMainEvent ? "Yes" : "No"}
                    onChange={(e) =>
                        setEditableEvent({ ...editableEvent, isMainEvent: e.target.value === "Yes" })
                    }
                    fullWidth
                    size="small"
                    disabled={!isEditing}
                    InputProps={{
                        style: {
                            color: "#63666A", // Darker text color
                        },
                    }}
                    style={{ marginBottom: 12 }}
                />
                <Box style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
                    {isEditing ? (
                        <Button onClick={handleSave} className="modal-btn save-btn">
                            Save
                        </Button>
                    ) : (
                        <Button onClick={handleEditToggle} className="modal-btn edit-btn">
                            Edit
                        </Button>
                    )}
                    <Button onClick={closeModal} className="modal-btn cancel-btn">
                        Close
                    </Button>
                </Box>
            </Box>
        </Modal>
    );
};

export default EventDetailsModal;
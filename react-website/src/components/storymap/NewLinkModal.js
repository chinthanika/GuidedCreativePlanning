import React, { useState, useEffect } from 'react';
import { Modal, Box, Button, TextField, Typography } from '@mui/material';
import { useAuthValue } from '../../Firebase/AuthContext';
import { logTemplateUsage, logCognitiveLoad } from '../../utils/analytics';

import "../common/modal.css";

const NewLinkModal = ({ isOpen, closeModal, onSave, nodes }) => {
    const { currentUser } = useAuthValue();
    const userId = currentUser ? currentUser.uid : null;
    
    const [context, setContext] = useState('');
    const [source, setSource] = useState('');
    const [target, setTarget] = useState('');
    const [type, setType] = useState('');
    
    // Analytics tracking
    const [modalOpenTime, setModalOpenTime] = useState(null);
    const [fieldEditCount, setFieldEditCount] = useState({
        context: 0,
        source: 0,
        target: 0,
        type: 0
    });
    const [errorCount, setErrorCount] = useState(0);
    const [saveAttempts, setSaveAttempts] = useState(0);

    useEffect(() => {
        if (isOpen) {
            setModalOpenTime(Date.now());
            setFieldEditCount({ context: 0, source: 0, target: 0, type: 0 });
            setErrorCount(0);
            setSaveAttempts(0);
        } else {
            // Modal closed - check for abandonment
            if (modalOpenTime && (source || target || type || context)) {
                const timeSpent = Date.now() - modalOpenTime;
                
                if (userId) {
                    logCognitiveLoad(userId, 'modal_abandoned', {
                        modalType: 'new_link',
                        timeSpent,
                        fieldsCompleted: {
                            context: !!context,
                            source: !!source,
                            target: !!target,
                            type: !!type
                        },
                        fieldEditCount,
                        errorCount
                    });
                }
            }
            
            // Reset state
            setContext('');
            setSource('');
            setTarget('');
            setType('');
            setModalOpenTime(null);
        }
    }, [isOpen]);
    
    // Track field edits
    const handleContextChange = (e) => {
        setContext(e.target.value);
        setFieldEditCount(prev => ({ ...prev, context: prev.context + 1 }));
    };
    
    const handleSourceChange = (e) => {
        setSource(e.target.value);
        setFieldEditCount(prev => ({ ...prev, source: prev.source + 1 }));
    };
    
    const handleTargetChange = (e) => {
        setTarget(e.target.value);
        setFieldEditCount(prev => ({ ...prev, target: prev.target + 1 }));
    };
    
    const handleTypeChange = (e) => {
        setType(e.target.value);
        setFieldEditCount(prev => ({ ...prev, type: prev.type + 1 }));
    };

    const handleSave = () => {
        setSaveAttempts(prev => prev + 1);
        
        // Validation errors
        if (!source || !target) {
            setErrorCount(prev => prev + 1);
            
            if (userId) {
                logCognitiveLoad(userId, 'validation_error', {
                    modalType: 'new_link',
                    errorType: 'missing_required_field',
                    missingFields: {
                        source: !source,
                        target: !target
                    },
                    attemptNumber: saveAttempts + 1
                });
            }
            
            alert("Source and target must not be empty.");
            return;
        }
        
        if (source === target) {
            setErrorCount(prev => prev + 1);
            
            if (userId) {
                logCognitiveLoad(userId, 'validation_error', {
                    modalType: 'new_link',
                    errorType: 'same_source_target',
                    attemptNumber: saveAttempts + 1
                });
            }
            
            alert("Source and target must be different.");
            return;
        }
        
        const timeSpent = Date.now() - modalOpenTime;
        
        // Track template usage
        if (userId) {
            logTemplateUsage(userId, 'link_creation', {
                fieldsCompleted: {
                    context: !!context,
                    source: true,
                    target: true,
                    type: !!type
                },
                contextProvided: !!context,
                typeProvided: !!type,
                timeSpent,
                fieldEditCount,
                errorCount,
                saveAttempts: saveAttempts + 1
            });
        }
        
        onSave({ context, source, target, type });
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
                    Add New Link
                </Typography>
                <TextField
                    label="Relationship Context"
                    value={context}
                    onChange={handleContextChange}
                    fullWidth
                    size="small"
                    style={{ marginBottom: 12 }}
                />
                <TextField
                    label="Source Node"
                    value={source}
                    onChange={handleSourceChange}
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
                    onChange={handleTargetChange}
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
                    onChange={handleTypeChange}
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
import React, { useState, useEffect } from 'react';
import { Modal, Box, Button, TextField, Typography } from '@mui/material';
import { useAuthValue } from '../../Firebase/AuthContext';
import { logTemplateUsage, logCognitiveLoad } from '../../utils/analytics';

const EditLinkModal = ({ isOpen, closeModal, onSave, link, nodes }) => {
    const { currentUser } = useAuthValue();
    const userId = currentUser ? currentUser.uid : null;
    
    const [context, setContext] = useState('');
    const [source, setSource] = useState(null);
    const [target, setTarget] = useState(null);
    const [type, setType] = useState('');
    
    // Analytics tracking
    const [modalOpenTime, setModalOpenTime] = useState(null);
    const [initialValues, setInitialValues] = useState(null);
    const [fieldEditCount, setFieldEditCount] = useState({
        context: 0,
        source: 0,
        target: 0,
        type: 0
    });
    const [errorCount, setErrorCount] = useState(0);
    const [saveAttempts, setSaveAttempts] = useState(0);

    useEffect(() => {
        if (link) {
            const linkValues = {
                context: link.context,
                source: link.source,
                target: link.target,
                type: link.type
            };
            
            setContext(link.context);
            setSource(link.source);
            setTarget(link.target);
            setType(link.type);
            
            if (isOpen) {
                setModalOpenTime(Date.now());
                setInitialValues(linkValues);
                setFieldEditCount({ context: 0, source: 0, target: 0, type: 0 });
                setErrorCount(0);
                setSaveAttempts(0);
            }
        } else {
            setContext('');
            setSource(null);
            setTarget(null);
            setType('');
            setInitialValues(null);
        }
    }, [link, isOpen]);
    
    useEffect(() => {
        if (!isOpen && modalOpenTime && initialValues) {
            // Modal closed - check for abandonment or changes
            const hasChanges = 
                context !== initialValues.context ||
                source !== initialValues.source ||
                target !== initialValues.target ||
                type !== initialValues.type;
            
            if (hasChanges) {
                const timeSpent = Date.now() - modalOpenTime;
                
                if (userId) {
                    logCognitiveLoad(userId, 'modal_abandoned', {
                        modalType: 'edit_link',
                        timeSpent,
                        fieldsChanged: {
                            context: context !== initialValues.context,
                            source: source !== initialValues.source,
                            target: target !== initialValues.target,
                            type: type !== initialValues.type
                        },
                        fieldEditCount,
                        errorCount
                    });
                }
            }
            
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
        
        // Validation
        if (!source || !target) {
            setErrorCount(prev => prev + 1);
            
            if (userId) {
                logCognitiveLoad(userId, 'validation_error', {
                    modalType: 'edit_link',
                    errorType: 'missing_required_field',
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
                    modalType: 'edit_link',
                    errorType: 'same_source_target',
                    attemptNumber: saveAttempts + 1
                });
            }
            
            alert("Source and target must be different.");
            return;
        }
        
        const timeSpent = Date.now() - modalOpenTime;
        
        // Track what changed
        const changedFields = {
            context: context !== initialValues.context,
            source: source !== initialValues.source,
            target: target !== initialValues.target,
            type: type !== initialValues.type
        };
        
        const changeCount = Object.values(changedFields).filter(Boolean).length;
        
        // Track template usage
        if (userId) {
            logTemplateUsage(userId, 'link_edit', {
                fieldsChanged: changedFields,
                changeCount,
                timeSpent,
                fieldEditCount,
                errorCount,
                saveAttempts: saveAttempts + 1
            });
        }
        
        console.log(source, target);
        onSave({ 
            ...link, 
            context, 
            source: source, 
            target: target,
            type 
        });
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
                    Edit Link
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
                    label="Relationship Type"
                    value={type}
                    onChange={handleTypeChange}
                    fullWidth
                    size="small"
                    style={{ marginBottom: 12 }}
                />

                <Box style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
                    <Button onClick={handleSave} variant="contained" color="primary" size="small" disabled={!source || !target || source === target}>
                        Save
                    </Button>
                    <Button onClick={closeModal} variant="outlined" color="secondary" size="small">
                        Cancel
                    </Button>
                </Box>
            </Box>
        </Modal>
    );
};

export default EditLinkModal;
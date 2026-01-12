import React, { useState, useEffect } from 'react';
import axios from 'axios';

const NewItemModal = ({
    isOpen,
    closeModal,
    parentItem,
    parentTemplate,
    existingItems,
    templates,
    onSave,
    apiBase,
    userId
}) => {
    const [step, setStep] = useState(1); // 1: Basic Info, 2: Template Selection, 3: Field Definition

    // Basic info
    const [itemName, setItemName] = useState('');
    const [itemType, setItemType] = useState('');
    const [itemDescription, setItemDescription] = useState('');
    const [selectedParentId, setSelectedParentId] = useState(parentItem?.firebaseKey || null);

    // Template state
    const [templateChoice, setTemplateChoice] = useState(null); // 'ai', 'manual', 'inherit', 'none'
    const [suggestedFields, setSuggestedFields] = useState([]);
    const [customFields, setCustomFields] = useState([]);
    const [loadingAI, setLoadingAI] = useState(false);
    const [aiError, setAiError] = useState(null);

    // Field input
    const [fieldInput, setFieldInput] = useState({
        fieldName: '',
        fieldType: 'text',
        description: '',
        required: false
    });

    const [guidingQuestion, setGuidingQuestion] = useState('');
    const [showPedagogy, setShowPedagogy] = useState({});

    // Helper function to format field names for display
    const formatFieldName = (fieldName) => {
        // Convert camelCase or PascalCase to Title Case with spaces
        return fieldName
            .replace(/([A-Z])/g, ' $1') // Add space before capital letters
            .replace(/^./, str => str.toUpperCase()) // Capitalize first letter
            .trim();
    };

    useEffect(() => {
        if (isOpen) {
            setSelectedParentId(parentItem?.firebaseKey || null);

            // Auto-inherit parent template if exists
            if (parentTemplate) {
                setCustomFields(parentTemplate.fields.map(f => ({ ...f, inherited: true, accepted: true })));
            }
        }
    }, [isOpen, parentItem, parentTemplate]);

    if (!isOpen) return null;

    const handleClose = () => {
        setStep(1);
        setItemName('');
        setItemType('');
        setItemDescription('');
        setTemplateChoice(null);
        setSuggestedFields([]);
        setCustomFields([]);
        setAiError(null);
        setGuidingQuestion(''); // NEW
        setShowPedagogy({}); // NEW
        closeModal();
    };

    const handleNext = () => {
        if (step === 1) {
            if (!itemName.trim() || !itemType.trim() || !itemDescription.trim()) {
                alert('Name, type, and description are required');
                return;
            }
            setStep(2);
        } else if (step === 2) {
            if (!templateChoice) {
                alert('Please select a template option');
                return;
            }

            if (templateChoice === 'ai') {
                handleSuggestTemplate();
            } else if (templateChoice === 'inherit' && parentTemplate) {
                setCustomFields(parentTemplate.fields.map(f => ({ ...f, inherited: true, accepted: true })));
                setStep(3);
            } else if (templateChoice === 'manual' || templateChoice === 'none') {
                setStep(3);
            }
        }
    };

    const handleBack = () => {
        if (step === 3 && templateChoice === 'ai' && suggestedFields.length > 0) {
            setStep(2);
        } else if (step > 1) {
            setStep(step - 1);
        }
    };

    const handleSuggestTemplate = async () => {
        setLoadingAI(true);
        setAiError(null);

        try {
            const parentTemplateFields = parentTemplate ? parentTemplate.fields : [];
            const existingCustomFields = customFields.reduce((acc, field) => {
                acc[field.fieldName] = field;
                return acc;
            }, {});

            // const AI_SERVER_URL = process.env.REACT_APP_AI_SERVER_URL || 'https://guidedcreativeplanning-ai.onrender.com' || "http://localhost:5000";
            const AI_SERVER_URL =  "http://localhost:5000";

            console.log(`Calling ${AI_SERVER_URL}.\n Requesting AI suggestions.`);

            const response = await axios.post(`${AI_SERVER_URL}/worldbuilding/suggest-template`, {
                userId,
                itemName,
                itemType,
                itemDescription,
                parentTemplateFields,
                existingCustomFields
            });

            const suggested = response.data.suggestedFields || [];
            const guiding = response.data.guidingQuestion || ''; // NEW: Capture guiding question

            // Mark inherited fields as accepted, new fields as pending
            const fieldsWithStatus = suggested.map(field => ({
                ...field,
                inherited: customFields.some(cf => cf.fieldName === field.fieldName),
                accepted: customFields.some(cf => cf.fieldName === field.fieldName)
            }));

            setSuggestedFields(fieldsWithStatus);
            setGuidingQuestion(guiding); // NEW: Set guiding question

            // NEW: Initialize pedagogy toggle state
            const initialShowState = {};
            fieldsWithStatus.forEach(field => {
                initialShowState[field.fieldName] = false;
            });
            setShowPedagogy(initialShowState);

            setStep(3);
        } catch (error) {
            console.error('AI suggestion error:', error);
            setAiError('Failed to get AI suggestions. Try manual template or try again.');
        } finally {
            setLoadingAI(false);
        }
    };


    const handleAcceptField = (field) => {
        setSuggestedFields(suggestedFields.map(f =>
            f.fieldName === field.fieldName ? { ...f, accepted: true } : f
        ));

        if (!customFields.some(cf => cf.fieldName === field.fieldName)) {
            setCustomFields([...customFields, { ...field, accepted: true }]);
        }
    };

    const handleRejectField = (field) => {
        setSuggestedFields(suggestedFields.map(f =>
            f.fieldName === field.fieldName ? { ...f, accepted: false } : f
        ));

        setCustomFields(customFields.filter(cf => cf.fieldName !== field.fieldName));
    };

    const handleAcceptAll = () => {
        const allAccepted = suggestedFields.map(f => ({ ...f, accepted: true }));
        setSuggestedFields(allAccepted);

        const newFields = allAccepted.filter(f =>
            !customFields.some(cf => cf.fieldName === f.fieldName)
        );
        setCustomFields([...customFields, ...newFields]);
    };

    const handleRejectAll = () => {
        const allRejected = suggestedFields.map(f => ({ ...f, accepted: false }));
        setSuggestedFields(allRejected);

        // Keep only inherited fields
        setCustomFields(customFields.filter(cf => cf.inherited));
    };

    const handleAddCustomField = () => {
        if (!fieldInput.fieldName.trim()) {
            alert('Field name is required');
            return;
        }

        if (customFields.some(f => f.fieldName === fieldInput.fieldName)) {
            alert('A field with this name already exists');
            return;
        }

        setCustomFields([...customFields, { ...fieldInput, manual: true }]);
        setFieldInput({
            fieldName: '',
            fieldType: 'text',
            description: '',
            required: false
        });
    };

    const handleRemoveCustomField = (fieldName) => {
        setCustomFields(customFields.filter(f => f.fieldName !== fieldName));

        // If it was a suggested field, mark as rejected
        setSuggestedFields(suggestedFields.map(f =>
            f.fieldName === fieldName ? { ...f, accepted: false } : f
        ));
    };

    const togglePedagogy = (fieldName) => {
        setShowPedagogy(prev => ({
            ...prev,
            [fieldName]: !prev[fieldName]
        }));
    };


    const handleSave = () => {
        const finalFields = customFields.filter(f => f.accepted !== false);

        if (templateChoice !== 'none' && finalFields.length === 0) {
            alert('Please add at least one field or choose "No Template"');
            return;
        }

        const newItem = {
            name: itemName,
            type: itemType,
            description: itemDescription,
            parentId: selectedParentId,
            customFields: {} // Always initialize, even if empty
        };

        // Initialize custom fields with empty values
        finalFields.forEach(field => {
            if (field.fieldType === 'array') {
                newItem.customFields[field.fieldName] = [];
            } else {
                newItem.customFields[field.fieldName] = '';
            }
        });

        const template = templateChoice !== 'none' ? {
            name: `${itemType} Template`,
            fields: finalFields.map(f => ({
                fieldName: f.fieldName,
                fieldType: f.fieldType,
                description: f.description,
                required: f.required || false,
                pedagogicalRationale: f.pedagogicalRationale, // NEW
                reflectivePrompt: f.reflectivePrompt // NEW
            })),
            inheritedFrom: parentTemplate?.firebaseKey || null
        } : null;

        onSave(newItem, template);
        handleClose();
    };

    const selectedParent = selectedParentId ? existingItems[selectedParentId] : null;

    return (
        <div className="world-modal-overlay" onClick={handleClose}>
            <div className="world-modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '700px' }}>
                <h3 className="world-modal-header">
                    ✨ Create New Item
                    {selectedParent && (
                        <span style={{ fontSize: '0.8rem', color: '#666', fontWeight: 'normal' }}>
                            {' '}(child of {selectedParent.name})
                        </span>
                    )}
                </h3>

                {/* Progress Indicator */}
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
                    <div style={{
                        flex: 1,
                        height: '4px',
                        backgroundColor: step >= 1 ? '#007bff' : '#e0e0e0',
                        borderRadius: '2px'
                    }} />
                    <div style={{
                        flex: 1,
                        height: '4px',
                        backgroundColor: step >= 2 ? '#007bff' : '#e0e0e0',
                        borderRadius: '2px'
                    }} />
                    <div style={{
                        flex: 1,
                        height: '4px',
                        backgroundColor: step >= 3 ? '#007bff' : '#e0e0e0',
                        borderRadius: '2px'
                    }} />
                </div>

                <div className="world-modal-form">
                    {/* STEP 1: Basic Info */}
                    {step === 1 && (
                        <>
                            <div className="form-group">
                                <label>Item Name *</label>
                                <input
                                    type="text"
                                    value={itemName}
                                    onChange={(e) => setItemName(e.target.value)}
                                    placeholder="e.g., Elemental Magic"
                                    autoFocus
                                />
                            </div>

                            <div className="form-group">
                                <label>Item Type *</label>
                                <input
                                    type="text"
                                    value={itemType}
                                    onChange={(e) => setItemType(e.target.value)}
                                    placeholder="e.g., Magic System, Character, Location"
                                />
                            </div>

                            <div className="form-group">
                                <label>Description *</label>
                                <textarea
                                    value={itemDescription}
                                    onChange={(e) => setItemDescription(e.target.value)}
                                    placeholder="Brief description of this item..."
                                    rows={3}
                                />
                            </div>

                            <div className="form-group">
                                <label>Parent Item</label>
                                <select
                                    value={selectedParentId || ''}
                                    onChange={(e) => setSelectedParentId(e.target.value || null)}
                                >
                                    <option value="">-- Select Parent --</option>
                                    {Object.entries(existingItems).map(([key, item]) => (
                                        <option key={key} value={key}>
                                            {item.name} ({item.type})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </>
                    )}

                    {/* STEP 2: Template Choice */}
                    {step === 2 && (
                        <>
                            <h4 style={{ marginBottom: '1rem', color: '#333' }}>Choose Template Option</h4>

                            {parentTemplate && (
                                <div
                                    onClick={() => setTemplateChoice('inherit')}
                                    style={{
                                        padding: '1rem',
                                        border: `2px solid ${templateChoice === 'inherit' ? '#007bff' : '#dee2e6'}`,
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        marginBottom: '0.75rem',
                                        backgroundColor: templateChoice === 'inherit' ? '#e7f3ff' : 'white'
                                    }}
                                >
                                    <strong>🔗 Inherit Parent Template</strong>
                                    <p style={{ margin: '0.5rem 0 0 0', color: '#666', fontSize: '0.9rem' }}>
                                        Use the same template as "{selectedParent?.name}" ({parentTemplate.fields.length} fields)
                                    </p>
                                </div>
                            )}

                            <div
                                onClick={() => setTemplateChoice('ai')}
                                style={{
                                    padding: '1rem',
                                    border: `2px solid ${templateChoice === 'ai' ? '#007bff' : '#dee2e6'}`,
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    marginBottom: '0.75rem',
                                    backgroundColor: templateChoice === 'ai' ? '#e7f3ff' : 'white'
                                }}
                            >
                                <strong>🤖 AI-Suggested Template</strong>
                                <p style={{ margin: '0.5rem 0 0 0', color: '#666', fontSize: '0.9rem' }}>
                                    Let AI suggest relevant fields based on the item type and description
                                </p>
                            </div>

                            <div
                                onClick={() => setTemplateChoice('manual')}
                                style={{
                                    padding: '1rem',
                                    border: `2px solid ${templateChoice === 'manual' ? '#007bff' : '#dee2e6'}`,
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    marginBottom: '0.75rem',
                                    backgroundColor: templateChoice === 'manual' ? '#e7f3ff' : 'white'
                                }}
                            >
                                <strong>✏️ Manual Template</strong>
                                <p style={{ margin: '0.5rem 0 0 0', color: '#666', fontSize: '0.9rem' }}>
                                    Define your own custom fields from scratch
                                </p>
                            </div>

                            <div
                                onClick={() => setTemplateChoice('none')}
                                style={{
                                    padding: '1rem',
                                    border: `2px solid ${templateChoice === 'none' ? '#007bff' : '#dee2e6'}`,
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    backgroundColor: templateChoice === 'none' ? '#e7f3ff' : 'white'
                                }}
                            >
                                <strong>📝 No Template</strong>
                                <p style={{ margin: '0.5rem 0 0 0', color: '#666', fontSize: '0.9rem' }}>
                                    Create item with just name, type, and description
                                </p>
                            </div>

                            {aiError && (
                                <div style={{
                                    padding: '0.75rem',
                                    backgroundColor: '#f8d7da',
                                    border: '1px solid #f5c6cb',
                                    borderRadius: '6px',
                                    color: '#721c24',
                                    marginTop: '1rem'
                                }}>
                                    {aiError}
                                </div>
                            )}
                        </>
                    )}

                    {/* STEP 3: Field Definition */}
                    {step === 3 && (
                        <>
                            <h4 style={{ marginBottom: '1rem', color: '#333' }}>
                                {templateChoice === 'ai' ? 'Review AI Suggestions' :
                                    templateChoice === 'inherit' ? 'Inherited Fields' :
                                        templateChoice === 'manual' ? 'Define Custom Fields' :
                                            'Confirm Creation'}
                            </h4>

                            {/* AI Suggestions */}
                            {templateChoice === 'ai' && suggestedFields.length > 0 && (
                                <>
                                    {/* NEW: Guiding Question Banner */}
                                    {guidingQuestion && (
                                        <div style={{
                                            padding: '1rem',
                                            backgroundColor: 'var(--success-main)',
                                            color: 'white',
                                            borderRadius: '8px',
                                            marginBottom: '1rem'
                                        }}>
                                            <strong style={{ fontSize: '0.9rem' }}>🎯 Big Picture:</strong>
                                            <p style={{ fontSize: '0.9rem', margin: '0.5rem 0 0 0', lineHeight: 1.5 }}>
                                                {guidingQuestion}
                                            </p>
                                        </div>
                                    )}

                                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                                        <button
                                            onClick={handleAcceptAll}
                                            style={{
                                                flex: 1,
                                                padding: '0.5rem',
                                                backgroundColor: 'var(--success-main)',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '6px',
                                                cursor: 'pointer',
                                                fontSize: '0.9rem'
                                            }}
                                        >
                                            ✓ Accept All
                                        </button>
                                        <button
                                            onClick={handleRejectAll}
                                            style={{
                                                flex: 1,
                                                padding: '0.5rem',
                                                backgroundColor: 'var(--error-main)',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '6px',
                                                cursor: 'pointer',
                                                fontSize: '0.9rem'
                                            }}
                                        >
                                            ✕ Reject All
                                        </button>
                                    </div>

                                    <div style={{ maxHeight: '400px', overflowY: 'auto', marginBottom: '1rem' }}>
                                        {suggestedFields.map((field, idx) => (
                                            <div
                                                key={idx}
                                                style={{
                                                    padding: '0.75rem',
                                                    border: `2px solid ${field.accepted ? 'var(--success-main)' : 'var(--divider)'}`,
                                                    borderRadius: '8px',
                                                    marginBottom: '0.5rem',
                                                    backgroundColor: field.accepted ? '#d4edda' : 'var(--background-paper)'
                                                }}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                                                    <div style={{ flex: 1 }}>
                                                        <strong>{formatFieldName(field.fieldName)}</strong>
                                                        <span style={{
                                                            marginLeft: '0.5rem',
                                                            padding: '0.2rem 0.5rem',
                                                            backgroundColor: 'var(--border-light)',
                                                            borderRadius: '4px',
                                                            fontSize: '0.8rem'
                                                        }}>
                                                            {field.fieldType}
                                                        </span>
                                                        {field.inherited && (
                                                            <span style={{
                                                                marginLeft: '0.5rem',
                                                                padding: '0.2rem 0.5rem',
                                                                backgroundColor: 'var(--border-light)',
                                                                borderRadius: '4px',
                                                                fontSize: '0.8rem',
                                                                color: 'var(--text-disabled)'
                                                            }}>
                                                                inherited
                                                            </span>
                                                        )}
                                                        <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                                            {field.description}
                                                        </p>

                                                        {/* NEW: Pedagogical Content Toggle */}
                                                        {(field.pedagogicalRationale || field.reflectivePrompt) && (
                                                            <>
                                                                <button
                                                                    onClick={() => togglePedagogy(field.fieldName)}
                                                                    style={{
                                                                        marginTop: '0.5rem',
                                                                        padding: '0.5rem 1rem',
                                                                        backgroundColor: 'transparent',
                                                                        color: 'var(--primary-main)',
                                                                        border: '1px solid var(--primary-main)',
                                                                        borderRadius: '6px',
                                                                        cursor: 'pointer',
                                                                        fontSize: '0.85rem',
                                                                        width: '100%'
                                                                    }}
                                                                >
                                                                    {showPedagogy[field.fieldName] ? '📚 Hide Guidance' : '💡 Show Why This Matters'}
                                                                </button>

                                                                {showPedagogy[field.fieldName] && (
                                                                    <>
                                                                        {field.pedagogicalRationale && (
                                                                            <div style={{
                                                                                marginTop: '0.5rem',
                                                                                padding: '0.75rem',
                                                                                backgroundColor: 'var(--border-light)',
                                                                                borderLeft: '3px solid var(--primary-main)',
                                                                                borderRadius: '4px'
                                                                            }}>
                                                                                <strong style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                                                                                    Why this matters:
                                                                                </strong>
                                                                                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.5rem 0 0 0' }}>
                                                                                    {field.pedagogicalRationale}
                                                                                </p>
                                                                            </div>
                                                                        )}

                                                                        {field.reflectivePrompt && (
                                                                            <div style={{
                                                                                marginTop: '0.5rem',
                                                                                padding: '0.75rem',
                                                                                backgroundColor: 'var(--warning-main)',
                                                                                color: 'white',
                                                                                borderRadius: '4px',
                                                                                opacity: 0.9
                                                                            }}>
                                                                                <strong style={{ fontSize: '0.85rem' }}>Think about:</strong>
                                                                                <p style={{ fontSize: '0.85rem', margin: '0.5rem 0 0 0' }}>
                                                                                    {field.reflectivePrompt}
                                                                                </p>
                                                                            </div>
                                                                        )}
                                                                    </>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '0.25rem', marginLeft: '0.5rem' }}>
                                                        {!field.accepted && (
                                                            <button
                                                                onClick={() => handleAcceptField(field)}
                                                                style={{
                                                                    padding: '0.25rem 0.5rem',
                                                                    backgroundColor: 'var(--success-main)',
                                                                    color: 'white',
                                                                    border: 'none',
                                                                    borderRadius: '4px',
                                                                    cursor: 'pointer',
                                                                    fontSize: '0.8rem'
                                                                }}
                                                            >
                                                                ✓
                                                            </button>
                                                        )}
                                                        {field.accepted && !field.inherited && (
                                                            <button
                                                                onClick={() => handleRejectField(field)}
                                                                style={{
                                                                    padding: '0.25rem 0.5rem',
                                                                    backgroundColor: 'var(--error-main)',
                                                                    color: 'white',
                                                                    border: 'none',
                                                                    borderRadius: '4px',
                                                                    cursor: 'pointer',
                                                                    fontSize: '0.8rem'
                                                                }}
                                                            >
                                                                ✕
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}

                            {/* Manual Field Addition */}
                            {(templateChoice === 'manual' || templateChoice === 'ai') && (
                                <>
                                    <h5 style={{ marginTop: '1.5rem', marginBottom: '0.75rem', color: '#333' }}>
                                        Add Custom Field
                                    </h5>

                                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                        <input
                                            type="text"
                                            placeholder="Field name..."
                                            value={fieldInput.fieldName}
                                            onChange={(e) => setFieldInput({ ...fieldInput, fieldName: e.target.value })}
                                            style={{
                                                padding: '0.5rem',
                                                border: '2px solid #dee2e6',
                                                borderRadius: '6px',
                                                fontSize: '0.9rem'
                                            }}
                                        />
                                        <select
                                            value={fieldInput.fieldType}
                                            onChange={(e) => setFieldInput({ ...fieldInput, fieldType: e.target.value })}
                                            style={{
                                                padding: '0.5rem',
                                                border: '2px solid #dee2e6',
                                                borderRadius: '6px',
                                                fontSize: '0.9rem'
                                            }}
                                        >
                                            <option value="text">Text</option>
                                            <option value="array">Array</option>
                                        </select>
                                    </div>

                                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                                        <input
                                            type="text"
                                            placeholder="Description (optional)..."
                                            value={fieldInput.description}
                                            onChange={(e) => setFieldInput({ ...fieldInput, description: e.target.value })}
                                            style={{
                                                flex: 1,
                                                padding: '0.5rem',
                                                border: '2px solid #dee2e6',
                                                borderRadius: '6px',
                                                fontSize: '0.9rem'
                                            }}
                                        />
                                        <button
                                            onClick={handleAddCustomField}
                                            style={{
                                                padding: '0.5rem 1rem',
                                                backgroundColor: '#007bff',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '6px',
                                                cursor: 'pointer',
                                                fontWeight: '600'
                                            }}
                                        >
                                            + Add
                                        </button>
                                    </div>
                                </>
                            )}

                            {/* Current Fields List */}
                            {customFields.length > 0 && (
                                <>
                                    <h5 style={{ marginTop: '1.5rem', marginBottom: '0.75rem', color: '#333' }}>
                                        Current Fields ({customFields.length})
                                    </h5>
                                    <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                                        {customFields.map((field, idx) => (
                                            <div
                                                key={idx}
                                                style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    padding: '0.5rem',
                                                    backgroundColor: '#f8f9fa',
                                                    border: '1px solid #dee2e6',
                                                    borderRadius: '6px',
                                                    marginBottom: '0.5rem'
                                                }}
                                            >
                                                <div>
                                                    <strong>{formatFieldName(field.fieldName)}</strong>
                                                    <span style={{
                                                        marginLeft: '0.5rem',
                                                        fontSize: '0.8rem',
                                                        color: '#666'
                                                    }}>
                                                        ({field.fieldType})
                                                    </span>
                                                    {field.inherited && (
                                                        <span style={{
                                                            marginLeft: '0.5rem',
                                                            fontSize: '0.8rem',
                                                            color: '#0c5460'
                                                        }}>
                                                            [inherited]
                                                        </span>
                                                    )}
                                                    {field.manual && (
                                                        <span style={{
                                                            marginLeft: '0.5rem',
                                                            fontSize: '0.8rem',
                                                            color: '#155724'
                                                        }}>
                                                            [custom]
                                                        </span>
                                                    )}
                                                </div>
                                                {!field.inherited && (
                                                    <button
                                                        onClick={() => handleRemoveCustomField(field.fieldName)}
                                                        style={{
                                                            padding: '0.25rem 0.5rem',
                                                            backgroundColor: '#dc3545',
                                                            color: 'white',
                                                            border: 'none',
                                                            borderRadius: '4px',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        ✕
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}

                            {templateChoice === 'none' && (
                                <div style={{
                                    padding: '1rem',
                                    backgroundColor: '#fff3cd',
                                    border: '1px solid #ffeaa7',
                                    borderRadius: '8px',
                                    color: '#856404'
                                }}>
                                    This item will be created with only basic information (name, type, description).
                                    You can add custom fields later if needed.
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div className="world-modal-actions">
                    {step > 1 && (
                        <button
                            className="world-modal-btn btn-cancel"
                            onClick={handleBack}
                            disabled={loadingAI}
                        >
                            ← Back
                        </button>
                    )}

                    {step < 3 && (
                        <button
                            className="world-modal-btn btn-save"
                            onClick={handleNext}
                            disabled={loadingAI}
                        >
                            {loadingAI ? 'Loading AI...' : 'Next →'}
                        </button>
                    )}

                    {step === 3 && (
                        <button
                            className="world-modal-btn btn-save"
                            onClick={handleSave}
                        >
                            Create Item
                        </button>
                    )}

                    <button
                        className="world-modal-btn btn-cancel"
                        onClick={handleClose}
                        disabled={loadingAI}
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};

export default NewItemModal;
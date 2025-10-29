import React, { useState, useEffect } from 'react';
import axios from 'axios';

const ItemDetailsModal = ({ isOpen, closeModal, item, template, onSave, onDelete }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editedItem, setEditedItem] = useState(item || {});
    const [editedTemplate, setEditedTemplate] = useState(template || null);
    
    // Field management state
    const [isManagingFields, setIsManagingFields] = useState(false);
    const [loadingAI, setLoadingAI] = useState(false);
    const [newFieldInput, setNewFieldInput] = useState({
        fieldName: '',
        fieldType: 'text',
        description: ''
    });

    // Helper function to format field names for display
    const formatFieldName = (fieldName) => {
        return fieldName
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, str => str.toUpperCase())
            .trim();
    };

    useEffect(() => {
        if (item) {
            // Ensure customFields exists
            setEditedItem({
                ...item,
                customFields: item.customFields || {}
            });
        }
        if (template) {
            setEditedTemplate(template);
        }
        setIsEditing(false);
        setIsManagingFields(false);
    }, [item, template]);

    if (!isOpen || !item) return null;

    const handleSave = () => {
        onSave(editedItem, editedTemplate);
        setIsEditing(false);
        setIsManagingFields(false);
    };

    const handleDelete = () => {
        if (window.confirm(`Delete "${item.name}"? This will also delete all child items.`)) {
            onDelete(item);
        }
    };

    const handleFieldChange = (fieldName, value) => {
        setEditedItem({
            ...editedItem,
            customFields: {
                ...(editedItem.customFields || {}),
                [fieldName]: value
            }
        });
    };

    // Field Management Functions
    const handleAddField = () => {
        if (!newFieldInput.fieldName.trim()) {
            alert('Field name is required');
            return;
        }

        const fieldExists = editedTemplate?.fields?.some(
            f => f.fieldName === newFieldInput.fieldName
        );

        if (fieldExists) {
            alert('A field with this name already exists');
            return;
        }

        const newField = {
            fieldName: newFieldInput.fieldName,
            fieldType: newFieldInput.fieldType,
            description: newFieldInput.description,
            required: false
        };

        // Add to template
        const updatedTemplate = editedTemplate ? {
            ...editedTemplate,
            fields: [...editedTemplate.fields, newField]
        } : {
            name: `${editedItem.type} Template`,
            fields: [newField],
            inheritedFrom: null
        };

        setEditedTemplate(updatedTemplate);

        // Initialize value in customFields
        setEditedItem({
            ...editedItem,
            customFields: {
                ...(editedItem.customFields || {}),
                [newField.fieldName]: newField.fieldType === 'array' ? [] : ''
            }
        });

        // Reset input
        setNewFieldInput({
            fieldName: '',
            fieldType: 'text',
            description: ''
        });
    };

    const handleRemoveField = (fieldName) => {
        if (!window.confirm(`Remove field "${formatFieldName(fieldName)}"? This will delete all data in this field.`)) {
            return;
        }

        // Remove from template
        const updatedTemplate = {
            ...editedTemplate,
            fields: editedTemplate.fields.filter(f => f.fieldName !== fieldName)
        };
        setEditedTemplate(updatedTemplate);

        // Remove from customFields
        const updatedCustomFields = { ...(editedItem.customFields || {}) };
        delete updatedCustomFields[fieldName];
        setEditedItem({
            ...editedItem,
            customFields: updatedCustomFields
        });
    };

    const handleRenameField = (oldFieldName, newFieldName) => {
        if (!newFieldName.trim()) {
            alert('Field name cannot be empty');
            return;
        }

        if (oldFieldName === newFieldName) return;

        const fieldExists = editedTemplate?.fields?.some(
            f => f.fieldName === newFieldName && f.fieldName !== oldFieldName
        );

        if (fieldExists) {
            alert('A field with this name already exists');
            return;
        }

        // Update template
        const updatedTemplate = {
            ...editedTemplate,
            fields: editedTemplate.fields.map(f => 
                f.fieldName === oldFieldName 
                    ? { ...f, fieldName: newFieldName }
                    : f
            )
        };
        setEditedTemplate(updatedTemplate);

        // Update customFields
        const updatedCustomFields = { ...(editedItem.customFields || {}) };
        updatedCustomFields[newFieldName] = updatedCustomFields[oldFieldName];
        delete updatedCustomFields[oldFieldName];
        setEditedItem({
            ...editedItem,
            customFields: updatedCustomFields
        });
    };

    const handleUpdateFieldDescription = (fieldName, description) => {
        const updatedTemplate = {
            ...editedTemplate,
            fields: editedTemplate.fields.map(f => 
                f.fieldName === fieldName 
                    ? { ...f, description }
                    : f
            )
        };
        setEditedTemplate(updatedTemplate);
    };

    const handleSuggestFields = async () => {
        setLoadingAI(true);

        try {
            const AI_SERVER_URL = process.env.REACT_APP_AI_SERVER_URL || "http://10.163.7.9:5000";
            
            const response = await axios.post(`${AI_SERVER_URL}/worldbuilding/suggest-template`, {
                userId: item.userId || 'unknown',
                itemName: editedItem.name,
                itemType: editedItem.type,
                itemDescription: editedItem.description,
                parentTemplateFields: [],
                existingCustomFields: (editedTemplate?.fields || []).reduce((acc, field) => {
                    acc[field.fieldName] = field;
                    return acc;
                }, {})
            });

            const suggestedFields = response.data.suggestedFields || [];

            // Filter out fields that already exist
            const existingFieldNames = new Set(
                (editedTemplate?.fields || []).map(f => f.fieldName)
            );
            const newFields = suggestedFields.filter(
                f => !existingFieldNames.has(f.fieldName)
            );

            if (newFields.length === 0) {
                alert('No new fields suggested. AI thinks your current fields are comprehensive!');
                return;
            }

            if (window.confirm(`Add ${newFields.length} AI-suggested field(s)?\n\n${newFields.map(f => `• ${formatFieldName(f.fieldName)} (${f.fieldType})`).join('\n')}`)) {
                const updatedTemplate = editedTemplate ? {
                    ...editedTemplate,
                    fields: [...editedTemplate.fields, ...newFields]
                } : {
                    name: `${editedItem.type} Template`,
                    fields: newFields,
                    inheritedFrom: null
                };

                setEditedTemplate(updatedTemplate);

                // Initialize values for new fields
                const updatedCustomFields = { ...(editedItem.customFields || {}) };
                newFields.forEach(field => {
                    updatedCustomFields[field.fieldName] = field.fieldType === 'array' ? [] : '';
                });

                setEditedItem({
                    ...editedItem,
                    customFields: updatedCustomFields
                });
            }
        } catch (error) {
            console.error('AI suggestion error:', error);
            alert('Failed to get AI suggestions. Please try again.');
        } finally {
            setLoadingAI(false);
        }
    };

    const renderField = (field) => {
        // Safely access customFields
        const customFields = editedItem.customFields || {};
        const value = customFields[field.fieldName];
        
        return (
            <div className="form-group" key={field.fieldName}>
                <label>
                    {isManagingFields ? (
                        <input
                            type="text"
                            value={field.fieldName}
                            onChange={(e) => handleRenameField(field.fieldName, e.target.value)}
                            style={{
                                padding: '0.25rem 0.5rem',
                                border: '1px solid #007bff',
                                borderRadius: '4px',
                                fontSize: '0.9rem',
                                fontWeight: 'bold'
                            }}
                        />
                    ) : (
                        formatFieldName(field.fieldName)
                    )}
                    {field.required && <span style={{ color: '#dc3545' }}> *</span>}
                    {isManagingFields && (
                        <button
                            onClick={() => handleRemoveField(field.fieldName)}
                            style={{
                                marginLeft: '0.5rem',
                                padding: '0.2rem 0.5rem',
                                backgroundColor: '#dc3545',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '0.8rem'
                            }}
                        >
                            ✕ Remove
                        </button>
                    )}
                </label>
                {isManagingFields ? (
                    <input
                        type="text"
                        value={field.description || ''}
                        onChange={(e) => handleUpdateFieldDescription(field.fieldName, e.target.value)}
                        placeholder="Field description..."
                        style={{
                            padding: '0.5rem',
                            border: '1px solid #dee2e6',
                            borderRadius: '4px',
                            fontSize: '0.85rem',
                            marginBottom: '0.5rem',
                            width: '100%'
                        }}
                    />
                ) : field.description && (
                    <p style={{ fontSize: '0.85rem', color: '#666', margin: '0 0 0.5rem 0' }}>
                        {field.description}
                    </p>
                )}
                
                {!isManagingFields && isEditing ? (
                    field.fieldType === 'array' ? (
                        <textarea
                            value={Array.isArray(value) ? value.join('\n') : ''}
                            onChange={(e) => handleFieldChange(
                                field.fieldName,
                                e.target.value.split('\n').filter(line => line.trim())
                            )}
                            rows={Math.max(3, (value?.length || 0) + 1)}
                            placeholder="One item per line..."
                        />
                    ) : (
                        <textarea
                            value={value || ''}
                            onChange={(e) => handleFieldChange(field.fieldName, e.target.value)}
                            rows={3}
                            placeholder={`Enter ${formatFieldName(field.fieldName).toLowerCase()}...`}
                        />
                    )
                ) : !isManagingFields ? (
                    <div style={{
                        padding: '0.75rem',
                        backgroundColor: '#f8f9fa',
                        borderRadius: '6px',
                        border: '2px solid #dee2e6',
                        minHeight: '40px'
                    }}>
                        {field.fieldType === 'array' && Array.isArray(value) ? (
                            value.length > 0 ? (
                                <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
                                    {value.map((item, idx) => (
                                        <li key={idx}>{item}</li>
                                    ))}
                                </ul>
                            ) : (
                                <span style={{ color: '#999', fontStyle: 'italic' }}>No items</span>
                            )
                        ) : (
                            <span>{value || <span style={{ color: '#999', fontStyle: 'italic' }}>Not set</span>}</span>
                        )}
                    </div>
                ) : (
                    <div style={{
                        padding: '0.75rem',
                        backgroundColor: '#f0f0f0',
                        borderRadius: '6px',
                        border: '2px dashed #999',
                        minHeight: '40px',
                        fontSize: '0.85rem',
                        color: '#666'
                    }}>
                        Type: {field.fieldType}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="world-modal-overlay" onClick={closeModal}>
            <div className="world-modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px' }}>
                <h3 className="world-modal-header">
                    📄 {item.name}
                </h3>

                <div className="world-modal-form">
                    {/* Basic Fields */}
                    <div className="form-group">
                        <label>Name</label>
                        {isEditing ? (
                            <input
                                type="text"
                                value={editedItem.name}
                                onChange={(e) => setEditedItem({ ...editedItem, name: e.target.value })}
                            />
                        ) : (
                            <div style={{
                                padding: '0.75rem',
                                backgroundColor: '#f8f9fa',
                                borderRadius: '6px',
                                border: '2px solid #dee2e6'
                            }}>
                                {item.name}
                            </div>
                        )}
                    </div>

                    <div className="form-group">
                        <label>Type</label>
                        {isEditing ? (
                            <input
                                type="text"
                                value={editedItem.type}
                                onChange={(e) => setEditedItem({ ...editedItem, type: e.target.value })}
                            />
                        ) : (
                            <div style={{
                                padding: '0.75rem',
                                backgroundColor: '#f8f9fa',
                                borderRadius: '6px',
                                border: '2px solid #dee2e6'
                            }}>
                                {item.type}
                            </div>
                        )}
                    </div>

                    <div className="form-group">
                        <label>Description</label>
                        {isEditing ? (
                            <textarea
                                value={editedItem.description}
                                onChange={(e) => setEditedItem({ ...editedItem, description: e.target.value })}
                                rows={3}
                            />
                        ) : (
                            <div style={{
                                padding: '0.75rem',
                                backgroundColor: '#f8f9fa',
                                borderRadius: '6px',
                                border: '2px solid #dee2e6'
                            }}>
                                {item.description}
                            </div>
                        )}
                    </div>

                    {/* Custom Fields from Template */}
                    {editedTemplate && editedTemplate.fields && editedTemplate.fields.length > 0 && (
                        <>
                            <hr style={{ margin: '1.5rem 0', border: 'none', borderTop: '2px solid #e9ecef' }} />
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                <h4 style={{ margin: 0, color: '#333' }}>Custom Fields</h4>
                                {!isEditing && (
                                    <button
                                        onClick={() => setIsManagingFields(!isManagingFields)}
                                        style={{
                                            padding: '0.5rem 1rem',
                                            backgroundColor: isManagingFields ? '#6c757d' : '#007bff',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            fontSize: '0.9rem'
                                        }}
                                    >
                                        {isManagingFields ? '✓ Done Managing' : '⚙️ Manage Fields'}
                                    </button>
                                )}
                            </div>
                            {editedTemplate.fields.map(field => renderField(field))}
                        </>
                    )}

                    {/* Add New Field Section */}
                    {isManagingFields && (
                        <>
                            <hr style={{ margin: '1.5rem 0', border: 'none', borderTop: '2px solid #e9ecef' }} />
                            <h5 style={{ marginBottom: '0.75rem', color: '#333' }}>Add New Field</h5>
                            
                            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'flex-end' }}>
                                <div style={{ flex: 2 }}>
                                    <label style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.25rem', display: 'block' }}>Field Name</label>
                                    <input
                                        type="text"
                                        placeholder="e.g., population"
                                        value={newFieldInput.fieldName}
                                        onChange={(e) => setNewFieldInput({ ...newFieldInput, fieldName: e.target.value })}
                                        style={{
                                            width: '100%',
                                            padding: '0.5rem',
                                            border: '2px solid #dee2e6',
                                            borderRadius: '6px',
                                            fontSize: '0.9rem'
                                        }}
                                    />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.25rem', display: 'block' }}>Type</label>
                                    <select
                                        value={newFieldInput.fieldType}
                                        onChange={(e) => setNewFieldInput({ ...newFieldInput, fieldType: e.target.value })}
                                        style={{
                                            width: '100%',
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
                            </div>

                            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                                <input
                                    type="text"
                                    placeholder="Description (optional)..."
                                    value={newFieldInput.description}
                                    onChange={(e) => setNewFieldInput({ ...newFieldInput, description: e.target.value })}
                                    style={{
                                        flex: 1,
                                        padding: '0.5rem',
                                        border: '2px solid #dee2e6',
                                        borderRadius: '6px',
                                        fontSize: '0.9rem'
                                    }}
                                />
                                <button
                                    onClick={handleAddField}
                                    style={{
                                        padding: '0.5rem 1rem',
                                        backgroundColor: '#28a745',
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

                            <button
                                onClick={handleSuggestFields}
                                disabled={loadingAI}
                                style={{
                                    width: '100%',
                                    padding: '0.75rem',
                                    backgroundColor: loadingAI ? '#6c757d' : '#17a2b8',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: loadingAI ? 'not-allowed' : 'pointer',
                                    fontSize: '0.9rem',
                                    fontWeight: '600'
                                }}
                            >
                                {loadingAI ? '🤖 Getting AI Suggestions...' : '🤖 Suggest Fields with AI'}
                            </button>
                        </>
                    )}

                    {/* No Template Message */}
                    {(!editedTemplate || !editedTemplate.fields || editedTemplate.fields.length === 0) && (
                        <div style={{
                            padding: '1rem',
                            backgroundColor: '#f8f9fa',
                            borderRadius: '8px',
                            border: '1px solid #dee2e6',
                            color: '#666',
                            textAlign: 'center',
                            marginTop: '1rem'
                        }}>
                            <p style={{ margin: '0 0 1rem 0' }}>This item has no custom fields.</p>
                            <button
                                onClick={() => setIsManagingFields(true)}
                                style={{
                                    padding: '0.5rem 1rem',
                                    backgroundColor: '#007bff',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '0.9rem'
                                }}
                            >
                                + Add Fields
                            </button>
                        </div>
                    )}
                </div>

                <div className="world-modal-actions">
                    {isEditing || isManagingFields ? (
                        <>
                            <button className="world-modal-btn btn-save" onClick={handleSave}>
                                Save Changes
                            </button>
                            <button
                                className="world-modal-btn btn-cancel"
                                onClick={() => {
                                    setEditedItem({
                                        ...item,
                                        customFields: item.customFields || {}
                                    });
                                    setEditedTemplate(template);
                                    setIsEditing(false);
                                    setIsManagingFields(false);
                                }}
                            >
                                Cancel
                            </button>
                        </>
                    ) : (
                        <>
                            <button className="world-modal-btn btn-save" onClick={() => setIsEditing(true)}>
                                Edit
                            </button>
                            <button className="world-modal-btn btn-delete" onClick={handleDelete}>
                                Delete
                            </button>
                            <button className="world-modal-btn btn-cancel" onClick={closeModal}>
                                Close
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ItemDetailsModal;
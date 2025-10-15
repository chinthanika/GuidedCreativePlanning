import React, { useState, useEffect } from 'react';

const NewWorldBuildingModal = ({ isOpen, closeModal, category, categoryConfig, existingItems, parentFirebaseKey, onSave }) => {
    const [formData, setFormData] = useState({
        name: '',
        type: '',
        description: '',
        parentKey: null,
    });

    const [arrayFields, setArrayFields] = useState({
        rules: [],
        limitations: [],
        values: [],
        traditions: [],
        beliefs: [],
        inhabitants: [],
        resources: [],
        features: [],
        requirements: [],
        impact: [],
        artifacts: [],
        power: []
    });

    const [currentInput, setCurrentInput] = useState({});

    // Set parent when modal opens with a parent
    useEffect(() => {
        if (parentFirebaseKey) {
            setFormData(prev => ({ ...prev, parentKey: parentFirebaseKey }));
        }
    }, [parentFirebaseKey]);

    if (!isOpen || !category) return null;

    const config = categoryConfig[category];

    const handleSave = () => {
        if (!formData.name || !formData.type || !formData.description) {
            alert('Name, type, and description are required');
            return;
        }

        const dataToSave = {
            ...formData,
            ...Object.fromEntries(
                Object.entries(arrayFields).filter(([_, value]) => value.length > 0)
            )
        };

        onSave(dataToSave);
        handleClose();
    };

    const handleClose = () => {
        setFormData({
            name: '',
            type: '',
            description: '',
            parentKey: null,
        });
        setArrayFields({
            rules: [],
            limitations: [],
            values: [],
            traditions: [],
            beliefs: [],
            inhabitants: [],
            resources: [],
            features: [],
            requirements: [],
            impact: [],
            artifacts: [],
            power: []
        });
        setCurrentInput({});
        closeModal();
    };

    const addArrayItem = (field) => {
        if (currentInput[field]?.trim()) {
            setArrayFields({
                ...arrayFields,
                [field]: [...arrayFields[field], currentInput[field].trim()]
            });
            setCurrentInput({ ...currentInput, [field]: '' });
        }
    };

    const removeArrayItem = (field, index) => {
        setArrayFields({
            ...arrayFields,
            [field]: arrayFields[field].filter((_, i) => i !== index)
        });
    };

    const renderArrayField = (field, label) => (
        <div className="form-group" key={field}>
            <label>{label}</label>
            <div className="form-array-input">
                <input
                    type="text"
                    value={currentInput[field] || ''}
                    onChange={(e) => setCurrentInput({ ...currentInput, [field]: e.target.value })}
                    onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            addArrayItem(field);
                        }
                    }}
                    placeholder={`Add ${label.toLowerCase()}...`}
                />
                <button 
                    type="button"
                    className="btn-add-array-item" 
                    onClick={() => addArrayItem(field)}
                >
                    +
                </button>
            </div>
            {arrayFields[field].length > 0 && (
                <ul className="array-items-list">
                    {arrayFields[field].map((item, idx) => (
                        <li key={idx} className="array-item">
                            <span>{item}</span>
                            <button 
                                type="button"
                                className="btn-remove-array-item"
                                onClick={() => removeArrayItem(field, idx)}
                            >
                                ×
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );

    return (
        <div className="world-modal-overlay" onClick={handleClose}>
            <div className="world-modal-content" onClick={(e) => e.stopPropagation()}>
                <h3 className="world-modal-header">
                    <span>{config?.icon}</span>
                    New {config?.label || category}
                    {parentFirebaseKey && existingItems[parentFirebaseKey] && (
                        <span style={{ fontSize: '0.8rem', color: '#666', fontWeight: 'normal' }}>
                            {' '}(child of {existingItems[parentFirebaseKey].name})
                        </span>
                    )}
                </h3>

                <div className="world-modal-form">
                    <div className="form-group">
                        <label>Name *</label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            placeholder="Enter name..."
                        />
                    </div>

                    <div className="form-group">
                        <label>Type *</label>
                        <input
                            type="text"
                            value={formData.type}
                            onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                            placeholder="Enter type..."
                        />
                    </div>

                    <div className="form-group">
                        <label>Description *</label>
                        <textarea
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            placeholder="Enter description..."
                            rows={3}
                        />
                    </div>

                    {!parentFirebaseKey && (
                        <div className="form-group">
                            <label>Parent (Optional)</label>
                            <select
                                value={formData.parentKey || ''}
                                onChange={(e) => setFormData({ ...formData, parentKey: e.target.value || null })}
                            >
                                <option value="">-- Root Level --</option>
                                {Object.entries(existingItems || {}).map(([key, item]) => (
                                    <option key={key} value={key}>
                                        {item.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Rest of the category-specific fields remain the same... */}
                    {/* (Keep all the existing category-specific field rendering code) */}
                </div>

                <div className="world-modal-actions">
                    <button className="world-modal-btn btn-save" onClick={handleSave}>
                        Create
                    </button>
                    <button className="world-modal-btn btn-cancel" onClick={handleClose}>
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};

export default NewWorldBuildingModal;
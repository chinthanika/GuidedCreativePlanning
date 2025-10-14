import React, { useState, useEffect } from 'react';

const WorldBuildingDetailsModal = ({ isOpen, closeModal, item, onSave, onDelete, categoryConfig }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editedItem, setEditedItem] = useState(item || {});

    useEffect(() => {
        if (item) {
            setEditedItem(item);
        }
        setIsEditing(false);
    }, [item]);

    if (!isOpen || !item) return null;

    const config = categoryConfig[item.category];
    
    const handleSave = () => {
        onSave(editedItem);
        setIsEditing(false);
    };

    const handleDelete = () => {
        if (window.confirm(`Delete "${item.name}"? This action cannot be undone.`)) {
            onDelete(item);
        }
    };

    const renderField = (label, value, key) => {
        if (!value) return null;

        const isArray = Array.isArray(value);

        return (
            <div className="form-group" key={key}>
                <label>{label}</label>
                {isEditing ? (
                    isArray ? (
                        <textarea
                            value={value.join('\n')}
                            onChange={(e) => setEditedItem({
                                ...editedItem,
                                [key]: e.target.value.split('\n').filter(line => line.trim())
                            })}
                            rows={value.length + 1}
                        />
                    ) : (
                        <input
                            type="text"
                            value={value}
                            onChange={(e) => setEditedItem({
                                ...editedItem,
                                [key]: e.target.value
                            })}
                        />
                    )
                ) : (
                    <div style={{ 
                        padding: '0.75rem', 
                        backgroundColor: '#f8f9fa',
                        borderRadius: '6px',
                        border: '2px solid #dee2e6'
                    }}>
                        {isArray ? (
                            <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
                                {value.map((item, idx) => (
                                    <li key={idx}>{item}</li>
                                ))}
                            </ul>
                        ) : (
                            <span>{value}</span>
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="world-modal-overlay" onClick={closeModal}>
            <div className="world-modal-content" onClick={(e) => e.stopPropagation()}>
                <h3 className="world-modal-header">
                    <span>{config?.icon}</span>
                    {item.name}
                </h3>

                <div className="world-modal-form">
                    {renderField('Name', editedItem.name, 'name')}
                    {renderField('Type', editedItem.type, 'type')}
                    {renderField('Description', editedItem.description, 'description')}
                    
                    {/* Category-specific fields */}
                    {item.category === 'magicSystems' && (
                        <>
                            {renderField('Rules', editedItem.rules, 'rules')}
                            {renderField('Limitations', editedItem.limitations, 'limitations')}
                            {renderField('Costs', editedItem.costs, 'costs')}
                        </>
                    )}

                    {item.category === 'cultures' && (
                        <>
                            {renderField('Values', editedItem.values, 'values')}
                            {renderField('Traditions', editedItem.traditions, 'traditions')}
                            {renderField('Hierarchy', editedItem.hierarchy, 'hierarchy')}
                            {renderField('Beliefs', editedItem.beliefs, 'beliefs')}
                            {renderField('Language', editedItem.language, 'language')}
                        </>
                    )}

                    {item.category === 'locations' && (
                        <>
                            {renderField('Climate', editedItem.climate, 'climate')}
                            {renderField('Geography', editedItem.geography, 'geography')}
                            {renderField('Inhabitants', editedItem.inhabitants, 'inhabitants')}
                            {renderField('Resources', editedItem.resources, 'resources')}
                            {renderField('Danger Level', editedItem.dangerLevel, 'dangerLevel')}
                            {renderField('Purpose', editedItem.purpose, 'purpose')}
                            {renderField('Features', editedItem.features, 'features')}
                        </>
                    )}

                    {item.category === 'technology' && (
                        <>
                            {renderField('How It Works', editedItem.howItWorks, 'howItWorks')}
                            {renderField('Requirements', editedItem.requirements, 'requirements')}
                            {renderField('Limitations', editedItem.limitations, 'limitations')}
                            {renderField('Social Impact', editedItem.socialImpact, 'socialImpact')}
                        </>
                    )}

                    {item.category === 'history' && (
                        <>
                            {renderField('Timeframe', editedItem.timeframe, 'timeframe')}
                            {renderField('Cause', editedItem.cause, 'cause')}
                            {renderField('Outcome', editedItem.outcome, 'outcome')}
                            {renderField('Impact', editedItem.impact, 'impact')}
                            {renderField('Artifacts', editedItem.artifacts, 'artifacts')}
                        </>
                    )}

                    {item.category === 'organizations' && (
                        <>
                            {renderField('Founded', editedItem.founded, 'founded')}
                            {renderField('Purpose', editedItem.purpose, 'purpose')}
                            {renderField('Structure', editedItem.structure, 'structure')}
                            {renderField('Power', editedItem.power, 'power')}
                            {renderField('Headquarters', editedItem.headquarters, 'headquarters')}
                        </>
                    )}
                </div>

                <div className="world-modal-actions">
                    {isEditing ? (
                        <>
                            <button className="world-modal-btn btn-save" onClick={handleSave}>
                                Save Changes
                            </button>
                            <button className="world-modal-btn btn-cancel" onClick={() => {
                                setEditedItem(item);
                                setIsEditing(false);
                            }}>
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

export default WorldBuildingDetailsModal;
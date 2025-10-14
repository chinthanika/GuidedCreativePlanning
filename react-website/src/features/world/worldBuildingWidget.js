import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuthValue } from '../../Firebase/AuthContext';
import WorldBuildingDetailsModal from '../../components/world/worldBuildingDetailsModal';
// import NewWorldBuildingModal from './NewWorldBuildingModal';
// import RenameWorldModal from './RenameWorldModal';

import './worldbuilding.css';

const WorldBuildingWidget = () => {
    const { currentUser } = useAuthValue();
    const userId = currentUser ? currentUser.uid : null;
    const API_BASE = "http://localhost:5001/api";

    const [worldName, setWorldName] = useState("World");
    const [categories, setCategories] = useState({});
    const [expandedCategory, setExpandedCategory] = useState(null);
    const [expandedItems, setExpandedItems] = useState({});
    const [draggedItem, setDraggedItem] = useState(null);
    const [dragOverItem, setDragOverItem] = useState(null);
    
    const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
    const [isNewItemModalOpen, setIsNewItemModalOpen] = useState(false);
    const [isRenameWorldModalOpen, setIsRenameWorldModalOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);
    const [selectedCategory, setSelectedCategory] = useState(null);
    
    const [loading, setLoading] = useState(false);
    const [toast, setToast] = useState(null);

    const categoryConfig = {
        magicSystems: { label: 'Magic Systems', icon: '🔮', color: '#9b59b6' },
        cultures: { label: 'Cultures', icon: '🏛️', color: '#3498db' },
        locations: { label: 'Locations', icon: '📍', color: '#27ae60' },
        technology: { label: 'Technology', icon: '⚙️', color: '#e67e22' },
        history: { label: 'History', icon: '📜', color: '#c0392b' },
        organizations: { label: 'Organizations', icon: '🏢', color: '#16a085' }
    };

    // Toast helper
    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    // Fetch world name and all categories
    useEffect(() => {
        if (!userId) return;
        fetchWorldData();
    }, [userId]);

    const fetchWorldData = async () => {
        try {
            setLoading(true);
            
            // Fetch world metadata
            const worldResponse = await axios.get(`${API_BASE}/world-metadata`, {
                params: { userId }
            });
            setWorldName(worldResponse.data.name || "World");

            // Fetch all categories
            const categoriesData = {};
            for (const [key, config] of Object.entries(categoryConfig)) {
                const response = await axios.get(`${API_BASE}/worldbuilding/${key}`, {
                    params: { userId }
                });
                categoriesData[key] = response.data;
            }
            setCategories(categoriesData);
        } catch (error) {
            console.error("Error fetching world data:", error);
            showToast("Failed to load world data", "error");
        } finally {
            setLoading(false);
        }
    };

    // Toggle category expansion (only one at a time)
    const toggleCategory = (categoryKey) => {
        setExpandedCategory(expandedCategory === categoryKey ? null : categoryKey);
    };

    // Toggle item expansion
    const toggleItem = (itemId) => {
        setExpandedItems(prev => ({
            ...prev,
            [itemId]: !prev[itemId]
        }));
    };

    // Drag and drop handlers
    const handleDragStart = (e, item, category) => {
        setDraggedItem({ item, category });
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e, targetItem, targetCategory) => {
        e.preventDefault();
        setDragOverItem({ item: targetItem, category: targetCategory });
    };

    const handleDragLeave = () => {
        setDragOverItem(null);
    };

    const handleDrop = async (e, targetItem, targetCategory) => {
        e.preventDefault();
        
        if (!draggedItem || draggedItem.category !== targetCategory) {
            setDraggedItem(null);
            setDragOverItem(null);
            return;
        }

        const newParentId = targetItem ? targetItem.id : null;
        
        if (draggedItem.item.id === newParentId) {
            showToast("Cannot make an item its own parent", "error");
            setDraggedItem(null);
            setDragOverItem(null);
            return;
        }

        try {
            await axios.post(`${API_BASE}/worldbuilding/update`, {
                userId,
                category: targetCategory,
                itemId: draggedItem.item.id,
                updates: { parentId: newParentId }
            });

            fetchWorldData();
            showToast("Item moved successfully!", "success");
        } catch (error) {
            console.error("Error moving item:", error);
            showToast("Failed to move item", "error");
        }

        setDraggedItem(null);
        setDragOverItem(null);
    };

    // Modal handlers
    const handleItemClick = (item, category) => {
        setSelectedItem({ ...item, category });
        setIsDetailsModalOpen(true);
    };

    const handleAddItem = (category) => {
        setSelectedCategory(category);
        setIsNewItemModalOpen(true);
    };

    const handleSaveNewItem = async (newItem) => {
        try {
            const itemData = {
                ...newItem,
                parentId: newItem.parentId || null
            };

            await axios.post(`${API_BASE}/worldbuilding/create`, {
                userId,
                category: selectedCategory,
                data: itemData
            });

            fetchWorldData();
            setIsNewItemModalOpen(false);
            showToast("Item created successfully!", "success");
        } catch (error) {
            console.error("Error creating item:", error);
            showToast("Failed to create item", "error");
        }
    };

    const handleSaveEditedItem = async (updatedItem) => {
        try {
            await axios.post(`${API_BASE}/worldbuilding/update`, {
                userId,
                category: updatedItem.category,
                itemId: updatedItem.id,
                updates: updatedItem
            });

            fetchWorldData();
            setIsDetailsModalOpen(false);
            showToast("Item updated successfully!", "success");
        } catch (error) {
            console.error("Error updating item:", error);
            showToast("Failed to update item", "error");
        }
    };

    const handleDeleteItem = async (item) => {
        if (!window.confirm(`Delete "${item.name}"? This will also delete all child items.`)) {
            return;
        }

        try {
            await axios.post(`${API_BASE}/worldbuilding/delete`, {
                userId,
                category: item.category,
                itemId: item.id
            });

            fetchWorldData();
            setIsDetailsModalOpen(false);
            showToast("Item deleted successfully!", "success");
        } catch (error) {
            console.error("Error deleting item:", error);
            showToast("Failed to delete item", "error");
        }
    };

    const handleSaveWorldName = async (newName) => {
        try {
            await axios.post(`${API_BASE}/world-metadata`, {
                userId,
                name: newName
            });

            setWorldName(newName);
            setIsRenameWorldModalOpen(false);
            showToast("World name updated!", "success");
        } catch (error) {
            console.error("Error updating world name:", error);
            showToast("Failed to update world name", "error");
        }
    };

    // Build tree structure for a category
    const buildTree = (categoryKey) => {
        const items = categories[categoryKey] || {};
        const itemsArray = Object.values(items);
        
        // Get root items (no parent)
        const rootItems = itemsArray.filter(item => !item.parentId || item.parentId === null);
        
        // Recursive function to build children
        const getChildren = (parentId) => {
            return itemsArray.filter(item => item.parentId === parentId);
        };

        return { rootItems, getChildren };
    };

    // Render tree item
    const renderTreeItem = (item, category, level = 0) => {
        const { getChildren } = buildTree(category);
        const children = getChildren(item.id);
        const hasChildren = children.length > 0;
        const isExpanded = expandedItems[item.id];
        const isDragging = draggedItem?.item.id === item.id;
        const isDragOver = dragOverItem?.item?.id === item.id;

        return (
            <div key={item.id} className="tree-item-container">
                <div
                    className={`tree-item ${isDragging ? 'dragging' : ''} ${isDragOver ? 'drag-over' : ''}`}
                    style={{ marginLeft: `${level * 20}px` }}
                    draggable
                    onDragStart={(e) => handleDragStart(e, item, category)}
                    onDragOver={(e) => handleDragOver(e, item, category)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, item, category)}
                    onClick={() => handleItemClick(item, category)}
                >
                    {hasChildren && (
                        <button
                            className="expand-btn"
                            onClick={(e) => {
                                e.stopPropagation();
                                toggleItem(item.id);
                            }}
                        >
                            {isExpanded ? '▼' : '▶'}
                        </button>
                    )}
                    <div className="tree-item-content">
                        <span className="tree-item-name">{item.name}</span>
                        {item.description && (
                            <span className="tree-item-preview">{item.description.substring(0, 50)}...</span>
                        )}
                    </div>
                </div>
                
                {isExpanded && hasChildren && (
                    <div className="tree-children">
                        {children.map(child => renderTreeItem(child, category, level + 1))}
                    </div>
                )}
            </div>
        );
    };

    if (loading) {
        return (
            <div className="loading-container">
                <div className="spinner"></div>
                <p>Loading world data...</p>
            </div>
        );
    }

    return (
        <div className="worldbuilding-container">
            {toast && (
                <div className={`toast toast-${toast.type}`}>
                    <span className="toast-icon">
                        {toast.type === 'success' ? '✓' : '✕'}
                    </span>
                    <span className="toast-message">{toast.message}</span>
                </div>
            )}

            <div className="world-header">
                <div className="world-title">
                    <h2>📖 {worldName}</h2>
                    <button
                        className="btn-rename-world"
                        onClick={() => setIsRenameWorldModalOpen(true)}
                    >
                        Rename
                    </button>
                </div>
            </div>

            <div className="world-tree">
                {Object.entries(categoryConfig).map(([key, config]) => {
                    const { rootItems } = buildTree(key);
                    const itemCount = Object.keys(categories[key] || {}).length;
                    const isExpanded = expandedCategory === key;

                    return (
                        <div key={key} className="category-section">
                            <div
                                className="category-header"
                                onClick={() => toggleCategory(key)}
                                style={{ borderLeftColor: config.color }}
                            >
                                <div className="category-title">
                                    <span className="category-icon">{config.icon}</span>
                                    <span className="category-label">{config.label}</span>
                                    <span className="category-count">({itemCount})</span>
                                </div>
                                <div className="category-actions">
                                    <button
                                        className="btn-add-item"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleAddItem(key);
                                        }}
                                    >
                                        +
                                    </button>
                                    <span className="expand-indicator">
                                        {isExpanded ? '▼' : '▶'}
                                    </span>
                                </div>
                            </div>

                            {isExpanded && (
                                <div className="category-content">
                                    {rootItems.length === 0 ? (
                                        <div className="empty-category">
                                            <p>No items yet. Click + to add one!</p>
                                        </div>
                                    ) : (
                                        <div
                                            className="tree-drop-zone"
                                            onDragOver={(e) => handleDragOver(e, null, key)}
                                            onDrop={(e) => handleDrop(e, null, key)}
                                        >
                                            {rootItems.map(item => renderTreeItem(item, key, 0))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <WorldBuildingDetailsModal
                isOpen={isDetailsModalOpen}
                closeModal={() => setIsDetailsModalOpen(false)}
                item={selectedItem}
                onSave={handleSaveEditedItem}
                onDelete={handleDeleteItem}
                categoryConfig={categoryConfig}
            />

            {/*<NewWorldBuildingModal
                isOpen={isNewItemModalOpen}
                closeModal={() => setIsNewItemModalOpen(false)}
                category={selectedCategory}
                categoryConfig={categoryConfig}
                existingItems={categories[selectedCategory] || {}}
                onSave={handleSaveNewItem}
            />

            <RenameWorldModal
                isOpen={isRenameWorldModalOpen}
                closeModal={() => setIsRenameWorldModalOpen(false)}
                currentName={worldName}
                onSave={handleSaveWorldName}
            />
            */}
        </div> 
    );
};

export default WorldBuildingWidget;
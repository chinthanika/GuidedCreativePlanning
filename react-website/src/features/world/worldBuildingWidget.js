import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuthValue } from '../../Firebase/AuthContext';
import WorldBuildingDetailsModal from '../../components/world/worldBuildingDetailsModal';
import NewWorldBuildingModal from '../../components/world/newWorldBuildingModal';
import RenameWorldModal from '../../components/world/renameWorldModal';

import './worldbuilding.css';

const WorldBuildingWidget = () => {
    const { currentUser } = useAuthValue();
    const userId = currentUser ? currentUser.uid : null;
    const API_BASE = "http://localhost:5001/api";

    const [worldName, setWorldName] = useState("World");
    const [categories, setCategories] = useState({});
    const [navigationPath, setNavigationPath] = useState([]);

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

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    useEffect(() => {
        if (!userId) return;
        fetchWorldData();
    }, [userId]);

    const fetchWorldData = async () => {
        try {
            setLoading(true);

            const worldResponse = await axios.get(`${API_BASE}/world-metadata`, {
                params: { userId }
            });
            setWorldName(worldResponse.data.name || "World");

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

    // ============================================
    // GET CURRENT LEVEL (Updated to use firebaseKey)
    // ============================================
    const getCurrentLevel = () => {
        if (navigationPath.length === 0) return { type: 'root', data: null };

        const lastPath = navigationPath[navigationPath.length - 1];
        if (lastPath.type === 'category') {
            return { type: 'category', categoryKey: lastPath.key, data: lastPath };
        }

        const { categoryKey, firebaseKey } = lastPath;
        const categoryData = categories[categoryKey] || {};
        const item = categoryData[firebaseKey];  // Direct access using firebaseKey!

        return {
            type: 'item',
            categoryKey,
            firebaseKey,
            data: item ? { ...item, firebaseKey } : undefined  // Add firebaseKey to data
        };
    };;

    // ============================================
    // GET CHILDREN (Updated to use parentKey)
    // ============================================
    const getChildrenForCurrentLevel = () => {
        const current = getCurrentLevel();

        if (current.type === 'root') {
            return Object.entries(categoryConfig).map(([key, config]) => ({
                id: key,
                name: config.label,
                icon: config.icon,
                color: config.color,
                type: 'category',
                count: Object.keys(categories[key] || {}).length
            }));
        }

        if (current.type === 'category') {
            const categoryData = categories[current.categoryKey] || {};
            // Get items with no parent (root level items)
            const items = Object.entries(categoryData)
                .filter(([_, item]) => !item?.parentKey)
                .map(([firebaseKey, item]) => ({
                    ...item,
                    firebaseKey,  // Include the Firebase key
                    type: 'item',
                    categoryKey: current.categoryKey
                }));
            return items;
        }

        if (current.type === 'item') {
            const { categoryKey, firebaseKey } = current;
            const categoryData = categories[categoryKey] || {};
            // Get children where parentKey matches current item's firebaseKey
            const children = Object.entries(categoryData)
                .filter(([_, item]) => item?.parentKey === firebaseKey)
                .map(([childKey, item]) => ({
                    ...item,
                    firebaseKey: childKey,  // Include the Firebase key
                    type: 'item',
                    categoryKey
                }));
            return children;
        }

        return [];
    };

    // ============================================
    // NAVIGATE TO ITEM (Updated to use firebaseKey)
    // ============================================
    const handleNavigateToItem = (node) => {
        if (node.type === 'category') {
            setNavigationPath([...navigationPath, { type: 'category', key: node.id }]);
        } else if (node.type === 'item') {
            setNavigationPath([...navigationPath, {
                type: 'item',
                categoryKey: node.categoryKey,
                firebaseKey: node.firebaseKey  // Use firebaseKey instead of itemId
            }]);
        }
    };

    const handleBreadcrumbClick = (index) => {
        setNavigationPath(navigationPath.slice(0, index));
    };

    const handleGoHome = () => {
        setNavigationPath([]);
    };

    const handleItemClick = (item, category) => {
        setSelectedItem({
            ...item,
            category,
            firebaseKey: item.firebaseKey  // Make sure firebaseKey is included
        });
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
                parentKey: newItem.parentKey || null  // Use parentKey instead of parentId
            };

            // Remove the id field if it exists - we don't need it anymore
            delete itemData.id;

            // Let the backend generate the Firebase key
            const response = await axios.post(`${API_BASE}/worldbuilding/update`, {
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

    // ============================================
    // SAVE EDITED ITEM
    // ============================================
    const handleSaveEditedItem = async (updatedItem) => {
        try {
            const itemData = { ...updatedItem };
            delete itemData.firebaseKey;  // Don't include key in data
            delete itemData.category;     // Don't include category in data

            await axios.post(`${API_BASE}/worldbuilding/update`, {
                userId,
                category: updatedItem.category,
                firebaseKey: updatedItem.firebaseKey,
                data: itemData
            });

            fetchWorldData();
            setIsDetailsModalOpen(false);
            showToast("Item updated successfully!", "success");
        } catch (error) {
            console.error("Error updating item:", error);
            showToast("Failed to update item", "error");
        }
    };

    // ============================================
    // DELETE ITEM
    // ============================================
    const handleDeleteItem = async (item) => {
        if (!window.confirm(`Delete "${item.name}"? This will also delete all child items.`)) {
            return;
        }

        try {
            await axios.post(`${API_BASE}/worldbuilding/delete`, {
                userId,
                category: item.category,
                firebaseKey: item.firebaseKey
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

    if (loading) {
        return (
            <div className="loading-container">
                <div className="spinner"></div>
                <p>Loading world data...</p>
            </div>
        );
    }

    const current = getCurrentLevel();
    const children = getChildrenForCurrentLevel();
    const config = current.type === 'item' ? categoryConfig[current.categoryKey] : null;
    return (
        <div className="world-hierarchical-container">
            {toast && (
                <div className={`toast toast-${toast.type}`}>
                    <span className="toast-icon">
                        {toast.type === 'success' ? '[PASS]' : '✕'}
                    </span>
                    <span className="toast-message">{toast.message}</span>
                </div>
            )}

            <div className="world-hierarchical-header">
                <div className="world-hierarchical-title">
                    <h1>📖 {worldName}</h1>
                    <button
                        className="btn-rename-world"
                        onClick={() => setIsRenameWorldModalOpen(true)}
                    >
                        Rename
                    </button>
                </div>

                {navigationPath.length > 0 && (
                    <div className="world-breadcrumb">
                        <button onClick={handleGoHome} className="breadcrumb-item">
                            📖 {worldName}
                        </button>
                        {navigationPath.map((path, idx) => {
                            let displayName = 'Unknown';

                            if (path.type === 'category') {
                                displayName = categoryConfig[path.key]?.label || 'Unknown Category';
                            } else if (path.type === 'item') {
                                // Direct access using firebaseKey
                                const categoryData = categories[path.categoryKey] || {};
                                const item = categoryData[path.firebaseKey];
                                displayName = item?.name || 'Unknown Item';
                            }

                            return (
                                <React.Fragment key={idx}>
                                    <span className="breadcrumb-separator">→</span>
                                    <button
                                        onClick={() => handleBreadcrumbClick(idx + 1)}
                                        className="breadcrumb-item"
                                    >
                                        {displayName}
                                    </button>
                                </React.Fragment>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="world-hierarchical-content">
                <div className="world-focus-area">
                    {current.type === 'root' && (
                        <div className="world-root-card">
                            <h2>{worldName}</h2>
                            <p>World Root</p>
                        </div>
                    )}

                    {current.type === 'category' && (
                        <div className="world-focus-card" style={{ borderColor: categoryConfig[current.categoryKey].color }}>
                            <span className="world-focus-icon">{categoryConfig[current.categoryKey].icon}</span>
                            <h2>{categoryConfig[current.categoryKey].label}</h2>
                            <p>{children.length} items</p>
                        </div>
                    )}

                    {current.type === 'item' && (
                        <div className="world-focus-card" style={{ borderColor: config.color }}>
                            <span className="world-focus-icon">{config.icon}</span>
                            <h2>{current.data.name}</h2>
                            <p className="world-focus-type">{current.data.type}</p>
                            <p className="world-focus-description">{current.data.description}</p>
                            {children.length > 0 && (
                                <p className="world-focus-children">{children.length} sub-items</p>
                            )}
                            <div className="world-focus-buttons">
                                <button
                                    className="btn-edit-focus"
                                    onClick={() => handleItemClick(current.data, current.categoryKey)}
                                >
                                    Edit Details
                                </button>
                                <button
                                    className="btn-add-new-item"
                                    onClick={() => {
                                        setSelectedCategory(current.categoryKey);
                                        setIsNewItemModalOpen(true);
                                    }}
                                >
                                    + New Item
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {children.length > 0 && (
                    <div className="world-children-area">
                        <p className="world-children-label">
                            {current.type === 'root' ? 'Categories' : 'Items'}
                        </p>
                        <div className="world-children-grid">
                            {children.map((child, idx) => {
                                const itemConfig = child.type === 'category'
                                    ? categoryConfig[child.id]
                                    : categoryConfig[child.categoryKey];

                                return (
                                    <div
                                        key={child.id}
                                        onClick={() => handleNavigateToItem(child)}
                                        className="world-child-card"
                                        style={{ borderColor: itemConfig.color, animationDelay: `${idx * 0.05}s` }}
                                    >
                                        <span className="world-child-icon">{itemConfig.icon}</span>
                                        <h3>{child.name}</h3>
                                        {child.type === 'category' && (
                                            <p>{child.count} items</p>
                                        )}
                                        {child.type === 'item' && (
                                            <>
                                                <p className="world-child-type">{child.type}</p>
                                                {child.count !== undefined && (
                                                    <p className="world-child-meta">{child.count} sub-items</p>
                                                )}
                                            </>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {children.length === 0 && current.type !== 'root' && (
                    <div className="world-empty-state">
                        <p>No items here yet</p>
                        {current.type === 'category' && (
                            <button
                                className="btn-add-first"
                                onClick={() => handleAddItem(current.categoryKey)}
                            >
                                + Add Item
                            </button>
                        )}
                    </div>
                )}
            </div>

            <WorldBuildingDetailsModal
                isOpen={isDetailsModalOpen}
                closeModal={() => setIsDetailsModalOpen(false)}
                item={selectedItem}
                onSave={handleSaveEditedItem}
                onDelete={handleDeleteItem}
                categoryConfig={categoryConfig}
            />

            <NewWorldBuildingModal
                isOpen={isNewItemModalOpen}
                closeModal={() => setIsNewItemModalOpen(false)}
                category={selectedCategory}
                categoryConfig={categoryConfig}
                existingItems={categories[selectedCategory] || {}}
                parentFirebaseKey={current.type === 'item' ? current.firebaseKey : null}  // Add this line
                onSave={handleSaveNewItem}
            />

            <RenameWorldModal
                isOpen={isRenameWorldModalOpen}
                closeModal={() => setIsRenameWorldModalOpen(false)}
                currentName={worldName}
                onSave={handleSaveWorldName}
            />
        </div>
    );
};

export default WorldBuildingWidget;
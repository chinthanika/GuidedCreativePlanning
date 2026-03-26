import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useAuthValue } from '../../Firebase/AuthContext';
import ItemDetailsModal from '../../components/world/ItemDetailsModal';
import NewItemModal from '../../components/world/newItemModal';
import {
  logToolEntry,
  logToolExit,
  logWorldTemplateRequest,
  logWorldItemCreated,
  logWorldItemEdited,
} from '../../utils/analytics';
import './worldbuilding.css';

const WorldBuildingWidget = () => {
    const { currentUser } = useAuthValue();
    const userId = currentUser ? currentUser.uid : null;

    const PROFILE_MANAGER_URL = process.env.REACT_APP_PROFILE_MANAGER_URL
        || "https://guidedcreativeplanning-pfm.onrender.com";

    const [worldMetadata, setWorldMetadata] = useState(null);
    const [items, setItems] = useState({});
    const [templates, setTemplates] = useState({});
    const [navigationPath, setNavigationPath] = useState([]);

    const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
    const [isNewItemModalOpen, setIsNewItemModalOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);

    const [loading, setLoading] = useState(false);
    const [toast, setToast] = useState(null);

    // Cross-feature session tracking
    const entryTimestampRef = useRef(null);

    useEffect(() => {
        if (!userId) return;

        // Log tool entry for cross-feature journey tracking
        logToolEntry(userId, 'worldAI', 'joint_construction').then(ts => {
            entryTimestampRef.current = ts;
        });

        fetchWorldData();

        // Log exit on unmount / navigation away
        return () => {
            if (entryTimestampRef.current) {
                logToolExit(userId, 'worldAI', 'joint_construction', entryTimestampRef.current);
            }
        };
    }, [userId]);

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const fetchWorldData = async () => {
        try {
            setLoading(true);

            const [metaResponse, itemsResponse, templatesResponse] = await Promise.all([
                axios.get(`${PROFILE_MANAGER_URL}/api/world/metadata`, { params: { userId } }),
                axios.get(`${PROFILE_MANAGER_URL}/api/world/items`, { params: { userId } }),
                axios.get(`${PROFILE_MANAGER_URL}/api/world/templates`, { params: { userId } }),
            ]);

            setWorldMetadata(metaResponse.data);
            setItems(itemsResponse.data || {});
            setTemplates(templatesResponse.data || {});
        } catch (error) {
            console.error("Error fetching world data:", error);
            showToast("Failed to load world data", "error");
        } finally {
            setLoading(false);
        }
    };

    const getCurrentItem = () => {
        if (navigationPath.length === 0) {
            return worldMetadata?.rootId ? items[worldMetadata.rootId] : null;
        }
        const lastId = navigationPath[navigationPath.length - 1];
        return items[lastId];
    };

    const getChildren = () => {
        const currentKey = navigationPath.length === 0
            ? worldMetadata?.rootId
            : navigationPath[navigationPath.length - 1];

        return Object.entries(items)
            .filter(([_, item]) => item?.parentId === currentKey)
            .map(([key, item]) => ({ ...item, firebaseKey: key }));
    };

    const handleNavigateToItem = (itemId) => {
        setNavigationPath([...navigationPath, itemId]);
    };

    const handleBreadcrumbClick = (index) => {
        setNavigationPath(navigationPath.slice(0, index));
    };

    const handleGoHome = () => {
        setNavigationPath([]);
    };

    const handleItemClick = (item) => {
        setSelectedItem(item);
        setIsDetailsModalOpen(true);
    };

    const handleAddItem = () => {
        setIsNewItemModalOpen(true);
    };

    // ─── Save new item ────────────────────────────────────────────────────────

    /**
     * Called by NewItemModal with the item data, chosen template, and analytics
     * context that the modal gathered during the creation flow.
     *
     * NewItemModal must pass an extra `analyticsContext` object:
     * {
     *   templateChoice: 'ai'|'manual'|'inherit'|'none',
     *   fieldsSuggested: number,
     *   fieldsAccepted: number,
     *   fieldsAddedManually: number,
     * }
     */
    const handleSaveNewItem = async (newItem, template, analyticsContext = {}) => {
        try {
            const currentKey = navigationPath.length === 0
                ? worldMetadata?.rootId
                : navigationPath[navigationPath.length - 1];

            const itemData = {
                ...newItem,
                parentId: currentKey || null,
                templateId: null
            };

            const itemResponse = await axios.post(`${PROFILE_MANAGER_URL}/api/world/items`, {
                userId,
                data: itemData
            });

            const newItemKey = itemResponse.data.firebaseKey;

            if (template && !template.firebaseKey) {
                const templateResponse = await axios.post(`${PROFILE_MANAGER_URL}/api/world/templates`, {
                    userId,
                    data: { ...template, createdFor: newItemKey }
                });

                await axios.put(`${PROFILE_MANAGER_URL}/api/world/items/${newItemKey}`, {
                    userId,
                    data: { ...itemData, templateId: templateResponse.data.firebaseKey }
                });
            }

            // ── Analytics: item created ──
            const { templateChoice = 'none', fieldsSuggested = 0, fieldsAccepted = 0, fieldsAddedManually = 0 } = analyticsContext;
            const customFields = newItem.customFields || {};
            const totalFields = Object.keys(customFields).length;
            const filledFields = Object.values(customFields).filter(v =>
                v !== '' && v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)
            ).length;

            logWorldItemCreated(
                userId,
                newItem.type || 'unknown',
                templateChoice,
                fieldsSuggested,
                fieldsAccepted,
                fieldsAddedManually,
                filledFields,
                totalFields
            );
            // ────────────────────────────

            fetchWorldData();
            setIsNewItemModalOpen(false);
            showToast("Item created successfully!", "success");
        } catch (error) {
            console.error("Error creating item:", error);
            showToast(error.response?.data?.error || "Failed to create item", "error");
        }
    };

    // ─── Save edited item ─────────────────────────────────────────────────────

    /**
     * Called by ItemDetailsModal.
     * analyticsContext (optional):
     * {
     *   fieldsAdded: number,
     *   fieldsRemoved: number,
     * }
     */
    const handleSaveEditedItem = async (updatedItem, updatedTemplate, analyticsContext = {}) => {
        try {
            const { firebaseKey, ...itemData } = updatedItem;

            await axios.put(`${PROFILE_MANAGER_URL}/api/world/items/${firebaseKey}`, {
                userId,
                data: itemData
            });

            if (updatedTemplate) {
                if (updatedTemplate.firebaseKey) {
                    await axios.put(`${PROFILE_MANAGER_URL}/api/world/templates/${updatedTemplate.firebaseKey}`, {
                        userId,
                        data: updatedTemplate
                    });
                } else {
                    const templateResponse = await axios.post(`${PROFILE_MANAGER_URL}/api/world/templates`, {
                        userId,
                        data: { ...updatedTemplate, createdFor: firebaseKey }
                    });

                    await axios.put(`${PROFILE_MANAGER_URL}/api/world/items/${firebaseKey}`, {
                        userId,
                        data: { ...itemData, templateId: templateResponse.data.firebaseKey }
                    });
                }
            }

            // ── Analytics: item edited ──
            const { fieldsAdded = 0, fieldsRemoved = 0 } = analyticsContext;
            const customFields = updatedItem.customFields || {};
            const totalFields = Object.keys(customFields).length;
            const filledFields = Object.values(customFields).filter(v =>
                v !== '' && v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)
            ).length;

            logWorldItemEdited(
                userId,
                updatedItem.type || 'unknown',
                fieldsAdded,
                fieldsRemoved,
                filledFields,
                totalFields
            );
            // ───────────────────────────

            fetchWorldData();
            setIsDetailsModalOpen(false);
            showToast("Item updated successfully!", "success");
        } catch (error) {
            console.error("Error updating item:", error);
            showToast(error.response?.data?.error || "Failed to update item", "error");
        }
    };

    const handleDeleteItem = async (item) => {
        if (!window.confirm(`Delete "${item.name}"? This will also delete all child items.`)) return;

        try {
            await axios.delete(`${PROFILE_MANAGER_URL}/api/world/items/${item.firebaseKey}`, {
                params: { userId }
            });

            fetchWorldData();
            setIsDetailsModalOpen(false);
            showToast("Item deleted successfully!", "success");
        } catch (error) {
            console.error("Error deleting item:", error);
            showToast(error.response?.data?.error || "Failed to delete item", "error");
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

    const currentItem = getCurrentItem();
    const children = getChildren();

    return (
        <div className="world-hierarchical-container">
            {toast && (
                <div className={`toast toast-${toast.type}`}>
                    <span className="toast-message">{toast.message}</span>
                </div>
            )}

            <div className="world-hierarchical-header">
                <div className="world-hierarchical-title">
                    <h1>📖 {worldMetadata?.name || "Loading..."}</h1>
                </div>

                {navigationPath.length > 0 && (
                    <div className="world-breadcrumb">
                        <button onClick={handleGoHome} className="breadcrumb-item">
                            📖 {worldMetadata?.name}
                        </button>
                        {navigationPath.map((itemId, idx) => {
                            const item = items[itemId];
                            return (
                                <React.Fragment key={idx}>
                                    <span className="breadcrumb-separator">→</span>
                                    <button
                                        onClick={() => handleBreadcrumbClick(idx + 1)}
                                        className="breadcrumb-item"
                                    >
                                        {item?.name || 'Unknown'}
                                    </button>
                                </React.Fragment>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="world-hierarchical-content">
                <div className="world-focus-area">
                    {currentItem && (
                        <div className="world-focus-card">
                            <h2>{currentItem.name}</h2>
                            <p className="world-focus-type">{currentItem.type}</p>
                            <p className="world-focus-description">{currentItem.description}</p>
                            {children.length > 0 && (
                                <p className="world-focus-children">{children.length} sub-items</p>
                            )}
                            <div className="world-focus-buttons">
                                <button
                                    className="btn-edit-focus"
                                    onClick={() => handleItemClick({
                                        ...currentItem,
                                        firebaseKey: navigationPath.length === 0
                                            ? worldMetadata?.rootId
                                            : navigationPath[navigationPath.length - 1]
                                    })}
                                >
                                    View Details
                                </button>
                                <button className="btn-add-new-item" onClick={handleAddItem}>
                                    + New Item
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {children.length > 0 && (
                    <div className="world-children-area">
                        <p className="world-children-label">Items</p>
                        <div className="world-children-grid">
                            {children.map((child, idx) => (
                                <div
                                    key={child.firebaseKey}
                                    onClick={() => handleNavigateToItem(child.firebaseKey)}
                                    className="world-child-card"
                                    style={{ animationDelay: `${idx * 0.05}s` }}
                                >
                                    <h3>{child.name}</h3>
                                    <p className="world-child-type">{child.type}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {children.length === 0 && (
                    <div className="world-empty-state">
                        <p>No items here yet</p>
                        <button className="btn-add-first" onClick={handleAddItem}>
                            + Add Item
                        </button>
                    </div>
                )}
            </div>

            <ItemDetailsModal
                isOpen={isDetailsModalOpen}
                closeModal={() => setIsDetailsModalOpen(false)}
                item={selectedItem}
                template={selectedItem?.templateId ? templates[selectedItem.templateId] : null}
                onSave={handleSaveEditedItem}
                onDelete={handleDeleteItem}
                userId={userId}
            />

            <NewItemModal
                isOpen={isNewItemModalOpen}
                closeModal={() => setIsNewItemModalOpen(false)}
                parentItem={currentItem}
                parentTemplate={currentItem?.templateId ? templates[currentItem.templateId] : null}
                existingItems={items}
                templates={templates}
                onSave={handleSaveNewItem}
                apiBase={PROFILE_MANAGER_URL}
                userId={userId}
            />
        </div>
    );
};

export default WorldBuildingWidget;
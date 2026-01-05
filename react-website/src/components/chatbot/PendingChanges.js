import React, { useEffect, useState } from "react";
import { X, Clock, Check, XCircle, Edit } from "lucide-react";
import "./PendingChanges.css";

const API_BASE = "https://guidedcreativeplanning-pfm.onrender.com/api";

const PendingChanges = ({ userId, isVisible, onToggle }) => {
  const [changes, setChanges] = useState({});
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});

  const fetchPending = async () => {
    if (!userId) return;
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/pending-changes?userId=${userId}`);
      const data = await res.json();
      console.log(data);
      setChanges(data || {});
    } catch (err) {
      console.error("Failed to fetch pending changes:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!userId || !isVisible) return;

    fetchPending();

    const evtSource = new EventSource(`${API_BASE}/pending-changes/stream`);

    evtSource.addEventListener("pendingUpdate", (e) => {
      const { userId: updatedUser } = JSON.parse(e.data);
      if (updatedUser === userId) {
        fetchPending();
      }
    });

    evtSource.onerror = (err) => {
      console.error("SSE error:", err);
      evtSource.close();
    };

    return () => evtSource.close();
  }, [userId, isVisible]);

  const handleAction = async (changeKey, action) => {
    if (!userId) return;
    setActionLoading((prev) => ({ ...prev, [changeKey]: true }));

    try {
      const res = await fetch(`${API_BASE}/${action}-change`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, changeKey }),
      });
      const data = await res.json();
      console.log(`${action} result:`, data);
      await fetchPending();
    } catch (err) {
      console.error(`${action} failed:`, err);
    } finally {
      setActionLoading((prev) => ({ ...prev, [changeKey]: false }));
    }
  };

  const renderChangeDetails = (change) => {
    switch (change.entityType) {
      case "node":
        return (
          <div>
            <strong>{change.newData.label}</strong> ({change.newData.group})
            {change.newData.aliases && <div>Aliases: {change.newData.aliases}</div>}
            {change.newData.attributes && (
              <div>
                {Object.entries(change.newData.attributes).map(([k, v]) => (
                  <div key={k}>{k}: {v}</div>
                ))}
              </div>
            )}
          </div>
        );
      case "link":
        return (
          <div>
            <strong>{change.newData.node1}</strong> → <strong>{change.newData.node2}</strong>
            <div>Relationship: {change.newData.type}</div>
            {change.newData.context && <div>Context: {change.newData.context}</div>}
          </div>
        );
      case "event":
        return (
          <div>
            <strong>{change.newData.title}</strong>
            {change.newData.description && <div>{change.newData.description}</div>}
            {change.newData.date && <div>Date: {change.newData.date}</div>}
            {change.newData.order !== undefined && <div>Order: {change.newData.order}</div>}
          </div>
        );
      default:
        return <pre>{JSON.stringify(change.newData, null, 2)}</pre>;
    }
  };

  if (!isVisible) return null;

  return (
    <div className="pending-modal-overlay" onClick={onToggle}>
      <div className="pending-panel-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pending-panel-header">
          <div className="pending-header-title">
            <Clock className="pending-header-icon" />
            <h2>Pending Changes</h2>
          </div>
          <button onClick={onToggle} className="pending-close-btn">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="pending-panel-content">
          {loading ? (
            <div className="pending-loading-state">
              <div className="pending-spinner"></div>
              <p>Loading pending changes...</p>
            </div>
          ) : !Object.keys(changes).length ? (
            <div className="pending-empty-state">
              <Check className="pending-empty-icon" />
              <h3>All caught up!</h3>
              <p>No pending changes to review</p>
            </div>
          ) : (
            <div className="pending-changes-list">
              {Object.entries(changes).map(([key, change]) => (
                <div className="change-card" key={key}>
                  <div className="change-details">
                    {renderChangeDetails(change)}
                    {change.status && (
                      <div className={`status ${change.status}`}>
                        Status: {change.status}
                      </div>
                    )}
                  </div>
                  <div className="change-actions">
                    <button
                      className="action-confirm"
                      onClick={() => handleAction(key, "confirm")}
                      disabled={actionLoading[key]}
                    >
                      {actionLoading[key] ? "Processing..." : "Confirm"}
                    </button>
                    <button
                      className="action-deny"
                      onClick={() => handleAction(key, "deny")}
                      disabled={actionLoading[key]}
                    >
                      Deny
                    </button>
                    <button className="action-edit" disabled>
                      Edit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PendingChanges;
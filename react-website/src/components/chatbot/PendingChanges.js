import React, { useEffect, useState } from "react";
import "./PendingChanges.css";

const API_BASE = "http://localhost:5001/api"; // adjust if deployed

const PendingChanges = ({ userId }) => {
  const [changes, setChanges] = useState({});
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({}); // track per-change action

  const fetchPending = async () => {
    if (!userId) return;
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/pending-changes?userId=${userId}`);
      const data = await res.json();
      console.log(data)
      setChanges(data || {});
    } catch (err) {
      console.error("Failed to fetch pending changes:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPending();
  }, [userId]);

  const handleAction = async (changeKey, action) => {
    if (!userId) return;
    setActionLoading(prev => ({ ...prev, [changeKey]: true }));

    try {
      const res = await fetch(`${API_BASE}/${action}-change`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, changeKey }),
      });
      const data = await res.json();
      console.log(`${action} result:`, data);
      await fetchPending(); // refresh after action
    } catch (err) {
      console.error(`${action} failed:`, err);
    } finally {
      setActionLoading(prev => ({ ...prev, [changeKey]: false }));
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

  if (loading) return <div className="pending-changes">Loading pending changes...</div>;

  if (!Object.keys(changes).length) return <div className="pending-changes">No pending changes</div>;

  return (
    <div className="pending-changes">
      <h3>Pending Changes</h3>
      {Object.entries(changes).map(([key, change]) => (
        <div className="change-card" key={key}>
          <div className="change-details">
            {renderChangeDetails(change)}
            {change.status && <div className={`status ${change.status}`}>Status: {change.status}</div>}
          </div>
          <div className="change-actions">
            <button
              onClick={() => handleAction(key, "confirm")}
              disabled={actionLoading[key]}
            >
              {actionLoading[key] && "Processing..."} Confirm
            </button>
            <button
              onClick={() => handleAction(key, "deny")}
              disabled={actionLoading[key]}
            >
              Deny
            </button>
            {/* Edit could open a modal, or redirect to edit page */}
            <button disabled>Edit</button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default PendingChanges;

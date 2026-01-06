import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Edit2, Plus, Trash2, Book, FileText } from 'lucide-react';

const StorySidebar = ({ 
  stories, 
  selectedStory, 
  selectedPart, 
  selectedDraft,
  onSelect,
  onCreateStory,
  onEditStory,
  onDeleteStory,
  onCreatePart,
  onEditPart,
  onDeletePart,
  onCreateDraft,
  onEditDraft,
  onDeleteDraft
}) => {
  const [expandedStories, setExpandedStories] = useState({});
  const [expandedParts, setExpandedParts] = useState({});

  const toggleStory = (storyId) => {
    setExpandedStories(prev => ({
      ...prev,
      [storyId]: !prev[storyId]
    }));
  };

  const togglePart = (partId) => {
    setExpandedParts(prev => ({
      ...prev,
      [partId]: !prev[partId]
    }));
  };

  const getPartIcon = (type) => {
    switch(type) {
      case 'chapter': return '📖';
      case 'scene': return '🎬';
      case 'notes': return '📝';
      case 'outline': return '📋';
      default: return '📄';
    }
  };

  // Helper function to safely get part title
  const getPartTitle = (part) => {
    if (!part) return 'Untitled Part';
    if (typeof part === 'string') return part;
    if (typeof part === 'object' && part !== null) {
      // Handle nested title object (data corruption issue)
      if (part.title && typeof part.title === 'object') {
        return part.title.title || 'Untitled Part';
      }
      return part.title || 'Untitled Part';
    }
    return 'Untitled Part';
  };

  // Helper function to get part type
  const getPartType = (part) => {
    if (!part || typeof part !== 'object') return 'chapter';
    // Handle nested title object (data corruption issue)
    if (part.title && typeof part.title === 'object' && part.title.type) {
      return part.title.type;
    }
    return part.type || 'chapter';
  };

  // Helper function to safely get draft title
  const getDraftTitle = (draft, index) => {
    if (!draft) return `Draft ${index + 1}`;
    if (typeof draft === 'string') return draft;
    if (typeof draft === 'object' && draft !== null) {
      return draft.title || `Draft ${index + 1}`;
    }
    return `Draft ${index + 1}`;
  };

  // Debug logging
  console.log('Stories data:', JSON.stringify(stories, null, 2));

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2>📚 My Stories</h2>
        <button 
          className="icon-btn"
          onClick={onCreateStory}
          title="Create new story"
        >
          <Plus size={18} />
        </button>
      </div>

      <div className="story-tree">
        {stories.length === 0 ? (
          <div className="empty-state">
            <p>No stories yet</p>
            <button onClick={onCreateStory} className="create-first-btn">
              Create your first story
            </button>
          </div>
        ) : (
          stories.map(story => {
            const parts = story.parts || {};
            const partIds = Object.keys(parts);
            const isExpanded = expandedStories[story.id];

            return (
              <div key={story.id} className="story-item">
                <div className="story-header">
                  <button 
                    className="expand-btn"
                    onClick={() => toggleStory(story.id)}
                  >
                    {isExpanded ? 
                      <ChevronDown size={16} /> : 
                      <ChevronRight size={16} />
                    }
                  </button>
                  
                  <Book size={16} />
                  <span className="story-title">
                    {typeof story.title === 'string' ? story.title : 'Untitled Story'}
                  </span>

                  <div className="story-actions">
                    <button
                      className="icon-btn icon-btn-small"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditStory(story);
                      }}
                      title="Edit story"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      className="icon-btn icon-btn-small"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCreatePart(story.id, story.title);
                      }}
                      title="Add part"
                    >
                      <Plus size={14} />
                    </button>
                    <button
                      className="icon-btn icon-btn-small icon-btn-danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteStory(story);
                      }}
                      title="Delete story"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="parts-list">
                    {partIds.length === 0 ? (
                      <button 
                        onClick={() => onCreatePart(story.id, story.title)}
                        className="add-part-btn"
                      >
                        <Plus size={14} /> Add First Part
                      </button>
                    ) : (
                      partIds.map(partId => {
                        const part = parts[partId];
                        const drafts = part?.drafts || {};
                        const draftIds = Object.keys(drafts);
                        const isPartExpanded = expandedParts[partId];
                        const partType = getPartType(part);

                        return (
                          <div key={partId} className="part-item">
                            <div className="part-header">
                              <button 
                                className="expand-btn"
                                onClick={() => togglePart(partId)}
                              >
                                {isPartExpanded ? 
                                  <ChevronDown size={14} /> : 
                                  <ChevronRight size={14} />
                                }
                              </button>

                              <span className="part-icon">
                                {getPartIcon(partType)}
                              </span>
                              
                              <span className="part-title">
                                {getPartTitle(part)}
                              </span>

                              <div className="part-actions">
                                <button
                                  className="icon-btn icon-btn-tiny"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onEditPart(story.id, partId, part);
                                  }}
                                  title="Edit part"
                                >
                                  <Edit2 size={12} />
                                </button>
                                <button
                                  className="icon-btn icon-btn-tiny"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onCreateDraft(story.id, partId, getPartTitle(part));
                                  }}
                                  title="New draft"
                                >
                                  <Plus size={12} />
                                </button>
                                <button
                                  className="icon-btn icon-btn-tiny icon-btn-danger"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDeletePart(story.id, partId, part);
                                  }}
                                  title="Delete part"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>

                            {isPartExpanded && (
                              <div className="drafts-list">
                                {draftIds.length === 0 ? (
                                  <button 
                                    onClick={() => onCreateDraft(story.id, partId, getPartTitle(part))}
                                    className="add-draft-btn"
                                  >
                                    <Plus size={12} /> Add First Draft
                                  </button>
                                ) : (
                                  draftIds.map((draftId, index) => {
                                    const draft = drafts[draftId];
                                    const isSelected = 
                                      selectedStory === story.id &&
                                      selectedPart === partId &&
                                      selectedDraft === draftId;

                                    return (
                                      <div
                                        key={draftId}
                                        className={`draft-item ${isSelected ? 'active' : ''}`}
                                        onClick={() => onSelect(story.id, partId, draftId)}
                                      >
                                        <span className="draft-title">
                                          {getDraftTitle(draft, index)}
                                        </span>
                                        <div className="draft-actions">
                                          <button
                                            className="icon-btn icon-btn-micro"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              onEditDraft(story.id, partId, draftId, draft);
                                            }}
                                            title="Rename draft"
                                          >
                                            <Edit2 size={11} />
                                          </button>
                                          <button
                                            className="icon-btn icon-btn-micro icon-btn-danger"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              onDeleteDraft(story.id, partId, draftId, draft);
                                            }}
                                            title="Delete draft"
                                          >
                                            <Trash2 size={11} />
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default StorySidebar;
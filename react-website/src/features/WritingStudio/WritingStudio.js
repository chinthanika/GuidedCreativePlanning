import React, { useState, useEffect } from 'react';
import StorySidebar from './StorySidebar';
import StoryEditor from './StoryEditor';
import FeedbackPanel from './FeedbackPanel';

import StoryModal from '../../components/writingstudio/StoryModal';
import PartModal from '../../components/writingstudio/PartModal';
import DraftModal from '../../components/writingstudio/DraftModal';
import DeleteModal from '../../components/writingstudio/DeleteModal';

import { useAuthValue } from '../../Firebase/AuthContext';
import storyService from '../../services/StoryService';
import './writing-studio.css';

const WritingStudio = () => {
  const { currentUser } = useAuthValue();
  const userId = currentUser?.uid;

  const [stories, setStories] = useState([]);
  const [selectedStory, setSelectedStory] = useState(null);
  const [selectedPart, setSelectedPart] = useState(null);
  const [selectedDraft, setSelectedDraft] = useState(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackExists, setFeedbackExists] = useState(false); // NEW
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal states
  const [storyModalOpen, setStoryModalOpen] = useState(false);
  const [editingStory, setEditingStory] = useState(null);
  
  const [partModalOpen, setPartModalOpen] = useState(false);
  const [editingPart, setEditingPart] = useState(null);
  const [partModalStoryId, setPartModalStoryId] = useState(null);
  const [partModalStoryTitle, setPartModalStoryTitle] = useState('');
  
  const [draftModalOpen, setDraftModalOpen] = useState(false);
  const [editingDraft, setEditingDraft] = useState(null);
  const [draftModalStoryId, setDraftModalStoryId] = useState(null);
  const [draftModalPartId, setDraftModalPartId] = useState(null);
  const [draftModalPartTitle, setDraftModalPartTitle] = useState('');
  
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteItem, setDeleteItem] = useState(null);

  // Load stories on mount
  useEffect(() => {
    if (userId) {
      loadStories();
    }
  }, [userId]);

  // Load existing feedback when draft changes (NEW)
  useEffect(() => {
    const loadExistingFeedback = async () => {
      if (!userId || !selectedStory || !selectedPart || !selectedDraft) {
        setFeedback(null);
        setFeedbackExists(false);
        return;
      }

      try {
        const result = await storyService.getExistingFeedback(
          userId,
          selectedStory,
          selectedPart,
          selectedDraft
        );

        if (result.exists) {
          setFeedback(result.feedback);
          setFeedbackExists(true);
        } else {
          setFeedback(null);
          setFeedbackExists(false);
        }
      } catch (error) {
        console.error('Failed to load existing feedback:', error);
        setFeedback(null);
        setFeedbackExists(false);
      }
    };

    loadExistingFeedback();
  }, [userId, selectedStory, selectedPart, selectedDraft]);

  const loadStories = async () => {
    try {
      setLoading(true);
      const data = await storyService.getStories(userId);
      setStories(data);

      // Auto-select first story/part/draft if available
      if (data.length > 0 && !selectedStory) {
        const firstStory = data[0];
        const parts = firstStory.parts || {};
        const firstPartId = Object.keys(parts)[0];

        if (firstPartId) {
          const drafts = parts[firstPartId].drafts || {};
          const firstDraftId = Object.keys(drafts)[0];

          if (firstDraftId) {
            handleSelect(firstStory.id, firstPartId, firstDraftId);
          }
        }
      }
    } catch (err) {
      console.error('Error loading stories:', err);
      setError('Failed to load stories');
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (storyId, partId, draftId) => {
    setSelectedStory(storyId);
    setSelectedPart(partId);
    setSelectedDraft(draftId);
    // Don't reset feedback - let useEffect handle loading
  };

  // ============ STORY CRUD ============
  const handleCreateStory = () => {
    setEditingStory(null);
    setStoryModalOpen(true);
  };

  const handleEditStory = (story) => {
    setEditingStory(story);
    setStoryModalOpen(true);
  };

  const handleSaveStory = async (storyData) => {
    try {
      if (editingStory) {
        await storyService.updateStory(userId, editingStory.id, storyData);
      } else {
        const story = await storyService.createStory(userId, storyData.title, storyData.description);
        const part = await storyService.createPart(userId, story.storyId, {
          title: 'Chapter 1',
          type: 'chapter'
        });
        const draft = await storyService.createDraft(userId, story.storyId, part.partId, {
          title: 'Draft 1'
        });

        await loadStories();
        handleSelect(story.storyId, part.partId, draft.draftId);
      }

      await loadStories();
      setStoryModalOpen(false);
      setEditingStory(null);
    } catch (err) {
      console.error('Error saving story:', err);
      alert('Failed to save story');
    }
  };

  const handleDeleteStory = (story) => {
    setDeleteItem({
      type: 'Story',
      title: story.title,
      onConfirm: async () => {
        try {
          await storyService.deleteStory(userId, story.id);
          if (selectedStory === story.id) {
            setSelectedStory(null);
            setSelectedPart(null);
            setSelectedDraft(null);
          }
          await loadStories();
        } catch (err) {
          console.error('Error deleting story:', err);
          alert('Failed to delete story');
        }
      }
    });
    setDeleteModalOpen(true);
  };

  // ============ PART CRUD ============
  const handleCreatePart = (storyId, storyTitle) => {
    setEditingPart(null);
    setPartModalStoryId(storyId);
    setPartModalStoryTitle(storyTitle);
    setPartModalOpen(true);
  };

  const handleEditPart = (storyId, partId, part) => {
    setEditingPart({ ...part, id: partId, storyId });
    setPartModalStoryId(storyId);
    setPartModalOpen(true);
  };

  const handleSavePart = async (partData) => {
    try {
      if (editingPart) {
        await storyService.updatePart(userId, editingPart.storyId, editingPart.id, partData);
      } else {
        const part = await storyService.createPart(userId, partModalStoryId, partData);
        const draft = await storyService.createDraft(userId, partModalStoryId, part.partId, {
          title: 'Draft 1'
        });

        await loadStories();
        handleSelect(partModalStoryId, part.partId, draft.draftId);
      }

      await loadStories();
      setPartModalOpen(false);
      setEditingPart(null);
      setPartModalStoryId(null);
      setPartModalStoryTitle('');
    } catch (err) {
      console.error('Error saving part:', err);
      alert('Failed to save part');
    }
  };

  const handleDeletePart = (storyId, partId, part) => {
    setDeleteItem({
      type: 'Part',
      title: part.title,
      onConfirm: async () => {
        try {
          await storyService.deletePart(userId, storyId, partId);
          if (selectedPart === partId) {
            setSelectedPart(null);
            setSelectedDraft(null);
          }
          await loadStories();
        } catch (err) {
          console.error('Error deleting part:', err);
          alert('Failed to delete part');
        }
      }
    });
    setDeleteModalOpen(true);
  };

  // ============ DRAFT CRUD ============
  const handleCreateDraft = (storyId, partId, partTitle) => {
    setEditingDraft(null);
    setDraftModalStoryId(storyId);
    setDraftModalPartId(partId);
    setDraftModalPartTitle(partTitle);
    setDraftModalOpen(true);
  };

  const handleEditDraft = (storyId, partId, draftId, draft) => {
    setEditingDraft({ ...draft, id: draftId, storyId, partId });
    setDraftModalStoryId(storyId);
    setDraftModalPartId(partId);
    setDraftModalOpen(true);
  };

  const handleSaveDraft = async (draftData) => {
    try {
      if (editingDraft) {
        await storyService.updateDraft(userId, editingDraft.storyId, editingDraft.partId, editingDraft.id, draftData);
      } else {
        const draft = await storyService.createDraft(userId, draftModalStoryId, draftModalPartId, draftData);

        await loadStories();
        handleSelect(draftModalStoryId, draftModalPartId, draft.draftId);
      }

      await loadStories();
      setDraftModalOpen(false);
      setEditingDraft(null);
      setDraftModalStoryId(null);
      setDraftModalPartId(null);
      setDraftModalPartTitle('');
    } catch (err) {
      console.error('Error saving draft:', err);
      alert('Failed to save draft');
    }
  };

  const handleDeleteDraft = (storyId, partId, draftId, draft) => {
    setDeleteItem({
      type: 'Draft',
      title: draft.title || 'Untitled Draft',
      onConfirm: async () => {
        try {
          await storyService.deleteDraft(userId, storyId, partId, draftId);
          if (selectedDraft === draftId) {
            setSelectedDraft(null);
          }
          await loadStories();
        } catch (err) {
          console.error('Error deleting draft:', err);
          alert('Failed to delete draft');
        }
      }
    });
    setDeleteModalOpen(true);
  };

  // ============ FEEDBACK (UPDATED) ============
  const handleGenerateFeedback = async (draftText) => {
    setFeedbackOpen(true);
    setFeedbackLoading(true);

    try {
      const result = await storyService.requestFeedback(
        userId,
        selectedStory,
        selectedPart,
        selectedDraft,
        draftText
      );
      setFeedback(result.feedback);
      setFeedbackExists(true);
    } catch (err) {
      console.error('Error getting feedback:', err);
      setFeedback({
        error: err.message || 'Failed to generate feedback. Please try again.'
      });
    } finally {
      setFeedbackLoading(false);
    }
  };

  const handleViewFeedback = () => {
    setFeedbackOpen(true);
  };

  const handleCloseFeedback = () => {
    setFeedbackOpen(false);
  };

  if (loading) {
    return <div className="writing-studio-loading">Loading Writing Studio...</div>;
  }

  if (error) {
    return <div className="writing-studio-error">{error}</div>;
  }

  return (
    <div className="writing-studio">
      <StorySidebar
        stories={stories}
        selectedStory={selectedStory}
        selectedPart={selectedPart}
        selectedDraft={selectedDraft}
        onSelect={handleSelect}
        onCreateStory={handleCreateStory}
        onEditStory={handleEditStory}
        onDeleteStory={handleDeleteStory}
        onCreatePart={handleCreatePart}
        onEditPart={handleEditPart}
        onDeletePart={handleDeletePart}
        onCreateDraft={handleCreateDraft}
        onEditDraft={handleEditDraft}
        onDeleteDraft={handleDeleteDraft}
      />

      {selectedStory && selectedPart && selectedDraft ? (
        <StoryEditor
          userId={userId}
          storyId={selectedStory}
          partId={selectedPart}
          draftId={selectedDraft}
          feedbackExists={feedbackExists}
          onGenerateFeedback={handleGenerateFeedback}
          onViewFeedback={handleViewFeedback}
          onFeedbackStatusChange={setFeedbackExists}
        />
      ) : (
        <div className="editor-placeholder">
          <h2>No draft selected</h2>
          <p>Create a new story or select an existing draft to start writing</p>
          <button onClick={handleCreateStory} className="placeholder-create-btn">
            + Create Your First Story
          </button>
        </div>
      )}

      <FeedbackPanel
        isOpen={feedbackOpen}
        onClose={handleCloseFeedback}
        feedback={feedback}
        isLoading={feedbackLoading}
      />

      {/* Modals */}
      <StoryModal
        isOpen={storyModalOpen}
        closeModal={() => {
          setStoryModalOpen(false);
          setEditingStory(null);
        }}
        onSave={handleSaveStory}
        story={editingStory}
      />

      <PartModal
        isOpen={partModalOpen}
        closeModal={() => {
          setPartModalOpen(false);
          setEditingPart(null);
          setPartModalStoryId(null);
          setPartModalStoryTitle('');
        }}
        onSave={handleSavePart}
        part={editingPart}
        storyTitle={partModalStoryTitle}
      />

      <DraftModal
        isOpen={draftModalOpen}
        closeModal={() => {
          setDraftModalOpen(false);
          setEditingDraft(null);
          setDraftModalStoryId(null);
          setDraftModalPartId(null);
          setDraftModalPartTitle('');
        }}
        onSave={handleSaveDraft}
        draft={editingDraft}
        partTitle={draftModalPartTitle}
      />

      <DeleteModal
        isOpen={deleteModalOpen}
        closeModal={() => {
          setDeleteModalOpen(false);
          setDeleteItem(null);
        }}
        onConfirm={deleteItem?.onConfirm}
        itemType={deleteItem?.type}
        itemTitle={deleteItem?.title}
      />
    </div>
  );
};

export default WritingStudio;
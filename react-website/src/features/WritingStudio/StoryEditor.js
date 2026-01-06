import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Slate, Editable, withReact } from 'slate-react';
import { createEditor, Editor } from 'slate';
import { Save, Zap, Eye } from 'lucide-react';
import storyService from '../../services/StoryService';

const INITIAL_VALUE = [{ type: 'paragraph', children: [{ text: '' }] }];

const StoryEditor = ({ 
  userId, 
  storyId, 
  partId, 
  draftId, 
  feedbackExists,
  onGenerateFeedback,
  onViewFeedback,
  onFeedbackStatusChange
}) => {
  const editor = useMemo(() => withReact(createEditor()), []);
  const [value, setValue] = useState(INITIAL_VALUE);
  const [wordCount, setWordCount] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [autoSaveTimer, setAutoSaveTimer] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isGeneratingFeedback, setIsGeneratingFeedback] = useState(false);

  // Load draft on mount or when draft changes
  useEffect(() => {
    loadDraft();
    return () => {
      if (autoSaveTimer) clearTimeout(autoSaveTimer);
    };
  }, [draftId]);

  const loadDraft = async () => {
    setIsLoading(true);
    setHasUnsavedChanges(false);
    
    try {
      const draft = await storyService.getDraft(userId, storyId, partId, draftId);
      
      if (draft && draft.content) {
        try {
          const parsedContent = JSON.parse(draft.content);
          if (Array.isArray(parsedContent) && parsedContent.length > 0) {
            setValue(parsedContent);
            setWordCount(draft.wordCount || 0);
          } else {
            console.warn('Invalid content structure, using initial value');
            setValue(INITIAL_VALUE);
            setWordCount(0);
          }
        } catch (parseError) {
          console.error('Error parsing draft content:', parseError);
          setValue(INITIAL_VALUE);
          setWordCount(0);
        }
      } else {
        console.log('No draft content found, initializing with default');
        setValue(INITIAL_VALUE);
        setWordCount(0);
        try {
          await storyService.saveDraft(userId, storyId, partId, draftId, INITIAL_VALUE, 0);
        } catch (saveError) {
          console.error('Error saving initial draft:', saveError);
        }
      }
    } catch (err) {
      console.error('Error loading draft:', err);
      setValue(INITIAL_VALUE);
      setWordCount(0);
    } finally {
      setIsLoading(false);
    }
  };

  const countWords = (nodes) => {
    return nodes.reduce((count, node) => {
      if (node.children) {
        return count + countWords(node.children);
      }
      return count + (node.text?.trim().split(/\s+/).filter(Boolean).length || 0);
    }, 0);
  };

  const handleChange = (newValue) => {
    setValue(newValue);
    const words = countWords(newValue);
    setWordCount(words);
    setHasUnsavedChanges(true);

    // Auto-save after 10 seconds of inactivity
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    const timer = setTimeout(() => {
      handleSave(newValue, words);
    }, 10000);
    setAutoSaveTimer(timer);
  };

  const handleSave = async (content = value, words = wordCount) => {
    setIsSaving(true);
    try {
      await storyService.saveDraft(userId, storyId, partId, draftId, content, words);
      setLastSaved(new Date());
      setHasUnsavedChanges(false);
    } catch (err) {
      console.error('Error saving draft:', err);
      alert('Failed to save draft');
    } finally {
      setIsSaving(false);
    }
  };

  const handleGetFeedback = async () => {
    // Ensure draft is saved first
    if (hasUnsavedChanges) {
      await handleSave();
    }

    const plainText = storyService.extractTextFromSlate(value);
    
    if (!plainText || plainText.trim().length < 50) {
      alert('Please write at least 50 characters before requesting feedback');
      return;
    }

    setIsGeneratingFeedback(true);
    try {
      await onGenerateFeedback(plainText);
      onFeedbackStatusChange(true);
    } catch (error) {
      console.error('Failed to generate feedback:', error);
    } finally {
      setIsGeneratingFeedback(false);
    }
  };

  const handleRegenerateFeedback = async () => {
    if (!hasUnsavedChanges) {
      const confirm = window.confirm(
        'You haven\'t made changes since the last feedback. Regenerate anyway?'
      );
      if (!confirm) return;
    }

    await handleGetFeedback();
  };

  const toggleMark = (markType) => {
    const isActive = Editor.marks(editor)?.[markType] === true;
    if (isActive) {
      Editor.removeMark(editor, markType);
    } else {
      Editor.addMark(editor, markType, true);
    }
  };

  const renderLeaf = useCallback(props => {
    let children = props.children;
    if (props.leaf.bold) children = <strong>{children}</strong>;
    if (props.leaf.italic) children = <em>{children}</em>;
    if (props.leaf.underline) children = <u>{children}</u>;
    return <span {...props.attributes}>{children}</span>;
  }, []);

  const handleKeyDown = (event) => {
    if (!event.ctrlKey) return;

    switch (event.key) {
      case 'b':
        event.preventDefault();
        toggleMark('bold');
        break;
      case 'i':
        event.preventDefault();
        toggleMark('italic');
        break;
      case 'u':
        event.preventDefault();
        toggleMark('underline');
        break;
      case 's':
        event.preventDefault();
        handleSave();
        break;
    }
  };

  if (isLoading) {
    return (
      <div className="editor-container">
        <div className="editor-loading">Loading draft...</div>
      </div>
    );
  }

  return (
    <div className="editor-container">
      <div className="editor-toolbar">
        <div className="format-buttons">
          <button
            onMouseDown={(e) => { e.preventDefault(); toggleMark('bold'); }}
            className="toolbar-btn"
            title="Bold (Ctrl+B)"
          >
            <strong>B</strong>
          </button>
          <button
            onMouseDown={(e) => { e.preventDefault(); toggleMark('italic'); }}
            className="toolbar-btn"
            title="Italic (Ctrl+I)"
          >
            <em>I</em>
          </button>
          <button
            onMouseDown={(e) => { e.preventDefault(); toggleMark('underline'); }}
            className="toolbar-btn"
            title="Underline (Ctrl+U)"
          >
            <u>U</u>
          </button>
        </div>

        <div className="editor-actions">
          <span className="word-count">Words: {wordCount}</span>
          
          <button
            onClick={() => handleSave()}
            className="save-btn"
            disabled={isSaving}
            title="Save (Ctrl+S)"
          >
            <Save size={16} />
            {isSaving ? 'Saving...' : 'Save'}
          </button>

          {/* Feedback buttons - conditional rendering */}
          {feedbackExists ? (
            <>
              <button 
                onClick={onViewFeedback} 
                className="feedback-btn feedback-btn-view"
                title="View existing feedback"
              >
                <Eye size={16} />
                View Feedback
              </button>
              <button 
                onClick={handleRegenerateFeedback} 
                className="feedback-btn feedback-btn-regenerate"
                disabled={isGeneratingFeedback}
                title={hasUnsavedChanges 
                  ? "Regenerate feedback with latest changes" 
                  : "Regenerate feedback"}
              >
                <Zap size={16} />
                {isGeneratingFeedback ? 'Analyzing...' : 'Regenerate'}
                {hasUnsavedChanges && <span className="unsaved-badge">*</span>}
              </button>
            </>
          ) : (
            <button 
              onClick={handleGetFeedback} 
              className="feedback-btn"
              disabled={isGeneratingFeedback}
              title="Get AI feedback on your draft"
            >
              <Zap size={16} />
              {isGeneratingFeedback ? 'Analyzing...' : 'Get Feedback'}
            </button>
          )}
        </div>
      </div>

      {lastSaved && (
        <div className="save-indicator">
          Saved at {lastSaved.toLocaleTimeString()}
          {hasUnsavedChanges && <span className="unsaved-indicator"> • Unsaved changes</span>}
        </div>
      )}

      <div className="editor-content">
        <Slate 
          editor={editor} 
          value={value}
          onChange={handleChange}
        >
          <Editable
            onKeyDown={handleKeyDown}
            renderLeaf={renderLeaf}
            placeholder="Start writing your story..."
            spellCheck
          />
        </Slate>
      </div>
    </div>
  );
};

export default StoryEditor;
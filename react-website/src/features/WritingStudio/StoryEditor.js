import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Slate, Editable, withReact } from 'slate-react';
import { createEditor, Editor } from 'slate';
import { Save, Zap } from 'lucide-react';
import storyService from '../../services/StoryService';

const INITIAL_VALUE = [{ type: 'paragraph', children: [{ text: '' }] }];

const StoryEditor = ({ userId, storyId, partId, draftId, onFeedbackRequest }) => {
  const editor = useMemo(() => withReact(createEditor()), []);
  const [value, setValue] = useState(INITIAL_VALUE);
  const [wordCount, setWordCount] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [autoSaveTimer, setAutoSaveTimer] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load draft on mount or when draft changes
  useEffect(() => {
    loadDraft();
    return () => {
      if (autoSaveTimer) clearTimeout(autoSaveTimer);
    };
  }, [draftId]);

  const loadDraft = async () => {
    setIsLoading(true);
    try {
      const draft = await storyService.getDraft(userId, storyId, partId, draftId);
      
      if (draft && draft.content) {
        try {
          const parsedContent = JSON.parse(draft.content);
          // Validate that it's a valid Slate value
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
        // New draft - initialize with empty content
        console.log('No draft content found, initializing with default');
        setValue(INITIAL_VALUE);
        setWordCount(0);
        // Save initial value to database
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
    } catch (err) {
      console.error('Error saving draft:', err);
      alert('Failed to save draft');
    } finally {
      setIsSaving(false);
    }
  };

  const handleFeedbackClick = () => {
    const plainText = value.map(node =>
      node.children.map(child => child.text).join('')
    ).join('\n');
    onFeedbackRequest(plainText);
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

  // Show loading state while fetching draft
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
          <button onClick={handleFeedbackClick} className="feedback-btn">
            <Zap size={16} />
            Get Feedback
          </button>
        </div>
      </div>

      {lastSaved && (
        <div className="save-indicator">
          Saved at {lastSaved.toLocaleTimeString()}
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
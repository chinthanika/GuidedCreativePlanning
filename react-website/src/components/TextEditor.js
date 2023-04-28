import React, { useCallback, useState, useMemo, useEffect, Fragment } from 'react';
import { Slate, Editable, withReact } from 'slate-react';
import { createEditor, Editor, Transforms, Text, Range } from 'slate';

import Alert from "@material-ui/lab/Alert";

import Icon from 'react-icons-kit';
import { bold } from 'react-icons-kit/feather/bold';
import { italic } from 'react-icons-kit/feather/italic';
import { underline } from 'react-icons-kit/feather/underline';
import { save } from 'react-icons-kit/feather/save';

import { useAuthValue } from '../Firebase/AuthContext'
import { database } from '../Firebase/firebase'
import { ref, set,onValue } from "firebase/database"


import FormatToolbar from './FormatToolbar';

const initialValue = [{
  type: 'paragraph', children: [{ text: '1. Higlight a part of me and click B, or press Ctrl+B to make me bold!\n\n2. Higlight a part of me and click I, or press Ctrl+I to make me italicized!\n\n3. Higlight a part of me and click U, or press Ctrl+U to underline me!\n\n Click the save icon your story!', },],
},
];

function TextEditor() {
  const { currentUser } = useAuthValue();
  const userId = currentUser ? currentUser.uid : null;

  const editor = useMemo(() => withReact(createEditor()), []);
  const [value, setValue] = useState(null);
  const [showAlert, setShowAlert] = useState(false)
  const [loading, setLoading] = useState(true);

  const storyRef = ref(database, `stories/${userId}/story-text`);
  

  // Add useEffect hook to fetch the data from Firebase
  useEffect(() => {
    if (userId) {
      const fetchStory = async () => {
        onValue(storyRef, (snapshot) => {
          const data = snapshot.val();
          if (data && data.content) {
            console.log(data.content)
            setValue(JSON.parse(data.content));
          } else {
            setValue(initialValue); // Set the value to initialValue if no data is fetched
          }
          setLoading(false);
        });

        console.log(value)
      };
      fetchStory();
    } else {
      setValue(initialValue);
      setLoading(false);
    }
  }, [userId]);


  const handleChange = (newValue) => {
    setValue(newValue);
  };

  const { selection } = editor;

  const toggleMark = (markType) => {
    if (selection) {
      const isActive = Editor.marks(editor)?.[markType] === true;
      if (isActive) {
        Editor.removeMark(editor, markType);
      } else {
        Editor.addMark(editor, markType, true);
      }
    }
  };

  const handleKeyDown = (event, editor) => {
    if (!event.ctrlKey) {
      return;
    }

    switch (event.key) {
      case 'b': {
        event.preventDefault();
        toggleMark('bold');
        break;
      }
      case 'i': {
        event.preventDefault();
        toggleMark('italic');
        break;
      }
      case 'u': {
        event.preventDefault();
        toggleMark('underline');
        break;
      }
      default: {
        break;
      }
    }
  };

  const onMarkClick = (e, type) => {
    e.preventDefault();
    toggleMark(type);
  };

  const onSaveClick = () => {
    // Get the current editor content as a string
    const content = JSON.stringify(value)

    console.log(content)
    // Save the content to Firebase
    set(ref(database, `stories/${userId}/story-text`), {
      content: content
    }).then(() => setShowAlert(true));
  }

  const renderLeaf = useCallback(props => {
    let children = props.children;
    if (props.leaf.bold) {
      children = <strong>{children}</strong>;
    }
    if (props.leaf.italic) {
      children = <em>{children}</em>;
    }
    if (props.leaf.underline) {
      children = <u>{children}</u>;
    }
    return <span {...props.attributes}>{children}</span>;
  }, []);

  return (
    <>
      <Fragment>
        <FormatToolbar>
          <button
            onPointerDown={(e) => onMarkClick(e, 'bold')}
            className="tooltip-icon-button"
          >
            <Icon icon={bold} />
          </button>
          <button
            onPointerDown={(e) => onMarkClick(e, 'italic')}
            className="tooltip-icon-button"
          >
            <Icon icon={italic} />
          </button>
          <button
            onPointerDown={(e) => onMarkClick(e, 'underline')}
            className="tooltip-icon-button"
          >
            <Icon icon={underline} />
          </button>
          <button
            onPointerDown={() => onSaveClick()}
            className="tooltip-icon-button"
          >
            <Icon icon={save} />
          </button>
        </FormatToolbar>
        {showAlert && (
          <Alert onClose={() => setShowAlert(false)} severity="success">
            Record saved successfully!
          </Alert>
        )}
      </Fragment>
      {!loading ? (
        <Slate editor={editor} value={value} onChange={handleChange}>
          <Editable
            onKeyDown={(event) => handleKeyDown(event, editor)}
            renderLeaf={renderLeaf}
          />
        </Slate>
      ) : (
        <div>Loading...</div>
      )}
    </>
  );
}

export default TextEditor;
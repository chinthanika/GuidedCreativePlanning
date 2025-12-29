import { useEffect, useState } from "react";
import { useAuthValue } from '../../Firebase/AuthContext'
import { signOut } from 'firebase/auth'
import { auth } from '../../Firebase/firebase'
import { ref, remove, onValue, set } from "firebase/database";
import { database } from '../../Firebase/firebase';
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import { Button, IconButton, TextField, TextareaAutosize } from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import SaveIcon from "@mui/icons-material/Save";
import './profile.css'

function Profile() {
  const { currentUser } = useAuthValue()

  const summaryRef = ref(database, `stories/${currentUser?.uid}/summary`)
  const titleRef = ref(database, `stories/${currentUser?.uid}/title`)

  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState("");
  const [title, setTitle] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingSummary, setEditingSummary] = useState(false);

  useEffect(() => {
    // Fetch summary and title from Firebase
    const unsubscribeSummary = onValue(summaryRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setSummary(data)
      } else {
        setSummary("");
      }
    });

    const unsubscribeTitle = onValue(titleRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setTitle(data)
      } else {
        setTitle("");
      }
    });

    return () => {
      unsubscribeSummary();
      unsubscribeTitle();
    };
  }, [])

  const handleDeleteAccount = () => {
    const userRef = ref(database, `users/${currentUser.uid}`)

    remove(userRef)
      .then(() => {
        currentUser.delete();
      })
      .catch((error) => {
        console.log(error);
      });
  };

  const handleTitleSave = () => {
    set(titleRef, title);
    setEditingTitle(false);
  };

  const handleSummarySave = () => {
    set(summaryRef, summary);
    setEditingSummary(false);
  };

  const handleClickOpen = () => {
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
  };

  return (
    <div className='center'>
      <div className='profile'>
        <h1>Profile</h1>
        <p><strong>Email: </strong>{currentUser?.email}</p>
        <p>
          <strong>Email Verified: </strong>
          {`${currentUser?.emailVerified}`}
        </p>

        {currentUser && (
          <>
            <div>
              <strong>Story Title: </strong>
              {editingTitle ? (
                <>
                  <TextField
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                  <IconButton onClick={handleTitleSave} size="large">
                    <SaveIcon />
                  </IconButton>
                </>
              ) : (
                <>
                  <span>{title}</span>
                  <IconButton onClick={() => setEditingTitle(true)} size="large">
                    <EditIcon />
                  </IconButton>
                </>
              )}
            </div>
            <div>
              <strong>Story Summary: </strong>
              <div className="story-summary-container">
                {editingSummary ? (
                  <>
                    <TextareaAutosize
                      value={summary}
                      onChange={(e) => setSummary(e.target.value)}
                      minRows={10}
                      className="profile-textarea"
                    />
                    <IconButton onClick={handleSummarySave} className="save-icon" size="large">
                      <SaveIcon />
                    </IconButton>
                  </>
                ) : (
                  <>
                    <div className="profile-summary">
                      {summary
                        ? summary.split("\n").map((line, index) => (
                          <p key={index} style={{ margin: "0 0 20px" }}>
                            {line}
                          </p>
                        ))
                        : "No summary available."}
                    </div>
                    <IconButton
                      onClick={() => setEditingSummary(true)}
                      className="edit-icon"
                      size="large">
                      <EditIcon />
                    </IconButton>
                  </>
                )}
              </div>
            </div>
            <Button variant="contained" color="secondary" onClick={handleClickOpen}>
              Delete Account
            </Button>
            <span onClick={() => signOut(auth)}>Sign Out</span>
          </>
        )}
      </div>
      <Dialog open={open} onClose={handleClose}>
        <DialogTitle>Are you sure you want to delete your account?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} color="primary">
            No
          </Button>
          <Button onClick={handleDeleteAccount} color="secondary">
            Yes
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}

export default Profile
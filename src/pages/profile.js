import { useEffect, useState } from "react";
import { useAuthValue } from '../Firebase/AuthContext'
import { signOut } from 'firebase/auth'
import { auth } from '../Firebase/firebase'
import { ref, remove, onValue, set } from "firebase/database";
import { database } from '../Firebase/firebase';
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogContentText from "@material-ui/core/DialogContentText";
import DialogTitle from "@material-ui/core/DialogTitle";
import { Button, IconButton, TextField } from "@material-ui/core";
import EditIcon from "@material-ui/icons/Edit";
import SaveIcon from "@material-ui/icons/Save";
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
              <IconButton onClick={handleTitleSave}>
                <SaveIcon />
              </IconButton>
            </>
          ) : (
            <>
              <span>{title}</span>
              <IconButton onClick={() => setEditingTitle(true)}>
                <EditIcon />
              </IconButton>
            </>
          )}
        </div>
        <div>
          <strong>Story Summary: </strong>
          {editingSummary ? (
            <>
              <textarea rows="40" cols="150"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
              />
              <IconButton onClick={handleSummarySave}>
                <SaveIcon />
              </IconButton>
            </>
          ) : (
            <>
              <span>{summary}</span>
              <IconButton onClick={() => setEditingSummary(true)}>
                <EditIcon />
              </IconButton>
            </>
          )}
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
  )
}

export default Profile
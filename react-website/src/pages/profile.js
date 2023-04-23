import { useEffect, useState } from "react";

import {useAuthValue} from '../Firebase/AuthContext'
import { signOut } from 'firebase/auth' 
import { auth } from '../Firebase/firebase'
import { ref, remove, onValue } from "firebase/database"; // Import database functions from Firebase

import { database } from '../Firebase/firebase'; // Import the Firebase configuration and initialize the Firebase app


import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogContentText from "@material-ui/core/DialogContentText";
import DialogTitle from "@material-ui/core/DialogTitle";
import { Button } from "@material-ui/core";

import './profile.css'

function Profile() {
  const {currentUser} = useAuthValue()

  const summaryRef = ref(database, `stories/${currentUser?.uid}/summary`)

  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState("");

  useEffect(() => {
    // Fetch events from Firebase
    const unsubscribe = onValue(summaryRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            setSummary(data)
        } else {
            setSummary("");
        }
    });

    return () => {
        unsubscribe();
    };
}, []);

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
        <p>
          <strong>Story:</strong> {summary}
        </p>
        {currentUser && (
        <Button variant="contained" color="secondary" onClick={handleClickOpen}>
          Delete Account
        </Button>
        )}
        <span onClick={() => signOut(auth)}>Sign Out</span>
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
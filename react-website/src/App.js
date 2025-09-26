import React from 'react';
import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route} from 'react-router-dom';

import {auth} from './Firebase/firebase'
import {onAuthStateChanged} from 'firebase/auth'
import { AuthProvider } from './Firebase/AuthContext';

import './App.css';
import Navbar from './components/Navbar';

import PrivateRoute from './PrivateRoute';
import SignUp from './pages/signin/signup';
import VerifyEmail from './pages/signin/verifyEmail';
import Profile from './pages/signin/profile';
import Login from './pages/signin/login';
import MapGenerator from './pages/storymap/map-generator';
import StoryMap from './pages/storymap/story-map';
import StoryTimeline from './pages/timeline/timeline';
import StoryEditor from './pages/storyeditor/story';
import Chatbot from './pages/chatbot/chatbot'; // Import the Chatbot page
import NotebookPage from './pages/notebook/notebook';  

function App() {

    //These constants will be visible inside AuthProvider
    const [currentUser, setCurrentUser] = useState(null)
    const [timeActive, setTimeActive] = useState(false)

    //Get the current user from firebase and set it in the state when rendered
    useEffect(() => {
        onAuthStateChanged(auth, (user) => {
          setCurrentUser(user)
         })
      }, [])

return (
    <Router>
        <AuthProvider value={{currentUser, timeActive, setTimeActive}}>
            <Navbar />
            <Routes>
                <Route path='/sign-up' element={<SignUp/>} />
                <Route path='/login' element={<Login/>} />
                <Route path='/verify-email' element={<VerifyEmail/>} />
                <Route path='/profile' element={<Profile/>} />
                <Route path='/map-generator' element={<MapGenerator/>}/>
                <Route path='/story-map' element={<StoryMap/>}/>
                <Route path='/story-timeline' element={<StoryTimeline/>}/>
                <Route path='/chatbot' element={<Chatbot/>}/>
                <Route path='/story-editor' element={<StoryEditor/>}/>
                <Route path='/notebook' element={<NotebookPage/>}/>
                <Route exact path='/' element={
                    <PrivateRoute>
                    <Profile/>
                    </PrivateRoute>
                }/>
            </Routes>
        </AuthProvider>
    </Router>
);
}
  
export default App;
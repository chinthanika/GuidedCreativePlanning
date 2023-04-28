import React from 'react';
import { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route} from 'react-router-dom';

import {auth} from './Firebase/firebase'
import {onAuthStateChanged} from 'firebase/auth'
import { AuthProvider } from './Firebase/AuthContext';

import './App.css';
import Navbar from './components/Navbar';

import PrivateRoute from './PrivateRoute';
import SignUp from './pages/signup';
import VerifyEmail from './pages/verify-email';
import Profile from './pages/profile';
import Login from './pages/login';
import MapGenerator from './pages/map-generator';
import StoryMap from './pages/story-map';
import StoryTimeline from './pages/timeline';
import StoryEditor from './pages/story';
  
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
                <Route path='/story-editor' element={<StoryEditor/>}/>
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
import React from 'react';
import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route} from 'react-router-dom';

import {auth} from './Firebase/firebase'
import {onAuthStateChanged} from 'firebase/auth'
import { AuthProvider } from './Firebase/AuthContext';

import './App.css';
import Navbar from './components/Navbar';

import PrivateRoute from './PrivateRoute';
import SignUp from './pages/signup';
import VerifyEmail from './pages/verifyEmail';
import Profile from './pages/profile';
import Login from './pages/login';
import NewStory from './pages/new-story';
import CharacterMap from './pages/character-map';
  
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
                <Route path='/new-story' element={<NewStory/>}/>
                <Route path='/character-map' element={<CharacterMap/>}/>
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
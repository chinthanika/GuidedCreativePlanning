import React from 'react';
import { useState, useEffect } from 'react';
import {auth} from './Firebase/firebase'
import {onAuthStateChanged} from 'firebase/auth'
import { AuthProvider } from './Firebase/AuthContext';
import './App.css';
import Navbar from './components/Navbar';
import { BrowserRouter as Router, Routes, Route} from 'react-router-dom';
import SignUp from './pages/signup';
import VerifyEmail from './pages/verifyEmail';
  
function App() {

    const [currentUser, setCurrentUser] = useState(null)
    const [timeActive, setTimeActive] = useState(false)

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
                <Route path='/email-verification' element={<VerifyEmail/>} />
            </Routes>
        </AuthProvider>
    </Router>
);
}
  
export default App;
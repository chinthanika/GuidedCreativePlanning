
import React from 'react';
import './App.css';
import Navbar from './components/Navbar';
import Form from './components/common/Form';
import { BrowserRouter as Router, Routes, Route}
    from 'react-router-dom';
import SignUp from './pages/signup';
  
function App() {
return (
    <Router>
    <Navbar />
    <Routes>
        
        <Route path='/sign-up' element={<SignUp/>} />
    </Routes>
    </Router>
);
}
  
export default App;
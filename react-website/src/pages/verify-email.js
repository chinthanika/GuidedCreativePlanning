import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAuthValue } from '../Firebase/AuthContext'
import { auth, database } from '../Firebase/firebase'
import { sendEmailVerification } from 'firebase/auth'
import { ref, set } from "firebase/database"

import './verify-email.css'

function VerifyEmail() {

  const { currentUser } = useAuthValue()

  const [time, setTime] = useState(60)  // Initialize the time state to 60 seconds
  const { timeActive, setTimeActive } = useAuthValue()
  
  const navigate = useNavigate()

  useEffect(() => {
    const interval = setInterval(() => {
      // Reload the current user object to check if the email has been verified
      currentUser?.reload() 
        .then(() => {
          // If the email has been verified, clear the interval, navigate to home page and set the user data in Firebase
          if (currentUser?.emailVerified) {
            clearInterval(interval)
            navigate('/')

            set(ref(database, 'users/' + currentUser.uid), {
              email: currentUser.email,
              uid: currentUser.uid
            });
          }
        })
        .catch((err) => {
          alert(err.message)  // If there is an error, display an alert with the error message
        })
    }, 1000)
  }, [navigate, currentUser])


  //Disable the resend button and set the timer until activation to 60 seconds
  useEffect(() => {
    let interval = null

    if (timeActive && time !== 0) {
      interval = setInterval(() => {
        setTime((time) => time - 1)
      }, 1000)
    }
    // If the time has run out, set the timeActive state to false, reset the time to 60 and clear the interval
    else if (time === 0) {
      setTimeActive(false)
      setTime(60)
      clearInterval(interval)
    }

    return () => clearInterval(interval);
  }, [timeActive, time, setTimeActive])

  //Send another verification email and disable the resend button
  const resendEmailVerification = () => {

    // Send the email verification to the current user
    sendEmailVerification(auth.currentUser)
      .then(() => {
        setTimeActive(true)   // Set the timeActive state to true, which will disable the resend button
      }).catch((err) => {
        alert(err.message)  // If there is an error, display an alert with the error message
      })
  }

  return (
    <div className='center'>
      <div className='verifyEmail'>
        <h1>Verify your Email Address</h1>
        <p>
          <strong>A Verification email has been sent to:</strong><br />
          <span>{currentUser?.email}</span>
        </p>
        <span>Follow the instruction in the email to verify your account</span>
        <button
          onClick={resendEmailVerification}
          disabled={timeActive}
        >Resend Email {timeActive && time}</button>
      </div>
    </div>
  )
}

export default VerifyEmail
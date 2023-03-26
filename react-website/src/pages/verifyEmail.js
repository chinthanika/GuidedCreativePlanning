import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAuthValue } from '../Firebase/AuthContext'
import { auth, database } from '../Firebase/firebase'
import { sendEmailVerification } from 'firebase/auth'
import { ref, set } from "firebase/database"

import './verifyEmail.css'

function VerifyEmail() {

  const { currentUser } = useAuthValue()
  const [time, setTime] = useState(60)
  const { timeActive, setTimeActive } = useAuthValue()
  const navigate = useNavigate()

  //Reload the user object from firebase to monitor for changes. Then,
  //once the user has verified their email, navigate to the profile page and 
  //add the user to the database
  useEffect(() => {

    const interval = setInterval(() => {
      currentUser?.reload()
        .then(() => {

          if (currentUser?.emailVerified) {
            clearInterval(interval)
            navigate('/')

            set(ref(database, 'users/' + currentUser.uid), {
              email: currentUser.email
            });
          }
        })
        .catch((err) => {
          alert(err.message)
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
    else if (time === 0) {
      setTimeActive(false)
      setTime(60)
      clearInterval(interval)
    }

    return () => clearInterval(interval);
  }, [timeActive, time, setTimeActive])

  //Send another verification email and disable the resend button
  const resendEmailVerification = () => {

    sendEmailVerification(auth.currentUser)
      .then(() => {
        setTimeActive(true)
      }).catch((err) => {
        alert(err.message)
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
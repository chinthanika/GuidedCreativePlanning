import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'

import { auth } from '../Firebase/firebase'
import { createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth'
import { useAuthValue } from '../Firebase/AuthContext.js'

import '../forms.css'

function SignUp() {

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const { setTimeActive } = useAuthValue()

  //Validate password through double-entry

  /*Returns 
  * isValid : Boolean
  */
  const validatePassword = () => {

    let isValid = true

    if (password !== '' && confirmPassword !== '') {

      if (password !== confirmPassword) {
        isValid = false
        setError('Passwords does not match')
      }
    }
    return isValid
  }

  const register = e => {

    e.preventDefault()
    setError('')

    if (validatePassword()) {

      // Create a new user with email and password using firebase
      createUserWithEmailAndPassword(auth, email, password)

        //When the user has signed up, send a verification message to their email then
        //navigate to the email verification page.
        .then(() => {
          sendEmailVerification(auth.currentUser)
            .then(() => {
              setTimeActive(true)
              navigate('/verify-email')
            })
            .catch((err) => alert(err.message))
        })
        .catch(err => setError(err.message))
    }
    setEmail('')
    setPassword('')
    setConfirmPassword('')
  }

  return (
    <div className='center'>
      <div className='auth'>
        <h1>Register</h1>
        {error && <div className='auth__error'>{error}</div>}
        <form onSubmit={register} name='registration_form'>
          <input
            type='email'
            value={email}
            placeholder="Enter your email"
            required
            onChange={e => setEmail(e.target.value)} />

          <input
            type='password'
            value={password}
            required
            placeholder='Enter your password'
            onChange={e => setPassword(e.target.value)} />

          <input
            type='password'
            value={confirmPassword}
            required
            placeholder='Confirm password'
            onChange={e => setConfirmPassword(e.target.value)} />
          <button type='submit' className="form-btn">Sign Up</button>
        </form>
        <span>
          Already have an account?
          <Link to='/login'> Sign In. </Link>
        </span>
      </div>
    </div>
  )
}

export default SignUp;
import { useState } from 'react'
import { Link } from 'react-router-dom'
import '../forms.css'
import { signInWithEmailAndPassword, sendEmailVerification } from 'firebase/auth'
import { auth } from '../Firebase/firebase'
import { useNavigate } from 'react-router-dom'
import { useAuthValue } from '../Firebase/AuthContext'


function Login() {

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const { setTimeActive } = useAuthValue()
  const navigate = useNavigate()

  // Handle user log in
  const login = e => {
    e.preventDefault()
    // Sign in with email and password using Firebase authentication
    signInWithEmailAndPassword(auth, email, password)
      .then(() => {
        // If user's email is not verified, send verification email and navigate to verification page
        if (!auth.currentUser.emailVerified) {
          sendEmailVerification(auth.currentUser)
            .then(() => {
              setTimeActive(true)
              navigate('/verify-email')
            })
            .catch(err => alert(err.message))
        } else {
          // Navigate to the home page
          navigate('/')
        }
      })
      .catch(err => setError(err.message))
  }

  return (
    <div className='center'>
      <div className='auth'>
        <h1>Sign In</h1>
        {error && <div className='auth__error'>{error}</div>}
        <form onSubmit={login} name='login_form'>
          <input
            type='email'
            value={email}
            required
            placeholder="Enter your email"
            onChange={e => setEmail(e.target.value)} />

          <input
            type='password'
            value={password}
            required
            placeholder='Enter your password'
            onChange={e => setPassword(e.target.value)} />

          <button type='submit'>Sign In</button>
        </form>
        <p>
          Don't have an account?
          <Link to='/sign-up'> Create one here</Link>
        </p>
      </div>
    </div>
  )
}

export default Login
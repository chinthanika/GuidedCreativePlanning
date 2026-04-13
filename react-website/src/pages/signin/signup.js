import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { auth, database } from '../../Firebase/firebase.js'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { ref, set } from 'firebase/database'
import '../../forms.css'

function SignUp() {
  const [username, setUsername] = useState('')
  const [realName, setRealName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const validatePassword = () => {
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return false
    }
    return true
  }

  const register = async (e) => {
    e.preventDefault()
    setError('')

    if (!validatePassword()) return
    if (!username) {
      setError("Username is required")
      return
    }

    const safeUsername = username.trim().toLowerCase().replace(/\s+/g, "_")
    const fakeEmail = `${safeUsername}@workshop.local`

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, fakeEmail, password)
      const uid = userCredential.user.uid

      // Save profile info in Realtime Database
      await set(ref(database, "users/" + uid), {
        username: safeUsername,
        realName: realName
      })

      navigate("/")
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className='center'>
      <div className='auth'>
        <h1>Register</h1>
        {error && <div className='auth__error'>{error}</div>}
        <form onSubmit={register}>
          <input
            type='text'
            value={username}
            placeholder="Choose a username"
            required
            onChange={e => setUsername(e.target.value)} />

          <input
            type='text'
            value={realName}
            placeholder="Enter your real name"
            required
            onChange={e => setRealName(e.target.value)} />

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
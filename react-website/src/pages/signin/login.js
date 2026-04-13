import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from '../../Firebase/firebase.js'
import '../../forms.css'

function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const login = async (e) => {
    e.preventDefault()
    setError("")

    const safeUsername = username.trim().toLowerCase().replace(/\s+/g, "_")
    const fakeEmail = `${safeUsername}@workshop.local`

    try {
      await signInWithEmailAndPassword(auth, fakeEmail, password)
      navigate("/")
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className='center'>
      <div className='auth'>
        <h1>Sign In</h1>
        {error && <div className='auth__error'>{error}</div>}
        <form onSubmit={login}>
          <input
            type='text'
            value={username}
            required
            placeholder="Enter your username"
            onChange={e => setUsername(e.target.value)} />

          <input
            type='password'
            value={password}
            required
            placeholder='Enter your password'
            onChange={e => setPassword(e.target.value)} />

          <button type='submit' className="form-btn">Sign In</button>
        </form>
        <p>
          Don't have an account?
          <Link to='/register'> Create one here </Link>
        </p>
      </div>
    </div>
  )
}

export default Login;
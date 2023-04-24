import {Navigate} from 'react-router-dom'
import {useAuthValue} from './Firebase/AuthContext'

//Prevent users who haven't verified their email addressfrom viewing a component
//If not verified, it will return to the sign-in page
export default function PrivateRoute({children}) {
  const {currentUser} = useAuthValue()

  if(!currentUser?.emailVerified){
    return <Navigate to='/login' replace/>
  }

  return children
}
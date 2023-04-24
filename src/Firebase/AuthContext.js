import React, { useContext } from 'react'

const AuthContext = React.createContext()   //Creates a context object of React's Context API

//Share the value of the user’s state to all the children of AuthContext.Provider

/*Returns
* Provider : React.Provider
*/
export function AuthProvider({ children, value }) {
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

//Access the value passed to AuthContext.Provider

/*Returns
* Current Context Value : Any
*/
export function useAuthValue() {
  return useContext(AuthContext)
}
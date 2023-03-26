import React from "react";

import { Nav, NavLink, NavMenu } 
    from "./NavbarElements";
  
const Navbar = () => {
  return (
    <>
      <Nav>
        <NavMenu>
          <NavLink to="/sign-up">
            Sign Up
          </NavLink>
          <NavLink to="/login">
            Sign In
          </NavLink>
        </NavMenu>
      </Nav>
    </>
  );
};
  
export default Navbar;
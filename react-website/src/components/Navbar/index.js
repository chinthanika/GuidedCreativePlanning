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
          <NavLink to="/profile">
            Profile
          </NavLink>
          <NavLink to="/new-story">
            New Story
          </NavLink>
          <NavLink to="/character-map">
            Character Map
          </NavLink>
          <NavLink to="/story-timeline">
            Timeline
          </NavLink>
        </NavMenu>
      </Nav>
    </>
  );
};
  
export default Navbar;
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
          <NavLink to="/map-generator">
            Map Generator
          </NavLink>
          <NavLink to="/story-map">
            Story Map
          </NavLink>
          <NavLink to="/story-timeline">
            Timeline
          </NavLink>
          <NavLink to="/story-editor">
            Story Editor
          </NavLink>
        </NavMenu>
      </Nav>
    </>
  );
};
  
export default Navbar;
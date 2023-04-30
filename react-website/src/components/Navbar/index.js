import React from "react";

import { LogoContainer, LogoWithName , Nav, NavLink, NavMenu } 
    from "./NavbarElements";
import Logo from "./Logo";
  
const Navbar = () => {
  return (
    <>
      <Nav>
        <NavMenu>
          <LogoWithName>
            HummingBird
          </LogoWithName>
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
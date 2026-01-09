import React from "react";
import { Nav, NavLink, NavMenu, NavRight, ProfileIcon, AuthButtons } from "./NavbarElements";
import { FaUserCircle } from "react-icons/fa"; // Profile icon
import { useAuth } from "./useAuth"; // Custom hook to check if the user is logged in

const Navbar = () => {
  const { isLoggedIn } = useAuth(); // Check if the user is logged in

  return (
    <Nav>
      {/* Centered Navigation Links */}
      <NavMenu>
        <NavLink to="/map-generator">Map Generator</NavLink>
        <NavLink to="/story-map">Story Map</NavLink>
        <NavLink to="/mentor-text">Mentor Text</NavLink>
        <NavLink to="/story-timeline">Timeline</NavLink>
        <NavLink to="/story-world">World</NavLink>
        <NavLink to="/chatbot">Chatbot</NavLink>
        <NavLink to="/library">Library</NavLink>
        <NavLink to="/story-editor">Story Editor</NavLink>
      </NavMenu>

      {/* Right-Aligned Section */}
      <NavRight>
        {/* Profile Icon */}
        {isLoggedIn && (
          <NavLink to="/profile">
            <ProfileIcon>
              <FaUserCircle size={24} />
            </ProfileIcon>
          </NavLink>
        )}

        {/* Sign In/Sign Up Buttons */}
        {!isLoggedIn && (
          <AuthButtons>
            <NavLink to="/sign-up">Sign Up</NavLink>
            <NavLink to="/login">Sign In</NavLink>
          </AuthButtons>
        )}
      </NavRight>
    </Nav>
  );
};

export default Navbar;
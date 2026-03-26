import React from "react";
import { Nav, NavLink, NavMenu, NavRight, ProfileIcon, AuthButtons } from "./NavbarElements";
import { FaUserCircle } from "react-icons/fa";
import { useAuth } from "./useAuth";
import { useAuthValue } from "../../Firebase/AuthContext";

const ADMIN_UIDS = ['04E9XYnVi8QD3yHAIXeBHCRp2sN2'];

const Navbar = () => {
  const { isLoggedIn } = useAuth();
  const { currentUser } = useAuthValue();
  const isAdmin = currentUser && ADMIN_UIDS.includes(currentUser.uid);

  return (
    <Nav>
      <NavMenu>
        <NavLink to="/map-generator">Map Generator</NavLink>
        <NavLink to="/story-map">Story Map</NavLink>
        <NavLink to="/mentor-text">Mentor Text</NavLink>
        <NavLink to="/story-timeline">Timeline</NavLink>
        <NavLink to="/story-world">World</NavLink>
        <NavLink to="/chatbot">Chatbot</NavLink>
        <NavLink to="/library">Library</NavLink>
        <NavLink to="/story-editor">Story Editor</NavLink>
        {isAdmin && <NavLink to="/admin-dashboard">Admin Dashboard</NavLink>}
      </NavMenu>

      <NavRight>
        {isLoggedIn && (
          <NavLink to="/profile">
            <ProfileIcon>
              <FaUserCircle size={24} />
            </ProfileIcon>
          </NavLink>
        )}
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
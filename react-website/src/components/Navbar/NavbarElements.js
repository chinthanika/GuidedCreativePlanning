import { FaBars } from "react-icons/fa";
import { NavLink as Link } from "react-router-dom";
import styled from "styled-components";
  
export const Nav = styled.nav`
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 60px;
  background-color: #111111;
  padding: 0 20px;
  position: sticky;  /* ADD THIS */
  top: 0;            /* ADD THIS */
  z-index: 1000;     /* ADD THIS */
`;
  
export const NavLink = styled(Link)`
  color: #EEEEEE;
  display: flex;
  align-items: center;
  text-decoration: none;
  padding: 0 1rem;
  height: 100%;
  cursor: pointer;
  &.active {
    color: #4d4dff;
  }
`;

export const NavMenu = styled.div`
  display: flex;
  gap: 20px;
  justify-content: center;
  align-items: center;

  a {
    color: #eeeeee;
    text-decoration: none;
    font-size: 16px;

    &:hover {
      color: #4d4dff;
    }
  }
`;
  
export const NavRight = styled.div`
  display: flex;
  align-items: center;
  gap: 20px;
`;

// Profile icon
export const ProfileIcon = styled.div`
  color: #eeeeee;
  cursor: pointer;

  &:hover {
    color: #4d4dff;
  }
`;

// Auth buttons (Sign In/Sign Up)
export const AuthButtons = styled.div`
  display: flex;
  gap: 10px;

  a {
    color: #eeeeee;
    text-decoration: none;
    font-size: 14px;
    padding: 5px 10px;
    border: 1px solid #eeeeee;
    border-radius: 4px;

    &:hover {
      background-color: #4d4dff;
      color: #ffffff;
    }
  }
`;
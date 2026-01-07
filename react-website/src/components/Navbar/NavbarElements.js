import { FaBars } from "react-icons/fa";
import { NavLink as Link } from "react-router-dom";
import styled from "styled-components";
  
export const Nav = styled.nav`
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 60px;
  background-color: #FFFFFF;
  padding: 0 20px;
  position: sticky;
  top: 0;
  z-index: 1000;
  border-bottom: 1px solid #E7E5E4;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
`;
  
export const NavLink = styled(Link)`
  color: #52525B;
  display: flex;
  align-items: center;
  text-decoration: none;
  padding: 0 1rem;
  height: 100%;
  cursor: pointer;
  font-size: 15px;
  font-weight: 400;
  transition: color 0.2s ease;
  
  &:hover {
    color: #27272A;
  }
  
  &.active {
    color: #27272A;
    font-weight: 500;
    border-bottom: 2px solid #27272A;
  }
`;

export const NavMenu = styled.div`
  display: flex;
  gap: 8px;
  justify-content: center;
  align-items: center;
  height: 100%;
`;
  
export const NavRight = styled.div`
  display: flex;
  align-items: center;
  gap: 20px;
`;

export const ProfileIcon = styled.div`
  color: #52525B;
  cursor: pointer;
  display: flex;
  align-items: center;
  transition: color 0.2s ease;

  &:hover {
    color: #27272A;
  }
`;

export const AuthButtons = styled.div`
  display: flex;
  gap: 10px;

  a {
    color: #27272A;
    text-decoration: none;
    font-size: 14px;
    padding: 8px 16px;
    border: 1px solid #E7E5E4;
    border-radius: 6px;
    background-color: #F5F5F4;
    transition: all 0.2s ease;
    font-weight: 400;

    &:hover {
      background-color: #27272A;
      color: #FFFFFF;
      border-color: #27272A;
    }

    &:first-child {
      background-color: transparent;
      
      &:hover {
        background-color: #F5F5F4;
        color: #27272A;
      }
    }
  }
`;
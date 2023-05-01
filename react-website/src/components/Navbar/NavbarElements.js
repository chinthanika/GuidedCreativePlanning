import { FaBars } from "react-icons/fa";
import { NavLink as Link } from "react-router-dom";
import styled from "styled-components";
import Logo from "./Logo";
  
// Styled component for navigation
export const Nav = styled.nav`
  background: #111111;
  height: 85px;
  display: flex;
  justify-content: space-between;
  padding: 0.2rem calc((100vw - 1000px) / 2);
  z-index: 12;
`;
  
// Styled component for navigation links
export const NavLink = styled(Link)`
  color: #F8F3D4;
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
  
// Styled FaBars component
export const Bars = styled(FaBars)`
  display: none;
  color: #808080;
  @media screen and (max-width: 768px) {
    display: block;
    position: absolute;
    top: 0;
    right: 0;
    transform: translate(-100%, 75%);
    font-size: 1.8rem;
    cursor: pointer;
  }
`;
  
// Styled component for the navigation menu
export const NavMenu = styled.div`
  display: flex;
  align-items: center;
  margin-right: -24px;
  /* Second Nav */
  /* margin-right: 24px; */
  /* Third Nav */
  /* width: 100vw;
white-space: nowrap; */
  @media screen and (max-width: 768px) {
    display: none;
  }
`;


// Styled component for the logo
export const LogoContainer = styled.div`
  display: flex;
  align-items: center;
`;

//Styled component for the brand name
export const BrandName = styled.h1`
  color: #F8F3D4;
  margin-left: 1px;
`;

// Styled component for the logo and brand name
 export const LogoWithName = () => (
  <LogoContainer>
    <Logo />
    <BrandName>HummingBird</BrandName>
  </LogoContainer>
);
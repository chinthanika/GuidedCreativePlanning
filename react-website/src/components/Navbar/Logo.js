import React from 'react';

//Renders the favicon in the public folder as a logo
const Logo = () => (
  <img
    src={`${process.env.PUBLIC_URL}/favicon.ico`}
    alt="Logo"
    style={{ width: 'auto', height: '40px' }}
  />
);

export default Logo;
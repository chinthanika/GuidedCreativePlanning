import React from 'react';

const Logo = () => (
  <img
    src={`${process.env.PUBLIC_URL}/favicon.ico`}
    alt="Logo"
    style={{ width: 'auto', height: '40px' }} // Adjust the width and height as needed
  />
);

export default Logo;
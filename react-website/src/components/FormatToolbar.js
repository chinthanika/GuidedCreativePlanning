import React from "react";

// Serves as a toolbar to format text in the text editor
const FormatToolbar = (props) => (
    <div className="format-toolbar">{props.children}</div>
);

export default FormatToolbar;
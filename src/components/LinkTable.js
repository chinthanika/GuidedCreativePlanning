import React, { useState, useEffect } from "react";

import 'firebase/database'

import { useAuthValue } from '../Firebase/AuthContext'
import { database } from '../Firebase/firebase'
import { ref, set } from "firebase/database"

import CreateIcon from "@material-ui/icons/Create";
import {
    Box, Button, Snackbar, Table,
    TableBody, TableCell, TableHead, TableRow
} from "@material-ui/core";
import DeleteOutlineIcon from "@material-ui/icons/DeleteOutline";
import AddBoxIcon from "@material-ui/icons/AddBox";
import DoneIcon from "@material-ui/icons/Done";
import ClearIcon from "@material-ui/icons/Clear";
import CancelIcon from '@material-ui/icons/Cancel';

import { makeStyles } from "@material-ui/core/styles";

import Alert from "@material-ui/lab/Alert";

import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogContentText from "@material-ui/core/DialogContentText";
import DialogTitle from "@material-ui/core/DialogTitle";

// Creating styles
const useStyles = makeStyles({
    root: {
        "& > *": {
            borderBottom: "unset",
        },
    },
    table: {
        minWidth: 650,
    },
    snackbar: {
        bottom: "104px",
    },
});


function LinkTable({ links, nodes }) {

    const { currentUser } = useAuthValue()

    // Creating style object
    const classes = useStyles();

    const [source, setSource] = useState("");
    const [target, setTarget] = useState("");
    const [rowToDelete, setRowToDelete] = useState(0);


    // Defining a state named rows
    // which we can update by calling on setRows function
    const [rows, setRows] = useState([{
        id: 0,
        source: "",
        link: "",
        target: "",
    },
    ]);

    useEffect(() => {
        const newRows = links.map((link, index) => ({
            key: `link-${index + 1}`,
            source: link.source.id || link.source,
            link: link.link,
            target: link.target.id || link.target,
            id: index + 1
        }));
        setRows(newRows);
    }, [links]);

    // Initial states
    const [open, setOpen] = React.useState(false);
    const [isEdit, setEdit] = React.useState(false);
    const [disable, setDisable] = React.useState(true);
    const [showConfirm, setShowConfirm] = React.useState(false);

    const [originalRows, setOriginalRows] = useState([]);

    useEffect(() => {
        setOriginalRows(rows);
    }, [rows]);

    const handleCancel = () => {
        setRows(originalRows);
        setEdit(false);
    };

    // Function For closing the alert snackbar
    const handleClose = (event, reason) => {
        if (reason === "clickaway") {
            return;
        }
        setOpen(false);
    };

    // Function For adding new row object
    const handleAdd = () => {
        setRows([
            ...rows,
            {
                id: rows.length + 1,
                source: "",
                link: "",
                target: ""
            },
        ]);
        setEdit(true);
    };

    // Function to handle edit
    const handleEdit = (i) => {
        // If edit mode is true setEdit will 
        // set it to false and vice versa
        setEdit(!isEdit);
    };

    // Function to handle save
    const handleSave = () => {
        setEdit(!isEdit);
        setRows(rows);
        setDisable(true);
        setOpen(true);

        // update Firebase database
        rows.forEach((row) => {
            set(ref(database, `stories/${currentUser.uid}/graph/links/${(row.id - 1)}`), {
                source: row.source.trim(),
                link: row.link.trim(),
                target: row.target.trim(),
            });
        });
    };

    // The handleInputChange handler can be set up to handle
    // many different inputs in the form, listen for changes 
    // to input elements and record their values in state
    const handleInputChange = (e, index) => {
        setDisable(false);
        const { name, value } = e.target;
        const list = [...rows];
        list[index][name] = value;
        setRows(list);
    };

    const handleSourceChange = (e, index) => {
        setDisable(false);
        setSource(e.target.value);
        const { name, value } = e.target;
        const list = [...rows];
        list[index][name] = value;
        setRows(list);
    }

    const handleTargetChange = (e, index) => {
        setDisable(false);
        setTarget(e.target.value);
        const { name, value } = e.target;
        const list = [...rows];
        list[index][name] = value;
        setRows(list);
    }

    // Showing delete confirmation to users
    const handleConfirm = (i) => {
        setRowToDelete(i);

        setShowConfirm(true);
    };

    // Handle the case of delete confirmation where 
    // user click yes delete a specific row of id:i
    // Handle the case of delete confirmation where 
    // user click yes delete a specific row of id:i
    const handleRemoveClick = () => {
        const list = [...rows];
        list.splice(rowToDelete - 1, 1);
        setRows(list);
        setShowConfirm(false);

        set(ref(database, `stories/${currentUser.uid}/graph/links/${(rowToDelete - 1)}`), null);
    };

    // Handle the case of delete confirmation 
    // where user click no 
    const handleNo = () => {
        setShowConfirm(false);
    };

    return (
        <TableBody>
            <Snackbar
                open={open}
                autoHideDuration={2000}
                onClose={handleClose}
                className={classes.snackbar}
            >
                <Alert onClose={handleClose} severity="success">
                    Record saved successfully!
                </Alert>
            </Snackbar>
            <Box margin={1}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div>
                        {isEdit ? (
                            <div>
                                <Button onClick={handleAdd}>
                                    <AddBoxIcon onClick={handleAdd} />
                                    ADD
                                </Button>
                                {rows.length !== 0 && (
                                    <div>
                                        {disable ? (
                                            <Button disabled align="right" onClick={handleSave}>
                                                <DoneIcon />
                                                SAVE
                                            </Button>
                                        ) : (
                                            <Button align="right" onClick={handleSave}>
                                                <DoneIcon />
                                                SAVE
                                            </Button>
                                        )}
                                        <Button onClick={handleCancel}>
                                            <CancelIcon />
                                            CANCEL
                                        </Button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div>
                                <Button onClick={handleAdd}>
                                    <AddBoxIcon onClick={handleAdd} />
                                    ADD
                                </Button>
                                <Button align="right" onClick={handleEdit}>
                                    <CreateIcon />
                                    EDIT
                                </Button>

                            </div>
                        )}
                    </div>
                </div>
                <TableRow align="center"></TableRow>

                <Table
                    className={classes.table}
                    size="small"
                    aria-label="a dense table"
                >
                    <caption>Links</caption>
                    <TableHead>
                        <TableRow key="TableRow">
                            <TableCell align="left">ID</TableCell>
                            <TableCell align="center">Source</TableCell>
                            <TableCell align="center">Link</TableCell>
                            <TableCell align="center">Target</TableCell>
                            <TableCell align="center">Delete</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {rows.map((row, i) => {
                            return (
                                <div>
                                    <TableRow key={i}>
                                        {isEdit ? (
                                            <div>
                                                <TableCell padding="none" key={`edit-source-${i}`}>
                                                    <select
                                                        style={{ width: "100px" }}
                                                        name="source"
                                                        value={row.source}
                                                        onChange={(e) => handleSourceChange(e, i)}
                                                    >
                                                        <option value="">{row.source}</option>
                                                        {nodes.map(nodes => <option>{nodes.id}</option>)}
                                                    </select>
                                                </TableCell>
                                                <TableCell padding="none" align="center" key={`edit-link-${i}`}>
                                                    <input
                                                        value={row.link}
                                                        name="link"
                                                        onChange={(e) => handleInputChange(e, i)}
                                                    />
                                                </TableCell>
                                                <TableCell padding="none" key={`edit-target-${i}`}>
                                                    <select
                                                        style={{ width: "100px" }}
                                                        name="target"
                                                        value={row.target}
                                                        onChange={(e) => handleTargetChange(e, i)}
                                                    >
                                                        <option value="">{row.target}</option>
                                                        {nodes.map(nodes => <option>{nodes.id}</option>)}
                                                    </select>
                                                </TableCell>
                                            </div>
                                        ) : (
                                            <div>
                                                <TableCell scope="row" align="left" key={`id-${i}`}>
                                                    {row.id}
                                                </TableCell>
                                                <TableCell scope="row" align="center" key={`source-${i}`}>
                                                    {row.source}
                                                </TableCell>
                                                <TableCell scope="row" align="center" key={`link-${i}`}>
                                                    {row.link}
                                                </TableCell>
                                                <TableCell scope="row" align="center" key={`target-${i}`}>
                                                    {row.target}
                                                </TableCell>
                                                <TableCell scope="row" align="center" key={`buttons-${i}`}>
                                                    {isEdit ? (
                                                        <Button className="mr10" onClick={handleConfirm}>
                                                            <ClearIcon />
                                                        </Button>
                                                    ) : (
                                                        <Button className="mr10" onClick={() => handleConfirm(row.id)}>
                                                            <DeleteOutlineIcon />
                                                        </Button>
                                                    )}
                                                    {showConfirm && (
                                                        <div>
                                                            <Dialog
                                                                open={showConfirm}
                                                                onClose={handleNo}
                                                                aria-labelledby="alert-dialog-title"
                                                                aria-describedby="alert-dialog-description"
                                                            >
                                                                <DialogTitle id="alert-dialog-title">
                                                                    {"Confirm Delete"}
                                                                </DialogTitle>
                                                                <DialogContent>
                                                                    <DialogContentText id="alert-dialog-description">
                                                                        Are you sure you want to delete this row?
                                                                    </DialogContentText>
                                                                </DialogContent>
                                                                <DialogActions>
                                                                    <Button
                                                                        onClick={() => handleRemoveClick()}
                                                                        color="primary"
                                                                        autoFocus
                                                                    >
                                                                        Yes
                                                                    </Button>
                                                                    <Button
                                                                        onClick={handleNo}
                                                                        color="primary"
                                                                        autoFocus
                                                                    >
                                                                        No
                                                                    </Button>
                                                                </DialogActions>
                                                            </Dialog>
                                                        </div>
                                                    )}
                                                </TableCell>
                                            </div>
                                        )}

                                    </TableRow>
                                </div>
                            );
                        })}
                    </TableBody>
                </Table>
            </Box>
        </TableBody>
    );
}

export default LinkTable;
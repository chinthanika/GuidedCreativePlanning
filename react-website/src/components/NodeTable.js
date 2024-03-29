import React, { useState, useEffect } from "react";

import 'firebase/database'

import { useAuthValue } from '../Firebase/AuthContext'
import { database } from '../Firebase/firebase'
import { ref, set, remove } from "firebase/database"

import CreateIcon from "@material-ui/icons/Create";
import {
    Box, Button, Snackbar, Table,
    TableBody, TableCell, TableHead, TableRow
} from "@material-ui/core";
import DeleteOutlineIcon from "@material-ui/icons/DeleteOutline";
import AddBoxIcon from "@material-ui/icons/AddBox";
import DoneIcon from "@material-ui/icons/Done";
import ClearIcon from "@material-ui/icons/Clear";

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


function NodeTable({ nodes }) {

    const { currentUser } = useAuthValue()

    // Creating style object
    const classes = useStyles();

    const [rowToDelete, setRowToDelete] = useState(0);

    // Defining a state named rows
    // which we can update by calling on setRows function
    const [rows, setRows] = useState([
        { id: 1, name: "", level: 1, },
    ]);

    useEffect(() => {
        const newRows = nodes.map((node, index) => ({
            key: `node-${index + 1}`,
            name: node.id.trim(),
            level: node.level,
            id: index + 1,
        }));
        setRows(newRows);
    }, [nodes]);

    // Initial states
    const [open, setOpen] = React.useState(false);
    const [isEdit, setEdit] = React.useState(false);
    const [disable, setDisable] = React.useState(true);
    const [showConfirm, setShowConfirm] = React.useState(false);

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
                name: "",
                level: 0
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
            set(ref(database, `stories/${currentUser.uid}/graph/nodes/${(row.id - 1)}`), {
                id: row.name
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

    // Showing delete confirmation to users
    const handleConfirm = (i) => {
        setRowToDelete(i);

        setShowConfirm(true);
    };


    // Handle the case of delete confirmation where 
    // user click yes delete a specific row of id:i
    const handleRemoveClick = () => {
        const list = [...rows];
        list.splice(rowToDelete - 1, 1);
        setRows(list);
        setShowConfirm(false);

        remove(ref(database, `stories/${currentUser.uid}/graph/nodes/${(rowToDelete - 1)}`));
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
                    <caption>Nodes</caption>
                    <TableHead>                       
                        <TableRow>
                            <TableCell align="left">ID</TableCell>
                            <TableCell align="center">Name</TableCell>
                            <TableCell align="center">Level</TableCell>
                            <TableCell align="center"> Delete </TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {rows.map((row, i) => {
                            return (
                                <div>
                                    <TableRow key={i}>
                                        {isEdit ? (
                                            <div>
                                                <TableCell padding="none" align="center" key={`edit-name-${i}`}>
                                                    <input
                                                        value={row.name}
                                                        name="name"
                                                        onChange={(e) => handleInputChange(e, i)}
                                                    />
                                                </TableCell>
                                            </div>
                                        ) : (
                                            <div>
                                                <TableCell scope="row" align="left" key={`id-${i}`}>
                                                    {row.id}
                                                </TableCell>
                                                <TableCell scope="row" align="center" key={`name-${i}`}>
                                                    {row.name}
                                                </TableCell>
                                                <TableCell scope="row" align="center" key={`level-${i}`}>
                                                    {row.level}
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

export default NodeTable;
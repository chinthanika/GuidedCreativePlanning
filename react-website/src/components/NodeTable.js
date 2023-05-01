import React, { useState, useEffect } from "react";

import 'firebase/database'

import { useAuthValue } from '../Firebase/AuthContext'
import { database } from '../Firebase/firebase'
import { ref, set, remove } from "firebase/database"

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

function NodeTable({ nodes, links }) {

    const { currentUser } = useAuthValue()

    // Creating style object
    const classes = useStyles();

    const [rowToDelete, setRowToDelete] = useState(0);

    // Defining a state named rows
    // which we can update by calling on setRows function
    const [rows, setRows] = useState([
        { id: 1, name: "", level: 0, },
    ]);

    useEffect(() => {
        const newRows = nodes.map((node, index) => ({
            key: `node-${index + 1}`,
            name: node.id,
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

    // Close the alert snackbar
    const handleClose = (event, reason) => {
        if (reason === "clickaway") {
            return;
        }
        setOpen(false);
    };

    // Add new row object
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

    // Handle save
    const handleSave = () => {
        setEdit(!isEdit);
        setRows(rows);
        setDisable(true);
        setOpen(true);

        // Update Firebase database
        rows.forEach((row) => {
            set(ref(database, `stories/${currentUser.uid}/graph/nodes/${(row.id - 1)}`), {
                id: row.name,
                level: 1
            });
        });
    };

    // Handle a change in the node name
    const handleInputChange = (e, index) => {
        setDisable(false);
        const { name, value } = e.target;

        const list = [...rows];
        list[index][name] = value;
        setRows(list);
    };
    // Show delete confirmation to users
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

        links.forEach((link, index) => {
            console.log(rowToDelete.name)
            if (link.source === rowToDelete.name || link.target === rowToDelete.name) {
                remove(ref(database, `stories/${currentUser.uid}/graph/links/${index}`));
            }
        })

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
                            </div>
                        )}
                    </div>
                </div>
                <TableRow align="center"> </TableRow>

                <Table
                    className={classes.table}
                    size="small"
                    aria-label="a dense table"
                >
                    <caption>Nodes</caption>
                    <TableHead>
                        <TableRow>
                            <TableCell align="left" >ID</TableCell>
                            <TableCell align="center" >Name</TableCell>
                            <TableCell align="center">Level</TableCell>
                            <TableCell align="center"> Delete </TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {rows.map((row, i) => {
                            return (
                                <div>
                                    <TableRow >
                                        {isEdit ? (
                                            <div>
                                                <TableCell padding="none" align="center">
                                                    <input
                                                        value={row.name}
                                                        name="name"
                                                        onChange={(e) => handleInputChange(e, i)}
                                                    />
                                                </TableCell>
                                            </div>
                                        ) : (
                                            <div>
                                                <TableCell scope="row" align="left">
                                                    {row.id}
                                                </TableCell>
                                                <TableCell scope="row" align="center">
                                                    {row.name}
                                                </TableCell>
                                                <TableCell scope="row" align="center">
                                                    {row.level}
                                                </TableCell>
                                                <TableCell scope="row" align="center">
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
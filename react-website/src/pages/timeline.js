import React, { useState, useEffect, useRef } from "react";
import {
    MDBBtn,
    MDBCol,
    MDBContainer,
    MDBRow,
    MDBTypography,
} from "mdb-react-ui-kit";

import DeleteOutlineIcon from "@material-ui/icons/DeleteOutline";

import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogContentText from "@material-ui/core/DialogContentText";
import DialogTitle from "@material-ui/core/DialogTitle";

import moment from "moment";
import Draggable from "react-draggable";

import 'firebase/database'; // Import the Firebase Realtime Database
import { set, ref, onValue, get, push, query, remove } from "firebase/database"; // Import database functions from Firebase
import { useAuthValue } from '../Firebase/AuthContext'; // Import a custom hook for accessing Firebase authentication
import { database } from '../Firebase/firebase'; // Import the Firebase configuration and initialize the Firebase app


import "./timeline.css";

function StoryTimeline({ isVertical = false }) {

    const { currentUser } = useAuthValue(); // Get the current user from Firebase authentication
    const userId = currentUser ? currentUser.uid : null;
    const stageIndices = {}; // to track position within each stage

    const stages = [
        "introduction",
        "rising action",
        "climax",
        "falling action",
        "resolution",
    ]

    const stageColours = {
        introduction: "#A7C7E7",
        "rising action": "#C1E1C1",
        climax: "#FAA0A0",
        "falling action": "#FFFAA0",
        resolution: "#C3B1E1",
    };

    const timelineRef = ref(database, `stories/${userId}/timeline/`);

    const [events, setEvents] = useState([]);

    const [showDescription, setShowDescription] = useState(null);

    const [isDeleting, setIsDeleting] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [eventToDelete, setEventToDelete] = useState(null);
    const [stageCounts, setStageCounts] = useState({
        introduction: 0,
        "rising action": 0,
        climax: 0,
        "falling action": 0,
        resolution: 0
    });

    const [viewMode, setViewMode] = useState("linear");

    const [newEvent, setNewEvent] = useState({
        date: "",
        title: "",
        description: "",
        isMainEvent: false,
        stage: stages[0],
    });
    const [showNewEventForm, setShowNewEventForm] = useState(false);

    const sampleEvents =
        [
            {
                index: 0,
                date: "02/06/2022",
                title: "The First Murder",
                isMainEvent: true,
                description:
                    "Tom, a student at X university, is found dead in his room.",
                stage: stages[0],
            },
            {
                index: 1,
                date: "05/06/2022",
                title: "James Enters the Scene",
                isMainEvent: false,
                description:
                    "Tom's parents employ private detective James to find justice for their son.",
                stage: stages[1],
            },
            {
                index: 2,
                date: "07/06/2022",
                title: "Tom's Crime Scene",
                isMainEvent: false,
                description:
                    "James visits the crime scene.",
                stage: stages[1],
            },
            {
                index: 3,
                date: "08/06/2022",
                title: "The Second Murder",
                isMainEvent: true,
                description:
                    "Another student, Lea, is found dead in the kitchens.",
                stage: stages[2],
            },
            {
                index: 4,
                date: "09/06/2022",
                title: "The Murderer is Found",
                isMainEvent: true,
                description:
                    "It's Joe!!!",
                stage: stages[3],
            },
            {
                index: 5,
                date: "09/06/2022",
                title: "The Murderer is Sent to Jail",
                isMainEvent: true,
                description:
                    "Mwahahahahahaha",
                stage: stages[4],
            }
        ];

    const renderEvents = () => {
        return events.map((event) => (
            <div
                key={event.index}
                className={`timeline-event ${event.stage}`}
                style={{
                    backgroundColor: stageColours[event.stage],
                    marginBottom: isVertical ? "20px" : "0", // Add spacing for vertical layout
                    cursor: isDeleting ? "pointer" : "default", // Change cursor to pointer when deleting
                }}
                onClick={() => handleCircleClick(event, "delete-target")} // Trigger delete logic
            >
                <div className="circle">
                    <span className="event-title">
                        {event.title}
                    </span>
                    {isDeleting && (
                        <DeleteOutlineIcon
                            className="delete-icon"
                            onClick={() => handleCircleClick(event, "delete-target")}
                        />
                    )}
                </div>
            </div>
        ));
    };

    useEffect(() => {
        // Fetch initial data synchronously
        get(timelineRef)
            .then((snapshot) => {
                const data = snapshot.val();
                if (data) {
                    const eventsArray = Object.keys(data).map((key, index) => ({
                        ...data[key],
                        id: key,
                        index: index,
                    }));
                    const sortedEvents = eventsArray.sort((a, b) =>
                        moment(a.date, "DD/MM/YYYY").diff(moment(b.date, "DD/MM/YYYY"))
                    );
                    setEvents(sortedEvents);
                    setStageCounts({
                        introduction: sortedEvents.filter((event) => event.stage === "introduction").length,
                        risingAction: sortedEvents.filter((event) => event.stage === "rising action").length,
                        climax: sortedEvents.filter((event) => event.stage === "climax").length,
                        fallingAction: sortedEvents.filter((event) => event.stage === "falling action").length,
                        resolution: sortedEvents.filter((event) => event.stage === "resolution").length,
                    });
                } else {
                    setEvents(sampleEvents);
                }
            })
            .catch((error) => {
                console.error("Error fetching initial data:", error);
            });

        // Set up real-time listener
        const unsubscribe = onValue(timelineRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const eventsArray = Object.keys(data).map((key, index) => ({
                    ...data[key],
                    id: key,
                    index: index,
                }));
                const sortedEvents = eventsArray.sort((a, b) =>
                    moment(a.date, "DD/MM/YYYY").diff(moment(b.date, "DD/MM/YYYY"))
                );
                setEvents(sortedEvents);
            } else {
                setEvents(sampleEvents);
            }
        });

        return () => {
            unsubscribe(); // Clean up the listener when the component unmounts
        };
    }, [timelineRef]);

    // Toggle view mode
    const toggleViewMode = () => {
        setViewMode((prevMode) => (prevMode === "linear" ? "freytag" : "linear"));
    };

    const handleAddEvent = () => {
        if (
            moment(newEvent.date, "DD/MM/YYYY", true).isValid() &&
            newEvent.title &&
            newEvent.description
        ) {
            setEvents([...events, newEvent].sort((a, b) => {
                return moment(a.date, "DD/MM/YYYY").diff(moment(b.date, "DD/MM/YYYY"));
            }));
            setNewEvent({
                date: "",
                title: "",
                description: "",
                isMainEvent: false,
                stage: stages[0],
            });
            setShowNewEventForm(false);

            // Check if the timeline node exists and create it if necessary
            const timelineRef = ref(database, `stories/${userId}/timeline/`);
            const timelineQuery = query(timelineRef);
            get(timelineQuery).then((snapshot) => {
                if (!snapshot.exists()) {
                    set(timelineRef, {}); // Set an empty object to create the timeline node
                }
                // Add the new event to Firebase
                const newEventRef = push(timelineRef); // Generate a new child node with a unique key under the timeline node
                set(newEventRef, newEvent); // Set the event data under the new child node
            }).catch((error) => {
                console.log(error);
            });
        }
    };

    const handleDeleteMode = () => {
        console.log("Delete mode activated");
        setIsDeleting(!isDeleting);
    };

    const handleShowNewEventForm = () => {
        setShowNewEventForm(true);
    };

    const handleCancelAddEvent = () => {
        setNewEvent({ date: '', title: '', description: '' });
        setShowNewEventForm(false);
    };

    const handleDeleteEvent = () => {
        console.log("Deleting event:", eventToDelete);
        const filteredEvents = events.filter((e) => e.id !== eventToDelete.id);
        setEvents(filteredEvents); // Update the state

        // Delete the event from Firebase
        const eventRef = ref(database, `stories/${userId}/timeline/${eventToDelete.id}`);
        remove(eventRef)
            .then(() => {
                console.log("Event deleted successfully");
            })
            .catch((error) => {
                console.error("Error deleting event:", error);
            });

        setShowDeleteModal(false); // Close the modal
    };

    const getEventPosition = (stage, index, stageCounts) => {
        const baseSpacing = 150; // Horizontal spacing
        const verticalSpacing = 50; // Vertical height per step
        const minStart = 350;
        const maxEnd = 250;

        const introY = 8 * verticalSpacing;
        const climaxY = 4 * verticalSpacing;

        // Horizontal start positions
        const introStartX = 0;
        const introEndX = introStartX + (stageCounts.introduction - 1) * baseSpacing;

        const risingStartX = introEndX + baseSpacing;
        const risingEndX = risingStartX + (stageCounts.risingAction - 1) * baseSpacing;

        const risingStartY = introY - baseSpacing;
        const risingEndY = -3 * verticalSpacing

        const climaxStartX = risingEndX + baseSpacing;
        const climaxEndX = climaxStartX + (stageCounts.climax - 1) * baseSpacing;

        const fallingStartX = climaxEndX + baseSpacing;
        const resolutionStartX = fallingStartX + (stageCounts.fallingAction) * baseSpacing;


        switch (stage) {
            case "introduction":
                return {
                    left: `${introStartX + index * baseSpacing}px`,
                    top: `${introY}px`
                };

            case "rising action":
                const risingRange = minStart - maxEnd;
                const risingStep = stageCounts.risingAction > 1 ? risingRange / (stageCounts.risingAction - 1) : 0;
                return {
                    left: `${risingStartX + index * baseSpacing}px`,
                    top: `${minStart - index * risingStep}px`
                };

            case "climax":
                return {
                    left: `${climaxStartX + index * baseSpacing}px`,
                    top: `${climaxY + 1}px`
                };

            case "falling action": {
                const start = 250;
                const end = 350;
                const range = end - start;
                const step = stageCounts.fallingAction > 1 ? range / (stageCounts.fallingAction - 1) : 0;
                return {
                    left: `${fallingStartX + index * baseSpacing}px`,
                    top: `${start + index * step}px`
                };
            }

            case "resolution":
                return {
                    left: `${resolutionStartX + index * baseSpacing}px`,
                    top: `${introY}px`
                };

            default:
                return { left: "0px", top: "0px" };
        }
    };

    const handleCircleClick = (event, target) => {
        console.log("Clicked event:", event);
        if (isDeleting && target === "delete-target") {
            setEventToDelete(event); // Set the event to delete
            setShowDeleteModal(true); // Show the delete confirmation modal
        } else {
            setShowDescription(showDescription === event.index ? null : event.index);
        }
    };
    return (
        <MDBContainer fluid className="py-5">
            {!isVertical && (
                <MDBBtn onClick={toggleViewMode} size="sm" className="toggle-view-btn">
                    {viewMode === "linear" ? "Switch to Freytag's Pyramid" : "Switch to Linear View"}
                </MDBBtn>
            )}
            <MDBRow>
                <MDBCol lg="9">
                    <div className="horizontal-timeline">
                        <div className="position-relative">
                            {showNewEventForm ? (
                                <div className="position-relative">
                                    <div className="event-date mb-2">
                                        <input
                                            type="text"
                                            className="form-control"
                                            placeholder="Date (dd/mm/yyyy)"
                                            value={newEvent.date}
                                            onChange={(e) =>
                                                setNewEvent({
                                                    ...newEvent,
                                                    date: e.target.value,
                                                })
                                            }
                                            pattern="\d{2}/\d{2}/\d{4}"
                                            required
                                        />
                                    </div>
                                    <div className="pb-4">
                                        <select
                                            className="form-control"
                                            value={newEvent.stage}
                                            onChange={(e) =>
                                                setNewEvent({
                                                    ...newEvent,
                                                    stage: e.target.value,
                                                })
                                            }
                                        >
                                            {stages.map((stage) => (
                                                <option key={stage} value={stage}>
                                                    {stage.replace(/^\w/, (c) => c.toUpperCase())} {/* Capitalize the first letter */}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="pb-4">
                                        <input
                                            type="text"
                                            className="form-control"
                                            placeholder="Title"
                                            value={newEvent.title}
                                            onChange={(e) =>
                                                setNewEvent({
                                                    ...newEvent,
                                                    title: e.target.value,
                                                })
                                            }
                                            required
                                        />
                                    </div>
                                    <div className="pb-4">
                                        <select
                                            className="form-control"
                                            value={newEvent.isMainEvent}
                                            onChange={(e) =>
                                                setNewEvent({
                                                    ...newEvent,
                                                    isMainEvent: e.target.value === "true",
                                                })
                                            }
                                        >
                                            <option value={false}>Not a main event</option>
                                            <option value={true}>Main event</option>
                                        </select>
                                    </div>
                                    <div className="pb-4">
                                        <textarea
                                            className="form-control"
                                            placeholder="Description"
                                            value={newEvent.description}
                                            onChange={(e) =>
                                                setNewEvent({
                                                    ...newEvent,
                                                    description: e.target.value,
                                                })
                                            }
                                            cols="40"
                                            rows="20"
                                            required
                                        />
                                    </div>
                                    <div className="d-flex justify-content-between">
                                        <MDBBtn
                                            onClick={handleAddEvent}
                                            size="sm"
                                            className="save-event-btn">
                                            Save
                                        </MDBBtn>
                                        <MDBBtn
                                            onClick={handleCancelAddEvent}
                                            size="sm"
                                            color="secondary"
                                            className="cancel-event-btn"
                                        >
                                            Cancel
                                        </MDBBtn>
                                    </div>
                                    <div
                                        className="position-absolute top-0 start-0 w-100 h-100"
                                        style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
                                        onClick={handleCancelAddEvent}
                                    />
                                </div>
                            ) : (
                                <>
                                    <MDBBtn
                                        onClick={handleShowNewEventForm}
                                        size="sm"
                                        className="add-event-btn"
                                    >
                                        Add Event
                                    </MDBBtn>
                                    <MDBBtn onClick={handleDeleteMode} size="sm" className="delete-event-btn">
                                        {isDeleting ? "Done" : "Delete Events"}
                                    </MDBBtn>
                                </>
                            )}
                        </div>
                        {isVertical ? (
                            <div className="vertical-timeline" style={{ overflowY: "scroll", height: "400px" }}>
                                {events.map((event) => (
                                    <div
                                        key={event.index}
                                        className={`timeline-event ${event.stage}`}
                                        style={{
                                            backgroundColor: stageColours[event.stage],
                                            marginBottom: isVertical ? "20px" : "0", // Add spacing for vertical layout
                                            cursor: isDeleting ? "pointer" : "default", // Change cursor to pointer when deleting
                                        }}
                                        onClick={() => isDeleting && handleCircleClick(event, "delete-target")} // Trigger delete logic if isDeleting is true
                                    >
                                        <div className="circle">
                                            <span className="event-title">{event.title}</span>
                                            {isDeleting && (
                                                <DeleteOutlineIcon
                                                    className="delete-icon"
                                                    onClick={() => handleCircleClick(event, "delete-target")}
                                                />
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : viewMode === "freytag" ? (
                            <Draggable axis="x">
                                <div
                                    className="freytag-pyramid"
                                    style={{
                                        position: "relative",
                                        height: "100vh",
                                    }}>
                                    {events.map((event) => {
                                        if (!stageIndices[event.stage]) {
                                            stageIndices[event.stage] = 0;
                                        }

                                        const stageIndex = stageIndices[event.stage];
                                        const position = getEventPosition(event.stage, stageIndex, stageCounts);
                                        stageIndices[event.stage]++; // Increment for the next one

                                        return (
                                            <div
                                                key={event.index}
                                                className={`pyramid-event ${event.stage}`}
                                                style={{
                                                    position: "absolute",
                                                    ...position,
                                                }}
                                            >
                                                <div
                                                    className={`circle ${event.isMainEvent ? "main-event" : ""}`}
                                                    style={{
                                                        backgroundColor: stageColours[event.stage],
                                                    }}
                                                >
                                                    {isDeleting && (
                                                        <DeleteOutlineIcon
                                                            className="delete-icon"
                                                            onClick={() => handleCircleClick(event, "delete-target")}
                                                        />
                                                    )}
                                                    <span className="event-title">
                                                        {event.title}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </Draggable>
                        ) : (
                            <Draggable axis="x">
                                <MDBTypography listInLine className="items">
                                    {events.map((event) => (
                                        <li className="items-list" key={event.index}>
                                            <div className="px-4">
                                                <div
                                                    className={`circle ${event.isMainEvent ? "main-event" : ""}`}
                                                    style={{
                                                        backgroundColor: "#dee2e6", // Grey for linear mode
                                                        marginBottom: isVertical ? "20px" : "0", // Add spacing for vertical layout
                                                        cursor: isDeleting ? "pointer" : "default", // Change cursor to pointer when deleting
                                                    }}
                                                    onClick={() => isDeleting && handleCircleClick(event, "delete-target")} // Trigger delete logic if isDeleting is true
                                                >
                                                    <span className="event-date">{event.date}</span>
                                                    <br />
                                                    <span className="event-title" style={{ fontWeight: "bold" }}>
                                                        {event.title}
                                                    </span>
                                                    {isDeleting && (
                                                        <DeleteOutlineIcon
                                                            className="delete-icon"
                                                            onClick={() => handleCircleClick(event, "delete-target")}
                                                        />
                                                    )}
                                                </div>
                                            </div>
                                        </li>
                                    ))}
                                </MDBTypography>
                            </Draggable>
                        )}
                    </div>
                </MDBCol>
            </MDBRow>
            <Dialog open={showDeleteModal} onClose={() => setShowDeleteModal(false)}>
                <DialogTitle>Delete Event</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Are you sure you want to delete this event?
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <MDBBtn color="secondary" onClick={() => setShowDeleteModal(false)}>
                        No
                    </MDBBtn>
                    <MDBBtn color="primary" onClick={handleDeleteEvent}>
                        Yes
                    </MDBBtn>
                </DialogActions>
            </Dialog>
        </MDBContainer>
    );
}

export default StoryTimeline;
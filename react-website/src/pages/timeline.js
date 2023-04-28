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

function StoryTimeline() {

    const { currentUser } = useAuthValue(); // Get the current user from Firebase authentication
    const userId = currentUser ? currentUser.uid : null;

    const timelineRef = ref(database, `stories/${userId}/timeline/`);

    const [events, setEvents] = useState([]);

    const [showDescription, setShowDescription] = useState(null);

    const [isDeleting, setIsDeleting] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [eventToDelete, setEventToDelete] = useState(null);

    const [newEvent, setNewEvent] = useState({
        date: "",
        title: "",
        description: "",
        isMainEvent: false
    });
    const [showNewEventForm, setShowNewEventForm] = useState(false);

    const sampleEvents =
        [
            {
                index: 0,
                date: "01/01/2001",
                title: "Click Me for Instructions!",
                isMainEvent: true,
                description: "1. Here, you can enter the events of your story.\n\n2. To add a new event click the ADD EVENT button, fill in the details and click SAVE. When you do that, the sample events and I will disappear and be replaced by your new events.\n\n3. Be careful when entering the details! If you make a mistake, you'll have to delete the event and add it again.\n\n4. This timeline is ordered by the date, so be careful to enter it properly!\n\n5. The date needs to be in the format DD/MM/YYYY.\n\n6. If the date is in the wrong format or any of the fields are empty, you won't be able to save the event.\n\n7. To delete events, click the DELETE EVENT button, then click the trash can icon in the events you want to delete. Click DONE when you've removed all the events you want to remove.\n\n8. If you have more events than you can see on the screen don't worry! Just drag the timeline left to view later events, and right to view older ones.\n\n 9. Go ahead and add your first event!"
            },
            {
                index: 1,
                date: "02/06/2022",
                title: "Main Event",
                isMainEvent: true,
                description:
                    "Tom, a student at X university, is found dead in his room."
            },
            {
                index: 2,
                date: "05/06/2022",
                title: "Minor Event",
                isMainEvent: false,
                description:
                    "Tom's parents employ private detective James to find justice for their son."
            },
            {
                index: 3,
                date: "07/06/2022",
                title: "Minor Event",
                isMainEvent: false,
                description:
                    "James visits the crime scene."
            },
            {
                index: 4,
                date: "08/06/2022",
                title: "Main Event",
                isMainEvent: true,
                description:
                    "Another student, Lea, is found dead in the kitchens."
            }
        ];

    useEffect(() => {
        // Fetch events from Firebase
        const unsubscribe = onValue(timelineRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const eventsArray = Object.keys(data).map((key, index) => ({
                    ...data[key],
                    id: key,
                    index: index,
                }));
                setEvents(eventsArray);
            } else {
                setEvents(sampleEvents);
            }
        });

        return () => {
            unsubscribe();
        };
    }, []);

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
                isMainEvent: false
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
        const filteredEvents = events.filter((e) => e.id !== eventToDelete.id);
        setEvents(filteredEvents);

        // Delete the event from Firebase
        const eventRef = ref(database, `stories/${userId}/timeline/${eventToDelete.id}`);
        remove(eventRef);

        setShowDeleteModal(false);
    };


    const handleCircleClick = (event, target) => {
        if (isDeleting && target === "delete-icon") {
            setEventToDelete(event);
            setShowDeleteModal(true);
        }
        setShowDescription(showDescription === event.index ? null : event.index);
    };
    return (
        <MDBContainer fluid className="py-5">
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
                                        <MDBBtn onClick={handleAddEvent} size="sm">
                                            Save
                                        </MDBBtn>
                                        <MDBBtn
                                            onClick={handleCancelAddEvent}
                                            size="sm"
                                            color="secondary"
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
                                        {isDeleting ? 'Done' : 'Delete Events'}
                                    </MDBBtn>
                                </>
                            )}
                        </div>
                        <Draggable axis="x">
                            <MDBTypography listInLine className="items">
                                {events
                                    .sort((a, b) =>
                                        moment(a.date, "DD/MM/YYYY").diff(moment(b.date, "DD/MM/YYYY"))
                                    )
                                    .map((event) => (
                                        <li className="items-list" key={event.index}>
                                            <div className="px-4">
                                                <div
                                                    className={`circle ${event.isMainEvent ? "main-event" : ""
                                                        } ${isDeleting ? "deleting" : ""}`}
                                                    onClick={(e) => handleCircleClick(event, e.target.getAttribute("data-target"))}
                                                >
                                                    {isDeleting && (
                                                        <DeleteOutlineIcon
                                                            className="delete-icon"
                                                            data-target="delete-icon"
                                                            fontSize="small"
                                                        />
                                                    )}
                                                    <span className="event-date">{event.date}</span>
                                                    <br />
                                                    <span className="event-title" style={{ fontWeight: "bold" }}>
                                                        {event.title}
                                                    </span>
                                                </div>
                                                {showDescription === event.index && (
                                                    <div className="description-container">
                                                        <textarea
                                                            cols="40"
                                                            rows="20"
                                                            className="description"
                                                            value={event.description}
                                                            readOnly
                                                        ></textarea>
                                                    </div>
                                                )}
                                            </div>
                                        </li>
                                    ))}
                            </MDBTypography>
                        </Draggable>
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
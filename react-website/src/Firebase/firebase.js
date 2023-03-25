// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import {getAuth} from 'firebase/auth';
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCxL7MYPjZW6yrAJU6vND2pYkV4U5BCghA",
  authDomain: "structuredcreativeplanning.firebaseapp.com",
  projectId: "structuredcreativeplanning",
  storageBucket: "structuredcreativeplanning.appspot.com",
  messagingSenderId: "626832906767",
  appId: "1:626832906767:web:caf2aa99f077227a26e17a",
  measurementId: "G-PPL8YEET14"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app)

export {auth}
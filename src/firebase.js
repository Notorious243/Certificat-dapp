import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyDxH_MhWNYFFl5KC6zdnNzEE3qr1zedmzU",
    authDomain: "gouvchain.firebaseapp.com",
    projectId: "gouvchain",
    storageBucket: "gouvchain.firebasestorage.app",
    messagingSenderId: "619598519056",
    appId: "1:619598519056:web:7350059afdb7137a2ea395",
    measurementId: "G-9TQYRRV4DC"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Cloud Firestore and get a reference to the service
const db = getFirestore(app);

export { db };

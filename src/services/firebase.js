// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics"
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";;
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBTYkEP-SeX89rUTQ0M2Sbxh0ZnXo-5SaI",
  authDomain: "clipayclub.firebaseapp.com",
  projectId: "clipayclub",
  storageBucket: "clipayclub.firebasestorage.app",
  messagingSenderId: "1035417405552",
  appId: "1:1035417405552:web:178d894ea2674b5aae8cb5",
  measurementId: "G-CMHRPR0X78"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Exporta o banco de dados e a autenticação para usar no resto do site
const db = getFirestore(app);
const auth = getAuth(app);

// Google Analytics
const analytics = getAnalytics(app);

export { db, auth };
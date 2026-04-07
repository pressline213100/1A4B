import { initializeApp, getApps, getApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyAgTxd7KtrmS1L58x4VRnMWHWZfm0UlbCE",
  authDomain: "a2b-schonbro.firebaseapp.com",
  databaseURL: "https://a2b-schonbro-default-rtdb.firebaseio.com",
  projectId: "a2b-schonbro",
  storageBucket: "a2b-schonbro.firebasestorage.app",
  messagingSenderId: "813643775031",
  appId: "1:813643775031:web:c595196f53390bec4913b2"
};

let db = null;

if (typeof window !== "undefined") {
  try {
    const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
    db = getDatabase(app);
  } catch (error) {
    console.error("Firebase connection error:", error);
  }
}

export { db };

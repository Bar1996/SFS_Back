const {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword,
  setPersistence,
  browserLocalPersistence,
  getAuth,
} = require("firebase/auth");
const {
  collection,
  addDoc,
  updateDoc,
  getDocs,
  doc,
  query,
  where,
  arrayUnion,
} = require("firebase/firestore");
const admin = require("firebase-admin");
const { db } = require("../../firebaseConfig.js");
const { checkEmailInUse } = require("../helpers/checkEmailInUse.js");
const jwt = require("jsonwebtoken");



let emailValid = false;
let passwordValid = false;


const SignUpWithEmailAndPassword = async (req, res) => {
    const { email, password } = req.body;
    const auth = getAuth();
    const name = req.body.name;

    if (passwordValid && emailValid) {
        try {
            const docRef = await createUserWithEmailAndPassword(
                auth,
                email,
                password
            );
            const userObj = docRef.user;

            try {
                await sendEmailVerification(userObj);
            } catch (error) {
                console.error("Error sending email verification:", error);
            }

            try {
                await addDoc(collection(db, "users"), {
                    email: email,
                    uid: userObj.uid,
                    name: name,
                });
                // Send success response along with message
                res.send({ success: true, message: "Verification email sent." });
            } catch (error) {
                console.error("Error saving user data:", error);
                res.status(500).send("Error saving user data");
            }
        } catch (e) {
            if (e.code === "auth/email-already-in-use") {
                res.status(400).send("Email already in use");
            } else {
                console.error("Error adding document: ", e);
                res.status(500).send("Registration failed");
            }
        }
    } else {
        res.status(400).send("Invalid signup details");
    }
};


const PostEmail = async (req, res) => {
  console.log("req.body: ", req.body);
  const { email } = req.body;
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailPattern.test(email)) {
    res.send("Please enter a valid email");
  } else {
    try {
      const isEmailInUse = await checkEmailInUse(email);

      if (isEmailInUse) {
        res.send("Email is already in use");
        console.log("Email is already in use");
      } else {
        res.send("Email is available");
        mail = email;
        emailValid = true;
      }
    } catch (error) {
      console.error("Error checking email:", error);
      res.status(500).send("An error occurred while checking the email");
    }
  }

  console.log(email);
};

const PostPassword = async (req, res) => {
  const { password } = req.body;
  passwordValid = false;
  if (password.length < 10) {
    res.send("Password must be at least 10 characters long");
  } else if (!password.match(/[a-zA-Z]/)) {
    res.send("Password must contain at least one letter");
  } else {
    pass = password;
    passwordValid = true;
    res.send("Password received");
  }
  console.log(password);
};


const LoginWithEmailAndPassword = async (req, res) => {
    const { email, password } = req.body;
    console.log("Email:", email, "password:", password);
    const auth = getAuth();
  
    try {
      await setPersistence(auth, browserLocalPersistence);
      const userRecord = await signInWithEmailAndPassword(auth, email, password);
      console.log("userRecord:", userRecord.user.uid);
  
      // Generate access and refresh tokens
      const { accessToken, refreshToken } = generateTokens(userRecord.user.uid);
  
      console.log("Access Token:", jwt.decode(accessToken).uid);
  
      const usersQuery = query(
        collection(db, "users"),
        where("uid", "==", userRecord.user.uid)
      );
      const querySnapshot = await getDocs(usersQuery);
  
      if (querySnapshot.empty) {
        console.log(
          "User not found in Firestore, considering adding a new document..."
        );

      } else {
        // Assuming there's only one user with the given uid
        const userDocRef = querySnapshot.docs[0].ref;
  
        // Update Firestore with the new refresh token
        await updateDoc(userDocRef, {
          tokens: arrayUnion(refreshToken),
        });
      }
  
      // Check for email verification
      if (!auth.currentUser.emailVerified) {
        console.log("Need to verify email");
        res.send("You need to verify your email");
      } else {
          console.log("Transfer to Home Page");
          res.send({
            success: true,
            accessToken: accessToken,
            refreshToken: refreshToken,
          });
       
      }
    } catch (error) {
      console.log("Incorrect details");
      console.log(error);
      res.send(`Incorrect details ${password} and url: ${email}`);
    }
  };
  
  const generateTokens = (userId) => {
    const accessToken = jwt.sign(
      {
        uid: userId,
      },
      process.env.TOKEN_SECRET,
      {
        expiresIn: process.env.TOKEN_EXPIRES_IN,
      }
    );
  
    const refreshToken = jwt.sign(
      {
        uid: userId,
        salt: Math.random(),
      },
      process.env.REFRESH_TOKEN_SECRET
    );
  
    return {
      accessToken: accessToken,
      refreshToken: refreshToken,
    };
  };


  const refresh = async (req, res) => {
    // Extract token from HTTP header
    console.log("Refresh token request received");
    const authHeader = req.headers["authorization"];
    const refreshTokenOrig = authHeader && authHeader.split(" ")[1];
  
    if (refreshTokenOrig == null) {
      return res.status(401).send("Missing token");
    }
  
    // Verify token
    jwt.verify(
      refreshTokenOrig,
      process.env.REFRESH_TOKEN_SECRET,
      async (err, userInfo) => {
        if (err) {
          return res.status(403).send("Invalid token");
        }
  
        try {
          // Query Firestore for the user document using the UID
          const usersQuery = query(
            collection(db, "users"),
            where("uid", "==", userInfo.uid)
          );
          const querySnapshot = await getDocs(usersQuery);
  
          if (querySnapshot.empty) {
            return res.status(403).send("User not found");
          }
  
          // Assuming there's only one user with the given UID
          const userDocRef = querySnapshot.docs[0].ref;
          const userDoc = querySnapshot.docs[0].data();
  
          if (!userDoc.tokens || !userDoc.tokens.includes(refreshTokenOrig)) {
            // If the specific refresh token isn't in the array, clear all tokens (optional)
            await updateDoc(userDocRef, { tokens: [] });
            return res.status(403).send("Invalid token");
          }
  
          // Generate new access token and refresh token
          const { accessToken, refreshToken } = generateTokens(userInfo.uid);
  
          // Update Firestore with the new refresh token, removing the old one
          const newTokens = userDoc.tokens
            .filter((token) => token !== refreshTokenOrig)
            .concat(refreshToken);
          await updateDoc(userDocRef, { tokens: newTokens });
  
          // Return new access token & refresh token
          return res.status(200).send({
            accessToken: accessToken,
            refreshToken: refreshToken,
          });
        } catch (error) {
          console.log(error);
          return res.status(400).send(error.message);
        }
      }
    );
  };


  const logout = async (req, res) => {
    console.log("logout");
    const authHeader = req.headers['authorization'];
    const accessToken = authHeader && authHeader.split(' ')[1];
  
    if (accessToken == null) {
      return res.status(401).send("missing token");
    }
  
    jwt.verify(accessToken, process.env.TOKEN_SECRET, async (err, userInfo) => {
      if (err) {
        return res.status(403).send("invalid token");
      }
  
      try {
        // Find the user in Firestore
        const userQuerySnapshot = await getDocs(query(collection(db, 'users'), where('uid', '==', userInfo.uid)));
        if (userQuerySnapshot.empty) {
          return res.status(404).send("not found");
        }
  
        const userDoc = userQuerySnapshot.docs[0];
        const userRef = doc(db, 'users', userDoc.id);
  
        // Clear tokens or relevant session fields
        await updateDoc(userRef, { tokens: [] });
  
        return res.status(200).send("logout successful");
      } catch (error) {
        console.error('Error during logout:', error);
        return res.status(500).send(error.message);
      }
    });
  };



module.exports = {
  SignUpWithEmailAndPassword,
  PostEmail,
  PostPassword,
  LoginWithEmailAndPassword,
  PostEmail,
  PostPassword,
  refresh,
  logout,
};

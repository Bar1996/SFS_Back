const request = require('supertest');
const appInit = require('../../App');
const { collection, getDocs, query, where, doc, deleteDoc } = require('firebase/firestore');
const { db } = require('../../firebaseConfig');
const admin = require('firebase-admin');
const { checkEmailInUse } = require('../helpers/checkEmailInUse');

// Initialize Firebase Admin


const testUser = {
  email: "test@example.com",
  password: "password1234",
  name: "Test User",
};

let app;
let accessToken = "";
let refreshToken = "";

beforeAll(async () => {
  jest.setTimeout(35000); // Set timeout to 30 seconds
  // Initialize the Express app
  app = await appInit();
  console.log('beforeAll');
  // Clean up any existing test data
  const userQuerySnapshot = await getDocs(query(collection(db, 'users'), where('email', '==', testUser.email)));
  if (!userQuerySnapshot.empty) {
    const userDoc = userQuerySnapshot.docs[0].ref;
    await deleteDoc(userDoc);
  }
});

afterAll(async () => {
  console.log('afterAll');
  // Clean up any test data
  const userQuerySnapshot = await getDocs(query(collection(db, 'users'), where('email', '==', testUser.email)));
  if (!userQuerySnapshot.empty) {
    const userDoc = userQuerySnapshot.docs[0].ref;
    await deleteDoc(userDoc);
  }
  // Delete the user from Firebase Auth
  const userRecord = await admin.auth().getUserByEmail(testUser.email).catch(() => null);
  if (userRecord) {
    await admin.auth().deleteUser(userRecord.uid);
  }
});

describe('Signup Controller Tests', () => {
  test('POST /post_email', async () => {
    const res = await request(app).post('/auth/post_email').send({
      email: testUser.email
    });
    expect(res.statusCode).toBe(200);
    expect(res.text).toBe('Email is available');
  }, 35000); // Set timeout to 30 seconds

  test('POST /post_password', async () => {
    const res = await request(app).post('/auth/post_password').send({
      password: testUser.password
    });
    expect(res.statusCode).toBe(200);
    expect(res.text).toBe('Password received');
  }, 35000); // Set timeout to 30 seconds

  test('POST /signup', async () => {
    const res = await request(app).post('/auth/signup').send({
      email: testUser.email,
      password: testUser.password,
      name: testUser.name
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  
    // Check that the user is in the database
    const newUserQuerySnapshot = await getDocs(query(collection(db, 'users'), where('email', '==', testUser.email)));
    expect(newUserQuerySnapshot.empty).toBe(false);
  
    // Get the user ID from Firebase Admin SDK and verify email manually
    const userRecord = await admin.auth().getUserByEmail(testUser.email);
    expect(userRecord).toBeDefined();
  
    // Manually verify the email for the test user
    await admin.auth().updateUser(userRecord.uid, {
      emailVerified: true,
    });
  
    // Re-fetch the user to ensure the emailVerified field is updated
    const updatedUserRecord = await admin.auth().getUser(userRecord.uid);
    expect(updatedUserRecord.emailVerified).toBe(true);
  }, 35000); // Set timeout to 30 seconds
  


  test('POST /login', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: testUser.email, password: testUser.password });
    expect(res.statusCode).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    accessToken = res.body.accessToken;
    refreshToken = res.body.refreshToken;
  }, 35000); // Set timeout to 30 seconds


  test('GET /refresh', async () => {
    const res = await request(app)
      .get('/auth/refresh')
      .set('Authorization', `Bearer ${refreshToken}`)
      .send();
    expect(res.statusCode).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    accessToken = res.body.accessToken;
    refreshToken = res.body.refreshToken;
  }, 35000); // Set timeout to 30 seconds

  test('GET /logout', async () => {
    const res = await request(app)
      .get('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send();
    expect(res.statusCode).toBe(200);
    expect(res.text).toBe('logout successful');
  }, 35000); // Set timeout to 30 seconds
});

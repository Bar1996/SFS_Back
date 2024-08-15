const request = require('supertest');
const appInit = require('../../App');
const { collection, getDocs, query, where, doc, deleteDoc } = require('firebase/firestore');
const { db } = require('../../firebaseConfig');
const admin = require('firebase-admin');
const fs = require('fs').promises;

const testUser = {
  email: `testuser@example.com`,
  password: "password1234",
  name: "Test User"
};

let app;
let accessToken = "";

beforeAll(async () => {
  jest.setTimeout(30000); // Set timeout to 30 seconds
  // Initialize the Express app
  app = await appInit();
  console.log('beforeAll');

  // Clean up any existing test data
  const userQuerySnapshot = await getDocs(query(collection(db, 'users'), where('email', '==', testUser.email)));
  if (!userQuerySnapshot.empty) {
    const userDoc = userQuerySnapshot.docs[0].ref;
    await deleteDoc(userDoc);
  }

  // Validate email
  const emailRes = await request(app).post('/auth/post_email').send({
    email: testUser.email
  });
  expect(emailRes.statusCode).toBe(200);
  expect(emailRes.text).toBe('Email is available');

  // Validate password
  const passwordRes = await request(app).post('/auth/post_password').send({
    password: testUser.password
  });
  expect(passwordRes.statusCode).toBe(200);
  expect(passwordRes.text).toBe('Password received');

  // Register the test user
  const signupRes = await request(app).post('/signup').send({
    email: testUser.email,
    password: testUser.password,
    name: testUser.name,
  });
  expect(signupRes.statusCode).toBe(200);
  expect(signupRes.body.success).toBe(true);
  expect(signupRes.body.userId).toBeDefined();
  console.log('signupRes:', signupRes.body);

  // Update testUser with the uid 
  testUser.uid = signupRes.body.userId;

  // Manually verify the user's email
  await admin.auth().updateUser(signupRes.body.userId, {
    emailVerified: true
  });

  // Check that the user is in the database
  const newUserQuerySnapshot = await getDocs(query(collection(db, 'users'), where('email', '==', testUser.email)));
  expect(newUserQuerySnapshot.empty).toBe(false);

  // Login the test user
  const loginRes = await request(app).post('auth/login').send({
    email: testUser.email,
    password: testUser.password
  });
  expect(loginRes.statusCode).toBe(200);
  expect(loginRes.body.accessToken).toBeDefined();
  expect(loginRes.body.refreshToken).toBeDefined();
  accessToken = loginRes.body.accessToken;

}, 30000); // Set timeout to 30 seconds

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

describe('File Upload Tests', () => {
  test('upload file', async () => {
    const filepath = `${__dirname}/avatar.jpg`;
    const fileExists = await fs.exists(filepath);
    if (fileExists) {
      const response = await request(app)
        .post('/file/file?file=123.jpeg')
        .set('Authorization', `Bearer ${accessToken}`)  // Include the token in the request
        .attach('file', filepath);
      expect(response.statusCode).toBe(200);
    } else {
      console.error('File not found:', filepath);
    }
  }, 30000); // Set timeout to 30 seconds
});


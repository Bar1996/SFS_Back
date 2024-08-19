jest.setTimeout(35000); // Set timeout to 30 seconds
const request = require("supertest");
const appInit = require("../../App"); // Ensure this path is correct
const {
  collection,
  getDocs,
  query,
  where,
  doc,
  deleteDoc,
} = require("firebase/firestore");
const admin = require("firebase-admin");
const { db } = require("../../firebaseConfig");

let app;
let accessToken = "";
let refreshToken = "";

const testUser = {
  email: "test@example.com",
  password: "password1234",
  name: "Test User",
};

beforeAll(async () => {
  // Initialize the Express app
  app = await appInit();

  // Register and verify a new user
  const userQuerySnapshot = await getDocs(
    query(collection(db, "users"), where("email", "==", testUser.email))
  );
  if (!userQuerySnapshot.empty) {
    const userDoc = userQuerySnapshot.docs[0].ref;
    await deleteDoc(userDoc);
  }

  // Validate email
  const emailRes = await request(app).post("/auth/post_email").send({
    email: testUser.email,
  });
  expect(emailRes.statusCode).toBe(200);
  expect(emailRes.text).toBe("Email is available");

  // Validate password
  const passwordRes = await request(app).post("/auth/post_password").send({
    password: testUser.password,
  });
  expect(passwordRes.statusCode).toBe(200);
  expect(passwordRes.text).toBe("Password received");

  // Register the test user
  const signupRes = await request(app).post("/auth/signup").send({
    email: testUser.email,
    password: testUser.password,
    name: testUser.name,
  });
  expect(signupRes.statusCode).toBe(200);
  expect(signupRes.body.success).toBe(true);
  console.log("signupRes:", signupRes.body);

  // update testUser with the uid
  testUser.uid = signupRes.body.userId;

  // Manually verify the user's email
  await admin.auth().updateUser(signupRes.body.userId, {
    emailVerified: true,
  });

  const newUserQuerySnapshot = await getDocs(
    query(collection(db, "users"), where("email", "==", testUser.email))
  );
  expect(newUserQuerySnapshot.empty).toBe(false);

  // Login the test user
  const loginRes = await request(app).post("/auth/login").send({
    email: testUser.email,
    password: testUser.password,
  });
  expect(loginRes.statusCode).toBe(200);
  expect(loginRes.body.accessToken).toBeDefined();
  expect(loginRes.body.refreshToken).toBeDefined();
  accessToken = loginRes.body.accessToken;
  refreshToken = loginRes.body.refreshToken;
});

afterAll(async () => {
  // Cleanup: delete the test user from auth and firestore
  const userQuerySnapshot = await getDocs(
    query(collection(db, "users"), where("email", "==", testUser.email))
  );
  if (!userQuerySnapshot.empty) {
    const userDoc = userQuerySnapshot.docs[0].ref;
    await deleteDoc(userDoc);
  }
  // Delete the user from Firebase Auth
  const userRecord = await admin
    .auth()
    .getUserByEmail(testUser.email)
    .catch(() => null);
  if (userRecord) {
    await admin.auth().deleteUser(userRecord.uid);
  }
});

describe("File Operations", () => {
  test("POST /upload - upload a file", async () => {
    const res = await request(app)
      .post("/files/upload")
      .set("Authorization", `Bearer ${accessToken}`)
      .attach("file", Buffer.from("Hello World"), "hello.txt");
    expect(res.statusCode).toBe(200);
    expect(res.body.url).toBeDefined(); // Check for the download URL in response
  }, 35000); // Set timeout to 30 seconds

  test("GET /download/:fileName - download a file", async () => {
    const res = await request(app)
      .get("/files/download/hello.txt")
      .set("Authorization", `Bearer ${accessToken}`)
      .responseType("blob"); // Ensuring the response is treated as binary
    expect(res.statusCode).toBe(200);
    expect(Buffer.from(res.body)).toEqual(Buffer.from("Hello World"));
  }, 35000); // Set timeout to 30 seconds

  test("GET /files - list all files", async () => {
    const res = await request(app)
      .get("/files/files")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(1); // Check if there is one file listed
  }, 35000); // Set timeout to 30 seconds

  test("PATCH /rename/:fileName - rename a file", async () => {
    const res = await request(app)
      .patch("/files/rename/hello.txt")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ newFileName: "new_hello.txt" });
    expect(res.statusCode).toBe(200);
    expect(res.body.newFileName).toBe("new_hello.txt");
  }, 35000);

  test("DELETE /:fileName - delete a file", async () => {
    const res = await request(app)
      .delete("/files/new_hello.txt")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  }, 35000); // Set timeout to 30 seconds
});

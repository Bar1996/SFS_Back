const express = require('express');
const multer = require('multer');
const { storage } = require('../../firebaseConfig');
const { ref, uploadBytesResumable, getDownloadURL, listAll, getMetadata, deleteObject  } = require('firebase/storage');
const middleware = require('../common/auth_middleware');
const crypto = require('crypto');
const iconv = require('iconv-lite');
const axios = require('axios'); // For downloading files as buffer

const router = express.Router();

// AES encryption parameters
const algorithm = 'aes-256-cbc';
const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex'); // Ensure 32 bytes key for aes-256
const ivLength = 16; // Initialization vector length for aes-256-cbc

// Initialize Multer for file upload
const upload = multer({
  storage: multer.memoryStorage(), // Store file in memory before uploading to Firebase
  limits: { fileSize: 10 * 1024 * 1024 }, // Limit file size to 10MB
});

// Encryption function
function encryptFile(buffer) {
  const iv = crypto.randomBytes(ivLength);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(buffer);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return { iv, encrypted };
}

// Decryption function
function decryptFile(encryptedBuffer, iv) {
  const decipher = crypto.createDecipheriv(algorithm, key, Buffer.from(iv, 'hex'));
  let decrypted = decipher.update(encryptedBuffer);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted;
}

// Upload file route with encryption
router.post('/upload', upload.single('file'), middleware, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send('No file uploaded.');
    }

    const userId = req.body.user.uid;
    const fileName = iconv.decode(Buffer.from(req.file.originalname, 'binary'), 'utf8');

    // Encrypt the file buffer
    const { encrypted, iv } = encryptFile(req.file.buffer);

    const metadata = {
      contentType: req.file.mimetype,
      customMetadata: {
        iv: iv.toString('hex'),
      },
    };

    const storageRef = ref(storage, `uploads/${userId}/${fileName}`);
    const uploadTask = uploadBytesResumable(storageRef, encrypted, metadata);

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        console.log(`Upload is ${progress}% done`);
      },
      (error) => {
        console.error('Upload error:', error);
        res.status(500).send('Error uploading file');
      },
      async () => {
        const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
        
        // Retrieve metadata of the uploaded file
        const fileMetadata = await getMetadata(uploadTask.snapshot.ref);

        // Return the URL and metadata (including file size and modified date)
        res.status(200).send({
          url: downloadURL,
          name: fileName,
          size: fileMetadata.size, // file size in bytes
          modified: fileMetadata.updated || fileMetadata.timeCreated // last modified or created date
        });
      }
    );
  } catch (error) {
    console.error('Upload route error:', error);
    res.status(500).send('Error uploading file');
  }
});


// Helper function to download file as buffer
async function downloadFileAsBuffer(url) {
  const response = await axios({
    method: 'GET',
    url,
    responseType: 'arraybuffer',
  });
  return Buffer.from(response.data);
}

// Retrieve and decrypt files route
router.get('/download/:fileName', middleware, async (req, res) => {
  try {
    const userId = req.body.user.uid;
    const fileName = req.params.fileName;
    const storageRef = ref(storage, `uploads/${userId}/${fileName}`);

    // Get file metadata (contains IV for decryption)
    const metadata = await getMetadata(storageRef);
    const iv = metadata.customMetadata.iv;

    if (!iv) {
      throw new Error('Missing IV in metadata.');
    }

    // Get the download URL for the encrypted file
    const downloadURL = await getDownloadURL(storageRef);

    // Download the encrypted file as buffer
    const encryptedBuffer = await downloadFileAsBuffer(downloadURL);

    // Decrypt the file using the stored IV
    const decryptedFile = decryptFile(encryptedBuffer, iv);

    // Properly encode the filename for the `Content-Disposition` header
    const encodedFileName = encodeURIComponent(fileName);
    const disposition = `attachment; filename*=UTF-8''${encodedFileName}`;

    // Set the appropriate headers to download the file
    res.setHeader('Content-Type', metadata.contentType);
    res.setHeader('Content-Disposition', disposition); // Properly encoded filename
    res.setHeader('Content-Length', decryptedFile.length);

    // Send the decrypted file to the client
    res.status(200).send(decryptedFile);
  } catch (error) {
    console.error('Error fetching file:', error.message);
    res.status(500).send('Error fetching file');
  }
});


// List all files for a user with file size and last modified date
router.get('/files', middleware, async (req, res) => {
  try {
    const userId = req.body.user.uid;
    const storageRef = ref(storage, `uploads/${userId}/`);
    const fileList = await listAll(storageRef);

    const userFiles = [];
    for (const itemRef of fileList.items) {
      const url = await getDownloadURL(itemRef);
      const metadata = await getMetadata(itemRef); // Get metadata for the file
      
      userFiles.push({
        name: itemRef.name,
        url,
        size: metadata.size, // File size in bytes
        modified: metadata.updated || metadata.timeCreated, // Last modified or creation time
      });
    }

    res.status(200).send(userFiles);
  } catch (error) {
    console.error('Error fetching files:', error.message);
    res.status(500).send('Error fetching files');
  }
});


router.delete('/:fileName', middleware, async (req, res) => {
  try {
    const userId = req.body.user.uid;
    const fileName = req.params.fileName;

    console.log('Delete Request Received');
    console.log(`User ID: ${userId}`);
    console.log(`File to delete: ${fileName}`);

    const storageRef = ref(storage, `uploads/${userId}/${fileName}`);
    console.log('Firebase storage reference created:', storageRef.fullPath);

    // Delete the file from Firebase Storage
    await deleteObject(storageRef);
    console.log('File deleted successfully from Firebase Storage');

    res.status(200).send({ success: true, message: 'File deleted successfully' });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).send({ success: false, message: 'Error deleting file', error: error.message });
  }
});




// Rename file route
router.patch('/rename/:fileName', middleware, async (req, res) => {
  try {
    const userId = req.body.user.uid;
    const oldFileName = req.params.fileName;
    let newFileName = req.body.newFileName;

    console.log('Rename Request Received');
    console.log(`User ID: ${userId}`);
    console.log(`Old file name: ${oldFileName}`);
    console.log(`New file name (before extension check): ${newFileName}`);

    // Extract the file extension from the old file name
    const fileExtension = oldFileName.split('.').pop();

    // Ensure the new file name has the correct extension
    if (!newFileName.includes('.')) {
      newFileName = `${newFileName}.${fileExtension}`;
    }

    console.log(`New file name (after extension check): ${newFileName}`);

    const oldFileRef = ref(storage, `uploads/${userId}/${oldFileName}`);
    const newFileRef = ref(storage, `uploads/${userId}/${newFileName}`);

    console.log('Old Firebase storage reference created:', oldFileRef.fullPath);
    console.log('New Firebase storage reference created:', newFileRef.fullPath);

    // Get the old file's data
    const downloadURL = await getDownloadURL(oldFileRef);
    const encryptedBuffer = await downloadFileAsBuffer(downloadURL);
    console.log('Old file data downloaded successfully');

    // Get the metadata for the old file (including IV)
    const oldMetadata = await getMetadata(oldFileRef);
    console.log('Old file metadata retrieved:', oldMetadata);

    // Prepare metadata for the new file, including custom metadata like IV
    const newMetadata = {
      contentType: oldMetadata.contentType,
      customMetadata: oldMetadata.customMetadata, // Include IV and any other custom metadata
    };

    // Copy the file to the new name with the original metadata
    await uploadBytesResumable(newFileRef, encryptedBuffer, newMetadata);
    console.log('File uploaded with new name and metadata:', newFileName);

    // Delete the old file
    await deleteObject(oldFileRef);
    console.log('Old file deleted successfully from Firebase Storage');

    // Return the new file name
    res.status(200).send({ success: true, newFileName });
  } catch (error) {
    console.error('Error renaming file:', error);
    res.status(500).send({ success: false, message: 'Error renaming file', error: error.message });
  }
});





module.exports = router;

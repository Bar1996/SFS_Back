const express = require('express');
const multer = require('multer');
const { storage } = require('../../firebaseConfig');
const { getStorage, ref, uploadBytesResumable, getDownloadURL, listAll  } = require('firebase/storage');
const middleware = require('../common/auth_middleware');
const iconv = require('iconv-lite');

const router = express.Router();

// Initialize Multer for file upload
const upload = multer({
    storage: multer.memoryStorage(), // Store file in memory before uploading to Firebase
    limits: { fileSize: 10 * 1024 * 1024 }, // Limit file size to 10MB
  });

// Upload file route
router.post('/upload', upload.single('file'), middleware, async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).send('No file uploaded.');
        }

        const userId = req.body.user.uid; // Retrieve user ID from middleware
        console.log('userId:', userId);

        // Decode the file name from '7bit' to 'utf-8'
        const fileName = iconv.decode(Buffer.from(req.file.originalname, 'binary'), 'utf8');

        console.log('fileName:', fileName);
        const storageRef = ref(storage, `uploads/${userId}/${fileName}`);

        const metadata = {
            contentType: req.file.mimetype,
        };

        // Upload file to Firebase Storage
        const uploadTask = uploadBytesResumable(storageRef, req.file.buffer, metadata);

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
                res.status(200).send({ url: downloadURL });
            }
        );
    } catch (error) {
        console.error('Upload route error:', error);
        res.status(500).send('Error uploading file');
    }
});


  


  router.get('/files',middleware, async (req, res) => {
    try {
      const userId = req.body.user.uid; // Assuming you have middleware that sets req.user to the authenticated user
      console.log('userId:', userId);
      const userFiles = [];
      const storageRef = ref(storage, `uploads/${userId}/`);
  
      // List all files in the user's directory
      const fileList = await listAll(storageRef);
  
      for (const itemRef of fileList.items) {
        const url = await getDownloadURL(itemRef);
        userFiles.push({ name: itemRef.name, url });
      }
  
      res.status(200).send(userFiles);
    } catch (error) {
      console.error(error);
      res.status(500).send('Error fetching files');
    }
  });
  

module.exports = router;

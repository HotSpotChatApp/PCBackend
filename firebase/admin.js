import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

// Validate required environment variables
const requiredVars = [
  'FIREBASE_PROJECT_ID',
  'FIREBASE_PRIVATE_KEY_ID',
  'FIREBASE_PRIVATE_KEY',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_CLIENT_ID'
];

const missingVars = requiredVars.filter(v => !process.env[v]);
if (missingVars.length > 0) {
  console.warn('⚠️ Missing Firebase environment variables:', missingVars.join(', '));
  console.warn('⚠️ Please configure .env file with Firebase Admin SDK credentials');
}

const serviceAccount = {
  type: 'service_account',
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: 'https://accounts.google.com/o/oauth2/auth',
  token_uri: 'https://oauth2.googleapis.com/token',
};

try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  console.log('✅ Firebase Admin SDK initialized');
} catch (error) {
  console.error('❌ Failed to initialize Firebase Admin SDK:', error.message);
  console.error('⚠️ Please check your Firebase credentials in .env file');
}

export const verifyToken = async (token) => {
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    console.log('✅ Token verified for user:', decodedToken.uid);
    return decodedToken;
  } catch (error) {
    console.error('❌ Token verification failed:', error.message);
    return null;
  }
};

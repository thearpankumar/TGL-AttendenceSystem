import fs from 'fs';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const url = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';
const destDir = path.join(__dirname, '..', 'public', 'models');
const destFile = path.join(destDir, 'blaze_face_short_range.tflite');

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

console.log('Downloading BlazeFace model...');

const file = fs.createWriteStream(destFile);

https.get(url, (response) => {
  if (response.statusCode !== 200) {
    console.error(`Failed to get model: ${response.statusCode}`);
    process.exit(1);
  }
  
  response.pipe(file);
  
  file.on('finish', () => {
    file.close();
    console.log('Model downloaded successfully.');
  });
}).on('error', (err) => {
  fs.unlink(destFile, () => {});
  console.error('Error downloading model:', err.message);
  process.exit(1);
});

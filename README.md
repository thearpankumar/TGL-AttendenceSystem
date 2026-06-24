# Geotag-Based Attendance System

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green?logo=node.js&logoColor=white)](https://nodejs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-7.0-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://reactjs.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[![Tests Backend](https://img.shields.io/badge/Tests-141%20passing-brightgreen)](backend/tests/)
[![Tests Frontend](https://img.shields.io/badge/Tests-8%20passing-brightgreen)](frontend/admin/src/Login.test.jsx)
[![Coverage](https://img.shields.io/badge/Coverage-Comprehensive-blue)](backend/tests/)

A lightweight, production-ready attendance system that uses GPS geolocation and camera verification to mark student attendance. Supports 1000+ concurrent submissions with flexible storage options.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Storage Options](#storage-options)
- [Quick Start](#quick-start)
- [Usage](#usage)
- [API Endpoints](#api-endpoints)
- [Development](#development)
- [Architecture](#architecture)
- [Environment Variables](#environment-variables-reference)
- [Security](#security-features)
- [Scaling](#scaling)
- [Hardware Requirements](#hardware-requirements)
- [License](#license)

---

## Features

| Feature | Description |
|---------|-------------|
| **Geotag Verification** | Students must be within specified radius of location |
| **Camera Capture** | Photo verification for each attendance submission |
| **Rotating Tokens** | Admin can rotate session links to prevent sharing |
| **Duplicate Prevention** | Same roll number cannot submit twice per session |
| **Real-time Stats** | Live attendance count with polling-based updates |
| **NoSQL Performance** | MongoDB handles 1000+ concurrent submissions |
| **Flexible Storage** | Choose between Cloudinary or AWS S3 |
| **Direct Upload** | S3 presigned URLs for direct browser uploads |
| **Docker Ready** | One-command deployment with docker-compose |
| **Ngrok Support** | Built-in ngrok integration for public URLs |

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| **Backend** | Node.js + Express.js |
| **Database** | MongoDB 7.0 |
| **Image Storage** | Cloudinary OR AWS S3 (configurable) |
| **Admin Panel** | React 18 + Vite |
| **Student Page** | Vanilla JS (lightweight, mobile-optimized) |
| **Authentication** | JWT with bcrypt password hashing |
| **Deployment** | Docker Compose |

---

## Storage Options

The system supports two storage backends, configurable via `STORAGE_PROVIDER` environment variable.

### Option 1: Cloudinary (Default)

| Pros | Cons |
|------|------|
| Automatic image optimization | Images pass through backend server |
| Built-in transformations | Slightly higher latency for large files |
| Easy setup | Limited free tier bandwidth |
| Free tier: 25GB storage + bandwidth | |

### Option 2: AWS S3

| Pros | Cons |
|------|------|
| Direct browser-to-S3 upload (presigned URLs) | Requires AWS account setup |
| Lower backend load | Need to configure CORS on bucket |
| Better for high-volume uploads | |
| Pay only for what you use | |

---

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Cloudinary account (free tier available) OR AWS account with S3 access

### 1. Clone and Configure

```bash
git clone <repository-url>
cd Attendence-GEOTAG-System
cp .env.example .env
```

Edit `.env` with your credentials:

**For Cloudinary:**
```bash
STORAGE_PROVIDER=cloudinary
JWT_SECRET=your-secret-key
ADMIN_SECRET=your-admin-secret
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

**For AWS S3:**
```bash
STORAGE_PROVIDER=s3
JWT_SECRET=your-secret-key
ADMIN_SECRET=your-admin-secret
AWS_S3_BUCKET=your-bucket-name
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
```

### 2. S3 CORS Configuration (Required for S3 only)

```json
[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

Apply via AWS CLI:
```bash
aws s3api put-bucket-cors \
  --bucket your-bucket-name \
  --cors-configuration file://cors.json
```

### 3. Run with Docker Compose

```bash
docker-compose up -d
```

This starts:
- MongoDB on port 27017
- Backend API on port 5000
- Admin panel on port 3000
- Student page on port 8080

**With Ngrok (for public URL):**
```bash
docker-compose --profile ngrok up -d
```

### 4. Create Admin Account

```bash
curl -X POST http://localhost:5000/api/admin/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "email": "admin@example.com",
    "password": "admin123",
    "adminSecret": "your-admin-secret"
  }'
```

### 5. Access the Application

| Interface | URL |
|-----------|-----|
| Admin Panel | http://localhost:3000 |
| Student Page | http://localhost:8080 |
| API Health | http://localhost:5000/health |

---

## Usage

### Admin Workflow

1. **Create Location**
   - Name: e.g., "Main Lecture Hall"
   - GPS coordinates (use Google Maps)
   - Radius: Geofence size in meters (default: 100m)

2. **Create Session**
   - Select location
   - Set duration (default: 30 minutes)
   - System generates unique link

3. **Share Link**
   - Copy link from session creation modal
   - Share via email/LMS/messaging

4. **Monitor Attendance**
   - View live stats
   - See verified/unverified students
   - Export to CSV

5. **Rotate Token (Optional)**
   - If link gets shared, rotate token
   - Old link stops working immediately
   - New link generated

### Student Workflow

1. Open attendance link on mobile device
2. Grant camera and GPS permissions
3. Fill name and roll number
4. Capture photo
5. Submit attendance

---

## API Endpoints

### Admin Endpoints (JWT Protected)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/admin/register` | Create admin (requires adminSecret) |
| POST | `/api/admin/login` | Login and get JWT token |
| GET | `/api/admin/profile` | Get current admin profile |
| GET | `/api/admin/dashboard` | Get dashboard statistics |
| POST | `/api/admin/locations` | Create location |
| GET | `/api/admin/locations` | List all locations |
| PUT | `/api/admin/locations/:id` | Update location |
| DELETE | `/api/admin/locations/:id` | Delete location |
| POST | `/api/admin/sessions` | Create session |
| GET | `/api/admin/sessions` | List all sessions |
| GET | `/api/admin/sessions/:id` | Get session details |
| POST | `/api/admin/sessions/:id/rotate` | Rotate session token |
| POST | `/api/admin/sessions/:id/deactivate` | Deactivate session |
| GET | `/api/admin/sessions/:id/attendance` | Get attendance records |
| GET | `/api/admin/sessions/:id/stats` | Get session statistics |

### Student Endpoints (Token-based)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/storage-info` | Get storage provider info |
| GET | `/api/attend/:token` | Validate attendance token |
| GET | `/api/attend/:token/status` | Check if already submitted |
| GET | `/api/attend/:token/upload-url` | Get presigned upload URL (S3 only) |
| POST | `/api/attend/:token` | Submit attendance |

---

## Development

### Backend

```bash
cd backend
npm install
npm run dev     # Development with hot reload
npm test        # Run tests (141 tests)
npm run lint    # Run ESLint
```

### Admin Frontend

```bash
cd frontend/admin
npm install
npm run dev     # Development server (port 5173)
npm run build   # Production build
npm test        # Run tests (8 tests)
```

### Student Page

```bash
cd frontend/student/public
npx serve -p 8080
```

---

## Architecture

### Cloudinary Flow

```
Student Browser --> Backend Server --> Cloudinary CDN
                      (image upload)
```

### S3 Direct Upload Flow

```
Student Browser --> Backend (get presigned URL)
       |
       v
Student Browser --> S3 (direct upload)
       |
       v
Student Browser --> Backend (confirm upload + submit attendance)
```

### Database Schema

```
Admins
  |-- username (unique)
  |-- email (unique)
  |-- password (bcrypt hashed)

Locations
  |-- name
  |-- latitude, longitude
  |-- radiusMeters
  |-- createdBy (ref: Admin)

Sessions
  |-- locationId (ref: Location)
  |-- tokenHash (SHA-256, unique)
  |-- tokenPrefix (first 4 chars)
  |-- expiresAt (TTL index)
  |-- isActive

Attendance
  |-- sessionId (ref: Session)
  |-- rollNumber (unique per session)
  |-- studentName
  |-- photoUrl, photoPublicId
  |-- studentLatitude, studentLongitude
  |-- distanceFromLocation
  |-- verified (boolean)
  |-- capturedAt
```

---

## Environment Variables Reference

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `STORAGE_PROVIDER` | Storage backend: 'cloudinary' or 's3' | No | cloudinary |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name | If cloudinary | - |
| `CLOUDINARY_API_KEY` | Cloudinary API key | If cloudinary | - |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret | If cloudinary | - |
| `AWS_S3_BUCKET` | S3 bucket name | If s3 | - |
| `AWS_REGION` | AWS region | No | us-east-1 |
| `AWS_ACCESS_KEY_ID` | AWS access key | If s3 | - |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key | If s3 | - |
| `JWT_SECRET` | JWT signing secret | Yes | - |
| `JWT_EXPIRE` | JWT expiration time | No | 7d |
| `ADMIN_SECRET` | Secret for admin creation | Yes | - |
| `MONGODB_URI` | MongoDB connection string | No | mongodb://localhost:27017/attendance-geotag |
| `MONGODB_POOL_MAX` | MongoDB max connection pool | No | 300 |
| `MONGODB_POOL_MIN` | MongoDB min connection pool | No | 20 |
| `NGROK_AUTHTOKEN` | Ngrok auth token | Optional | - |
| `NGROK_DOMAIN` | Ngrok domain | Optional | - |

---

## Security Features

| Feature | Implementation |
|---------|---------------|
| **Token Hashing** | Session tokens stored as SHA-256 hashes |
| **JWT Authentication** | Admin routes protected with JWT |
| **Password Hashing** | bcrypt with 10 salt rounds |
| **Rate Limiting** | Admin: 100/15min, Student: 20/min, Login: 5/15min |
| **Input Validation** | express-validator on all inputs |
| **CORS** | Configurable origins |
| **Security Headers** | Helmet middleware |
| **S3 Presigned URLs** | Time-limited (5 min) upload URLs |
| **MongoDB Injection** | Mongoose sanitization |

---

## Scaling

### For 1000+ Concurrent Users

| Optimization | Implementation |
|--------------|----------------|
| MongoDB Connection Pooling | 300 max connections |
| Database Indexing | Unique index on `{sessionId, rollNumber}` |
| S3 Direct Upload | Reduces backend load significantly |
| Cloudinary CDN | Images served from global CDN |
| Rate Limiting | Prevents abuse |

### Performance Metrics

| Metric | Value |
|--------|-------|
| Max RPS (backend) | ~150-250 |
| Photo upload latency (S3) | 200-400ms |
| Photo upload latency (Cloudinary) | 500-1500ms |
| MongoDB query time | <10ms (indexed) |
| Token validation | <5ms |

---

## Hardware Requirements

For detailed hardware specifications and cost estimates, see [HardwareRequirements.md](HardwareRequirements.md).

### Minimum (1,000 students)

| Component | Specification |
|-----------|---------------|
| CPU | 2 vCPUs (t3.medium) |
| RAM | 4GB |
| Storage | 20GB SSD |
| MongoDB | Atlas M10 or 2GB self-hosted |
| Estimated Cost | ~$87/month |

### Recommended Production (5,000 students)

| Component | Specification |
|-----------|---------------|
| CPU | 4 vCPUs (c5.large) |
| RAM | 8GB |
| Storage | 50GB SSD |
| MongoDB | Atlas M20 |
| Estimated Cost | ~$150/month |

---

## Project Structure

```
Attendence-GEOTAG-System/
|-- backend/
|   |-- src/
|   |   |-- config/           # Configuration files
|   |   |-- controllers/      # Route controllers
|   |   |-- middleware/       # Auth, validation, rate limiting
|   |   |-- models/           # Mongoose models
|   |   |-- routes/           # Express routes
|   |   |-- storage/          # Storage providers (Cloudinary, S3)
|   |   |-- utils/            # Utility functions
|   |   `-- app.js            # Express app
|   |-- tests/                # Test files (141 tests)
|   `-- package.json
|
|-- frontend/
|   |-- admin/                # React admin panel
|   |   |-- src/
|   |   |   |-- components/   # React components
|   |   |   |-- context/      # Auth context
|   |   |   |-- pages/        # Page components
|   |   |   `-- tests/        # Test files (8 tests)
|   |   `-- package.json
|   |
|   `-- student/              # Static student page
|       `-- public/
|           |-- index.html
|           `-- app.js        # Vanilla JS
|
|-- docker-compose.yml
|-- .env.example
|-- HardwareRequirements.md
`-- README.md
```

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit changes: `git commit -am 'Add my feature'`
4. Push to branch: `git push origin feature/my-feature`
5. Submit a pull request

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

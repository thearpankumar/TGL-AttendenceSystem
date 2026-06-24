const API_BASE = window.location.origin;
const token = window.location.pathname.split('/').pop();

let sessionData = null;
let userLocation = null;
let photoData = null;
let mediaStream = null;
let storageInfo = null;

const loadingView = document.getElementById('loadingView');
const errorView = document.getElementById('errorView');
const formView = document.getElementById('formView');
const successView = document.getElementById('successView');
const errorMessage = document.getElementById('errorMessage');

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const photoPreview = document.getElementById('photoPreview');
const captureBtn = document.getElementById('captureBtn');
const nameInput = document.getElementById('name');
const rollNumberInput = document.getElementById('rollNumber');
const submitBtn = document.getElementById('submitBtn');
const gpsStatus = document.getElementById('gpsStatus');
const locationName = document.getElementById('locationName');
const expiresAt = document.getElementById('expiresAt');

function showView(view) {
    loadingView.classList.add('hidden');
    errorView.classList.add('hidden');
    formView.classList.add('hidden');
    successView.classList.add('hidden');
    view.classList.remove('hidden');
}

function showError(message) {
    errorMessage.textContent = message;
    showView(errorView);
}

function cleanupCamera() {
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }
}

window.addEventListener('beforeunload', cleanupCamera);

async function init() {
    if (!token || token.length !== 32 || !/^[a-f0-9]{32}$/.test(token)) {
        showError('Invalid attendance link format');
        return;
    }

    try {
        const storageRes = await fetch(`${API_BASE}/api/storage-info`);
        storageInfo = await storageRes.json();

        const res = await fetch(`${API_BASE}/api/attend/${token}`);
        const data = await res.json();

        if (!res.ok || !data.valid) {
            showError(data.message || 'Invalid or expired attendance link');
            return;
        }

        sessionData = data.session;
        locationName.textContent = sessionData.locationName;
        expiresAt.textContent = new Date(sessionData.expiresAt).toLocaleString();

        const expiryTime = new Date(sessionData.expiresAt);
        if (expiryTime < new Date()) {
            showError('This attendance session has expired');
            return;
        }

        showView(formView);
        await initCamera();
        await initGeolocation();
    } catch (error) {
        showError('Failed to load attendance page. Please check your internet connection.');
    }
}

async function initCamera() {
    try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: 640, height: 480 }
        });
        video.srcObject = mediaStream;
    } catch (error) {
        if (error.name === 'NotAllowedError') {
            showError('Camera access denied. Please enable camera permissions in your browser settings.');
        } else if (error.name === 'NotFoundError') {
            showError('No camera found on this device.');
        } else {
            showError('Camera access required for attendance. Please enable camera permissions.');
        }
    }
}

async function initGeolocation() {
    gpsStatus.className = 'gps-status gps-error';
    gpsStatus.innerHTML = '<span>⏳</span> Getting your location...';

    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            gpsStatus.innerHTML = '<span>⚠️</span> Geolocation not supported by this browser';
            resolve();
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                userLocation = {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy: position.coords.accuracy
                };
                gpsStatus.className = 'gps-status gps-ok';
                gpsStatus.innerHTML = `<span>✓</span> Location acquired (±${Math.round(position.coords.accuracy)}m)`;
                checkFormValidity();
                resolve();
            },
            (error) => {
                let msg = 'Location error';
                switch (error.code) {
                    case error.PERMISSION_DENIED:
                        msg = 'Location permission denied. Please enable GPS.';
                        break;
                    case error.POSITION_UNAVAILABLE:
                        msg = 'Location unavailable. Try moving to an open area.';
                        break;
                    case error.TIMEOUT:
                        msg = 'Location timeout. Please try again.';
                        break;
                    default:
                        msg = 'Unknown location error.';
                }
                gpsStatus.innerHTML = `<span>⚠️</span> ${msg}`;
                resolve();
            },
            {
                enableHighAccuracy: true,
                timeout: 15000,
                maximumAge: 0
            }
        );
    });
}

captureBtn.addEventListener('click', () => {
    if (!video.videoWidth || !video.videoHeight) {
        alert('Camera not ready. Please wait and try again.');
        return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    
    try {
        photoData = canvas.toDataURL('image/jpeg', 0.7);
        if (photoData.length > 5000000) {
            photoData = canvas.toDataURL('image/jpeg', 0.5);
        }
    } catch (e) {
        alert('Failed to capture photo. Please try again.');
        return;
    }

    photoPreview.src = photoData;
    photoPreview.style.display = 'block';
    video.style.display = 'none';
    captureBtn.textContent = '🔄';
    
    checkFormValidity();
});

photoPreview.addEventListener('click', () => {
    photoPreview.style.display = 'none';
    video.style.display = 'block';
    captureBtn.textContent = '📷';
    photoData = null;
    checkFormValidity();
});

nameInput.addEventListener('input', checkFormValidity);
rollNumberInput.addEventListener('input', checkFormValidity);

function checkFormValidity() {
    const nameValid = nameInput.value.trim().length >= 2;
    const rollValid = rollNumberInput.value.trim().length >= 1 && /^[a-zA-Z0-9]+$/.test(rollNumberInput.value.trim());
    const photoValid = photoData !== null;
    const locationValid = userLocation !== null;

    submitBtn.disabled = !(nameValid && rollValid && photoValid && locationValid);
}

async function uploadDirectToS3(blob) {
    try {
        const uploadUrlRes = await fetch(`${API_BASE}/api/attend/${token}/upload-url`);
        const uploadUrlData = await uploadUrlRes.json();
        
        if (!uploadUrlRes.ok) {
            throw new Error(uploadUrlData.message || 'Failed to get upload URL');
        }

        const uploadRes = await fetch(uploadUrlData.uploadUrl, {
            method: uploadUrlData.method,
            headers: uploadUrlData.headers || {},
            body: blob
        });

        if (!uploadRes.ok) {
            throw new Error('Direct upload failed');
        }

        return uploadUrlData.publicId;
    } catch (error) {
        throw error;
    }
}

async function dataURLtoBlob(dataURL) {
    const response = await fetch(dataURL);
    return await response.blob();
}

submitBtn.addEventListener('click', async () => {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    try {
        let requestBody;
        
        if (storageInfo?.provider === 's3' && storageInfo?.supportsDirectUpload) {
            submitBtn.textContent = 'Uploading photo...';
            const blob = await dataURLtoBlob(photoData);
            const publicId = await uploadDirectToS3(blob);
            
            submitBtn.textContent = 'Submitting attendance...';
            requestBody = {
                studentName: nameInput.value.trim(),
                rollNumber: rollNumberInput.value.trim().toUpperCase(),
                directUpload: true,
                publicId,
                latitude: userLocation.latitude,
                longitude: userLocation.longitude
            };
        } else {
            requestBody = {
                studentName: nameInput.value.trim(),
                rollNumber: rollNumberInput.value.trim().toUpperCase(),
                photo: photoData,
                latitude: userLocation.latitude,
                longitude: userLocation.longitude
            };
        }

        const res = await fetch(`${API_BASE}/api/attend/${token}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.message || 'Failed to submit attendance');
        }

        cleanupCamera();

        document.getElementById('distanceInfo').textContent = 
            `Distance from location: ${data.attendance.distanceFromLocation}m | ${data.attendance.verified ? '✓ Verified' : '⚠ Outside geofence'}`;
        
        showView(successView);
    } catch (error) {
        alert(error.message);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Attendance';
    }
});

init();

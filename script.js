import {
    FilesetResolver,
    HandLandmarker
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.mjs";

const cameraButton = document.querySelector("#camera-button");
const cameraStatus = document.querySelector("#camera-status");
const cameraVideo = document.querySelector("#camera-video");
const cameraPlaceholder = document.querySelector("#camera-placeholder");
const captureSampleButton =
    document.querySelector("#capture-sample-button");

const landmarkCanvas = document.querySelector("#landmark-canvas");
const canvasContext = landmarkCanvas.getContext("2d");

const predictionLabel =
    document.querySelector("#prediction-label");

const predictionConfidence =
    document.querySelector("#prediction-confidence");

const predictionAction =
    document.querySelector("#prediction-action");

const HAND_CONNECTIONS = [
    // Thumb
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],

    // Index finger
    [0, 5],
    [5, 6],
    [6, 7],
    [7, 8],

    // Middle finger
    [5, 9],
    [9, 10],
    [10, 11],
    [11, 12],

    // Ring finger
    [9, 13],
    [13, 14],
    [14, 15],
    [15, 16],

    // Little finger
    [13, 17],
    [17, 18],
    [18, 19],
    [19, 20],

    // Palm edge
    [0, 17]
];

let cameraStream = null;
let handLandmarker = null;
let animationFrameId = null;
let lastVideoTime = -1;
let latestLandmarks = null;

console.log("KRIYA JavaScript is connected.");

async function initializeHandLandmarker() {
    cameraButton.disabled = true;
    cameraStatus.textContent = "Loading AI hand model...";

    try {
        const visionFiles = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm"
        );

        handLandmarker = await HandLandmarker.createFromOptions(
            visionFiles,
            {
                baseOptions: {
                    modelAssetPath:
                        "https://storage.googleapis.com/mediapipe-models/" +
                        "hand_landmarker/hand_landmarker/float16/1/" +
                        "hand_landmarker.task"
                },

                runningMode: "VIDEO",
                numHands: 1
            }
        );

        cameraButton.disabled = false;
        cameraStatus.textContent =
            "AI model ready. You can start the camera.";

        console.log("KRIYA hand-landmark model is ready.");
    } catch (error) {
        console.error("Model loading error:", error);

        cameraStatus.textContent =
            `AI model could not load: ${error.name}`;
    }
}

initializeHandLandmarker();

cameraButton.addEventListener("click", async () => {
    if (cameraStream !== null) {
        stopCamera();
        return;
    }

    await startCamera();
});

async function startCamera() {
    cameraStatus.textContent = "Requesting camera permission...";

    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false
        });

        cameraVideo.srcObject = cameraStream;

        await cameraVideo.play();

        lastVideoTime = -1;
        predictWebcam();

        cameraPlaceholder.hidden = true;

        cameraButton.textContent = "Stop camera";

        cameraStatus.textContent =
            "Camera is active. Video stays inside this browser.";
    } catch (error) {
        console.error("Camera error:", error);

        cameraStream = null;

        cameraStatus.textContent =
            `Camera could not start: ${error.name}`;
    }
}

function stopCamera() {
    cameraStream.getTracks().forEach((track) => {
        track.stop();
    });

    if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }

    lastVideoTime = -1;

    cameraVideo.srcObject = null;
    cameraStream = null;

    latestLandmarks = null;
    updateCaptureButtonState();

    cameraPlaceholder.hidden = false;
    cameraButton.textContent = "Start camera";

    cameraStatus.textContent = "Camera has been stopped.";

    clearLandmarkCanvas();

}

function predictWebcam() {
    if (cameraStream === null || handLandmarker === null) {
        return;
    }

    if (cameraVideo.currentTime !== lastVideoTime) {
        const currentTime = performance.now();

        const results = handLandmarker.detectForVideo(
            cameraVideo,
            currentTime
        );

        if (results.landmarks.length > 0) {
            const landmarkCount = results.landmarks[0].length;

            latestLandmarks = results.landmarks[0];

            const liveSample =
                normalizeLandmarks(latestLandmarks);

            const prediction =
                classifyGesture(liveSample, 3);

            updatePredictionDisplay(prediction);

            updateCaptureButtonState();

            drawHandLandmarks(results.landmarks[0]);

            cameraStatus.textContent =
                `Hand detected with ${landmarkCount} landmarks.`;
        } else {
            latestLandmarks = null;

            updatePredictionDisplay(
                null,
                "No hand detected"
            );

            updateCaptureButtonState();

            clearLandmarkCanvas();

            cameraStatus.textContent = "Camera active. No hand detected.";
        }

        lastVideoTime = cameraVideo.currentTime;
    }

    animationFrameId = requestAnimationFrame(predictWebcam);
}

function drawHandLandmarks(landmarks) {
    const videoWidth = cameraVideo.videoWidth;
    const videoHeight = cameraVideo.videoHeight;

    landmarkCanvas.width = videoWidth;
    landmarkCanvas.height = videoHeight;

    clearLandmarkCanvas();

    canvasContext.strokeStyle = "rgba(100, 230, 212, 0.65)";
    canvasContext.lineWidth = 3;

    HAND_CONNECTIONS.forEach(([startIndex, endIndex]) => {
        const startPoint = landmarks[startIndex];
        const endPoint = landmarks[endIndex];

        canvasContext.beginPath();

        canvasContext.moveTo(
            startPoint.x * videoWidth,
            startPoint.y * videoHeight
        );

        canvasContext.lineTo(
            endPoint.x * videoWidth,
            endPoint.y * videoHeight
        );

        canvasContext.stroke();
    });

    canvasContext.fillStyle = "#64e6d4";

    landmarks.forEach((landmark, index) => {
        const x = landmark.x * videoWidth;
        const y = landmark.y * videoHeight;

        canvasContext.beginPath();

        canvasContext.arc(
            x,
            y,
            index === 0 ? 7 : 4,
            0,
            Math.PI * 2
        );

        canvasContext.fill();
    });
}

function clearLandmarkCanvas() {
    canvasContext.clearRect(
        0,
        0,
        landmarkCanvas.width,
        landmarkCanvas.height
    );
}

const gestureForm = document.querySelector("#gesture-form");
const gestureNameInput = document.querySelector("#gesture-name");
const gestureActionSelect = document.querySelector("#gesture-action");
const formStatus = document.querySelector("#form-status");

const gestureList = document.querySelector("#gesture-list");
const gestureClasses = [];

let selectedGestureId = null;

gestureForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const gestureName = gestureNameInput.value.trim();
    const selectedAction = gestureActionSelect.value;

    if (gestureName === "") {
        formStatus.textContent = "Please enter a gesture name.";
        return;
    }

    const newGesture = {
        id: crypto.randomUUID(),
        name: gestureName,
        action: selectedAction,
        samples: []
    };

    gestureClasses.push(newGesture);
    selectedGestureId = newGesture.id;

    renderGestureClasses();

    formStatus.textContent =
        `${gestureName} was added as a gesture class.`;

    gestureForm.reset();
});

function renderGestureClasses() {
    gestureList.innerHTML = "";

    gestureClasses.forEach((gesture) => {
        const listItem = document.createElement("li");
        const selectButton = document.createElement("button");

        selectButton.type = "button";
        selectButton.className = "gesture-class-button";

        if (gesture.id === selectedGestureId) {
            selectButton.classList.add("selected");
        }

        selectButton.textContent =
            `${gesture.name} → ${gesture.action} ` +
            `(${gesture.samples.length} samples)`;

        selectButton.addEventListener("click", () => {
            selectedGestureId = gesture.id;

            formStatus.textContent =
                `${gesture.name} is selected for training.`;

            renderGestureClasses();
        });

        listItem.appendChild(selectButton);
        gestureList.appendChild(listItem);
    });

    updateCaptureButtonState();
}

function updateCaptureButtonState() {
    const canCapture =
        cameraStream !== null &&
        latestLandmarks !== null &&
        selectedGestureId !== null;

    captureSampleButton.disabled = !canCapture;
}

function normalizeLandmarks(landmarks) {
    const wrist = landmarks[0];

    const translatedLandmarks = landmarks.map((landmark) => {
        return {
            x: landmark.x - wrist.x,
            y: landmark.y - wrist.y,
            z: landmark.z - wrist.z
        };
    });

    const distancesFromWrist = translatedLandmarks.map((landmark) => {
        return Math.sqrt(
            landmark.x ** 2 +
            landmark.y ** 2 +
            landmark.z ** 2
        );
    });

    const handScale = Math.max(
        ...distancesFromWrist,
        0.0001
    );

    return translatedLandmarks.flatMap((landmark) => {
        return [
            landmark.x / handScale,
            landmark.y / handScale,
            landmark.z / handScale
        ];
    });
}

function calculateDistance(sampleA, sampleB) {
    let squaredDifferenceTotal = 0;

    for (let index = 0; index < sampleA.length; index++) {
        const difference = sampleA[index] - sampleB[index];
        squaredDifferenceTotal += difference ** 2;
    }

    return Math.sqrt(squaredDifferenceTotal);
}

function findNearestSamples(sample) {
    const comparisons = [];

    gestureClasses.forEach((gestureClass) => {
        gestureClass.samples.forEach((trainingSample) => {
            const distance =
                calculateDistance(sample, trainingSample);

            comparisons.push({
                gestureClass: gestureClass,
                distance: distance
            });
        });
    });

    comparisons.sort((comparisonA, comparisonB) => {
        return comparisonA.distance - comparisonB.distance;
    });

    return comparisons;
}

function classifyGesture(sample, k = 3) {
    const comparisons = findNearestSamples(sample);

    if (comparisons.length === 0) {
        return null;
    }

    const nearestSamples = comparisons.slice(0, k);
    const voteCounts = {};

    nearestSamples.forEach((comparison) => {
        const gestureId = comparison.gestureClass.id;

        voteCounts[gestureId] =
            (voteCounts[gestureId] || 0) + 1;
    });

    let winningGesture = nearestSamples[0].gestureClass;
    let highestVotes = voteCounts[winningGesture.id];

    nearestSamples.forEach((comparison) => {
        const candidateGesture = comparison.gestureClass;
        const candidateVotes = voteCounts[candidateGesture.id];

        if (candidateVotes > highestVotes) {
            winningGesture = candidateGesture;
            highestVotes = candidateVotes;
        }
    });

    return {
        gestureClass: winningGesture,
        confidence: highestVotes / nearestSamples.length,
        nearestSamples: nearestSamples
    };
}

function updatePredictionDisplay(
    prediction,
    emptyMessage = "Not trained yet"
) {
    if (prediction === null) {
        predictionLabel.textContent = emptyMessage;
        predictionConfidence.textContent = "Confidence: --";
        predictionAction.textContent = "Action: --";

        return;
    }

    const confidencePercentage =
        Math.round(prediction.confidence * 100);

    predictionLabel.textContent =
        prediction.gestureClass.name;

    predictionConfidence.textContent =
        `Confidence: ${confidencePercentage}%`;

    predictionAction.textContent =
        `Action: ${prediction.gestureClass.action}`;
}

captureSampleButton.addEventListener("click", () => {
    const selectedGesture = gestureClasses.find((gesture) => {
        return gesture.id === selectedGestureId;
    });

    if (selectedGesture === undefined || latestLandmarks === null) {
        formStatus.textContent =
            "Select a gesture and show your hand first.";

        return;
    }

    const sample = normalizeLandmarks(latestLandmarks);

    console.log("Normalized sample:", sample);

    selectedGesture.samples.push(sample);

    if (selectedGesture.samples.length >= 2) {
        const previousSample =
            selectedGesture.samples[selectedGesture.samples.length - 2];

        const distanceFromPrevious =
            calculateDistance(sample, previousSample);

        console.log(
            "Distance from previous sample:",
            distanceFromPrevious
        );
    }

    renderGestureClasses();

    formStatus.textContent =
        `Captured sample ${selectedGesture.samples.length} ` +
        `for ${selectedGesture.name}. ` +
        `The sample contains ${sample.length} values.`;
});



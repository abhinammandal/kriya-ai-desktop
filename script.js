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

const cardPosition =
    document.querySelector("#card-position");

const cardTitle =
    document.querySelector("#card-title");

const cardDescription =
    document.querySelector("#card-description");

const mediaDemo =
    document.querySelector("#media-demo");

const mediaIcon =
    document.querySelector(".media-icon");

const playerStatus =
    document.querySelector("#player-status");

const lightDemo =
    document.querySelector("#light-demo");

const lightStatus =
    document.querySelector("#light-status");

const actionFeedback =
    document.querySelector("#action-feedback");

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
let candidateGestureId = null;
let candidateFrameCount = 0;

const REQUIRED_STABLE_FRAMES = 8;

const demoCards = [
    {
        title: "Welcome to KRIYA",
        description:
            "Teach the system a hand gesture and decide what it should control."
    },
    {
        title: "Private by design",
        description:
            "Camera landmarks are processed inside your browser without uploading images."
    },
    {
        title: "AI shaped by its user",
        description:
            "The same hand pose can perform different actions because you define its meaning."
    }
];

let currentCardIndex = 0;
let isMediaPlaying = false;
let isVirtualLightOn = false;

let lastTriggeredGestureId = null;
let lastActionTimestamp = 0;

const ACTION_COOLDOWN_MS = 1200;

const GESTURE_STORAGE_KEY =
    "kriya-trained-gestures";

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

    stabilizePrediction(null);

    updatePredictionDisplay(
        null,
        "Camera is off"
    );

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

            const rawPrediction =
                classifyGesture(liveSample, 3);

            const stablePrediction =
                stabilizePrediction(rawPrediction);

            if (rawPrediction === null) {
                updatePredictionDisplay(null);
            } else if (stablePrediction === null) {
                updatePredictionDisplay(
                    null,
                    "Analyzing gesture..."
                );
            } else {
                updatePredictionDisplay(stablePrediction);
                tryTriggerAction(stablePrediction);
            }

            updateCaptureButtonState();

            drawHandLandmarks(results.landmarks[0]);

            cameraStatus.textContent =
                `Hand detected with ${landmarkCount} landmarks.`;
        } else {
            latestLandmarks = null;

            stabilizePrediction(null);

            lastTriggeredGestureId = null;

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

const deleteGestureButton =
    document.querySelector("#delete-gesture-button");

const clearGesturesButton =
    document.querySelector("#clear-gestures-button");

let gestureClasses = [];

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

    saveGestureClasses();

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

    updateTrainingDataButtonState();
}

function saveGestureClasses() {
    const serializedGestureClasses =
        JSON.stringify(gestureClasses);

    localStorage.setItem(
        GESTURE_STORAGE_KEY,
        serializedGestureClasses
    );
}

function loadGestureClasses() {
    const serializedGestureClasses =
        localStorage.getItem(GESTURE_STORAGE_KEY);

    if (serializedGestureClasses === null) {
        return;
    }

    try {
        const savedGestureClasses =
            JSON.parse(serializedGestureClasses);

        if (!Array.isArray(savedGestureClasses)) {
            return;
        }

        gestureClasses = savedGestureClasses;

        if (gestureClasses.length > 0) {
            selectedGestureId =
                gestureClasses[0].id;

            formStatus.textContent =
                `Restored ${gestureClasses.length} saved gesture(s).`;
        }
    } catch (error) {
        console.error(
            "Could not load saved gestures:",
            error
        );
    }
}

function updateCaptureButtonState() {
    const canCapture =
        cameraStream !== null &&
        latestLandmarks !== null &&
        selectedGestureId !== null;

    captureSampleButton.disabled = !canCapture;
}

function updateTrainingDataButtonState() {
    const selectedGestureExists =
        gestureClasses.some((gesture) => {
            return gesture.id === selectedGestureId;
        });

    deleteGestureButton.disabled =
        !selectedGestureExists;

    clearGesturesButton.disabled =
        gestureClasses.length === 0;
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

function stabilizePrediction(prediction) {
    if (prediction === null) {
        candidateGestureId = null;
        candidateFrameCount = 0;

        return null;
    }

    const predictedGestureId =
        prediction.gestureClass.id;

    if (predictedGestureId === candidateGestureId) {
        candidateFrameCount += 1;
    } else {
        candidateGestureId = predictedGestureId;
        candidateFrameCount = 1;
    }

    if (candidateFrameCount < REQUIRED_STABLE_FRAMES) {
        return null;
    }

    return prediction;
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

function renderCurrentCard() {
    const currentCard =
        demoCards[currentCardIndex];

    cardPosition.textContent =
        `Card ${currentCardIndex + 1} of ${demoCards.length}`;

    cardTitle.textContent =
        currentCard.title;

    cardDescription.textContent =
        currentCard.description;
}

function showNextCard() {
    currentCardIndex =
        (currentCardIndex + 1) % demoCards.length;

    renderCurrentCard();
}

function showPreviousCard() {
    currentCardIndex =
        (
            currentCardIndex -
            1 +
            demoCards.length
        ) % demoCards.length;

    renderCurrentCard();
}

function toggleMediaPlayback() {
    isMediaPlaying = !isMediaPlaying;

    mediaDemo.classList.toggle(
        "is-playing",
        isMediaPlaying
    );

    mediaIcon.textContent =
        isMediaPlaying ? "❚❚" : "▶";

    playerStatus.textContent =
        isMediaPlaying ? "Playing" : "Paused";
}

function toggleVirtualLight() {
    isVirtualLightOn = !isVirtualLightOn;

    lightDemo.classList.toggle(
        "is-on",
        isVirtualLightOn
    );

    lightStatus.textContent =
        isVirtualLightOn ? "On" : "Off";
}

function performAction(gestureClass) {
    let feedbackMessage = "";

    switch (gestureClass.action) {
        case "next":
            showNextCard();
            feedbackMessage = "Moved to the next card.";
            break;

        case "previous":
            showPreviousCard();
            feedbackMessage = "Moved to the previous card.";
            break;

        case "play":
            toggleMediaPlayback();

            feedbackMessage = isMediaPlaying
                ? "Started the virtual soundtrack."
                : "Paused the virtual soundtrack.";
            break;

        case "light":
            toggleVirtualLight();

            feedbackMessage = isVirtualLightOn
                ? "Turned the virtual light on."
                : "Turned the virtual light off.";
            break;

        case "none":
            feedbackMessage =
                "Neutral gesture recognized. No action performed.";
            break;

        default:
            feedbackMessage =
                "This gesture has no supported action.";
    }

    actionFeedback.textContent =
        `${gestureClass.name}: ${feedbackMessage}`;
}

function tryTriggerAction(prediction) {
    const gestureId =
        prediction.gestureClass.id;

    const currentTimestamp =
        Date.now();

    const cooldownHasFinished =
        currentTimestamp - lastActionTimestamp >=
        ACTION_COOLDOWN_MS;

    const isNewGesture =
        gestureId !== lastTriggeredGestureId;

    if (!cooldownHasFinished || !isNewGesture) {
        return;
    }

    performAction(prediction.gestureClass);

    lastTriggeredGestureId = gestureId;
    lastActionTimestamp = currentTimestamp;
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

    saveGestureClasses();

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

deleteGestureButton.addEventListener("click", () => {
    const selectedGesture =
        gestureClasses.find((gesture) => {
            return gesture.id === selectedGestureId;
        });

    if (selectedGesture === undefined) {
        return;
    }

    const deletionConfirmed =
        window.confirm(
            `Delete "${selectedGesture.name}" and all its samples?`
        );

    if (!deletionConfirmed) {
        return;
    }

    gestureClasses =
        gestureClasses.filter((gesture) => {
            return gesture.id !== selectedGestureId;
        });

    selectedGestureId =
        gestureClasses.length > 0
            ? gestureClasses[0].id
            : null;

    saveGestureClasses();
    renderGestureClasses();

    stabilizePrediction(null);
    lastTriggeredGestureId = null;

    formStatus.textContent =
        `"${selectedGesture.name}" was deleted.`;
});

clearGesturesButton.addEventListener("click", () => {
    if (gestureClasses.length === 0) {
        return;
    }

    const clearingConfirmed =
        window.confirm(
            `Delete all ${gestureClasses.length} trained gesture(s)?`
        );

    if (!clearingConfirmed) {
        return;
    }

    gestureClasses = [];
    selectedGestureId = null;

    localStorage.removeItem(
        GESTURE_STORAGE_KEY
    );

    stabilizePrediction(null);
    lastTriggeredGestureId = null;

    renderGestureClasses();

    updatePredictionDisplay(
        null,
        "Training cleared"
    );

    formStatus.textContent =
        "All saved gesture training data was deleted.";

    actionFeedback.textContent =
        "Waiting for new training data...";
});



loadGestureClasses();
renderGestureClasses();

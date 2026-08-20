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

const listeningStatus =
    document.querySelector("#listening-status");

const listeningStatusText =
    document.querySelector("#listening-status-text");

const controlProfileSelect =
    document.querySelector("#control-profile");

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
let cameraIsStarting = false;
let handLandmarker = null;
let animationFrameId = null;
let lastVideoTime = -1;
let latestLandmarks = null;
let desktopControlEnabled = true;
let candidateGestureId = null;
let candidateStartTime = 0;

const REQUIRED_STABLE_DURATION_MS = 350;

const MAXIMUM_GESTURE_DISTANCE = 0.45;

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

const PROFILE_STORAGE_KEY =
    "kriya-control-profile";

const AVAILABLE_PROFILES = new Set([
    "presentation",
    "browser",
    "media"
]);

const PROFILE_ACTIONS = {
    presentation: [
        {
            value: "next",
            label: "Next slide"
        },
        {
            value: "previous",
            label: "Previous slide"
        },
        {
            value: "presentation-start",
            label: "Start slideshow (F5)"
        },
        {
            value: "presentation-end",
            label: "End slideshow (Esc)"
        },
        {
            value: "presentation-black",
            label: "Black or restore screen (B)"
        },
        {
            value: "none",
            label: "Neutral — no action"
        }
    ],

    browser: [
        {
            value: "browser-back",
            label: "Go back"
        },
        {
            value: "browser-forward",
            label: "Go forward"
        },
        {
            value: "browser-scroll-down",
            label: "Scroll down"
        },
        {
            value: "browser-scroll-up",
            label: "Scroll up"
        },
        {
            value: "browser-refresh",
            label: "Refresh page"
        },
        {
            value: "play",
            label: "Play or pause video — Media key"
        },
        {
            value: "browser-space",
            label: "Press Space — Focused player fallback"
        },
        {
            value: "none",
            label: "Neutral — no action"
        }
    ]
};

let activeProfile = "presentation";

console.log("KRIYA JavaScript is connected.");

function loadControlProfile() {
    const savedProfile =
        localStorage.getItem(
            PROFILE_STORAGE_KEY
        );

    if (
        savedProfile !== null &&
        AVAILABLE_PROFILES.has(savedProfile)
    ) {
        activeProfile = savedProfile;
    }

    controlProfileSelect.value =
        activeProfile;
}

function changeControlProfile(profileName) {
    if (!AVAILABLE_PROFILES.has(profileName)) {
        return;
    }

    activeProfile = profileName;

    localStorage.setItem(
        PROFILE_STORAGE_KEY,
        activeProfile
    );

    const firstGestureInProfile =
        gestureClasses.find((gesture) => {
            return gesture.profile === activeProfile;
        });

    selectedGestureId =
        firstGestureInProfile !== undefined
            ? firstGestureInProfile.id
            : null;

    renderProfileActionOptions();
    
    stabilizePrediction(null);
    lastTriggeredGestureId = null;

    renderGestureClasses();

    updatePredictionDisplay(
        null,
        "Profile changed"
    );

    formStatus.textContent =
        firstGestureInProfile !== undefined
            ? `Showing gestures from the ${activeProfile} profile.`
            : `No gestures have been trained for the ${activeProfile} profile.`;

    actionFeedback.textContent =
        `Active control profile: ${activeProfile}.`;
}

controlProfileSelect.addEventListener(
    "change",
    () => {
        const selectedProfile =
            controlProfileSelect.value;

        controlProfileSelect.blur();

        changeControlProfile(
            selectedProfile
        );
    }
);

loadControlProfile();

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

        if (
            desktopControlEnabled &&
            cameraStream === null
        ) {
            await startCamera();
        }

    } catch (error) {
        console.error("Model loading error:", error);


        cameraStatus.textContent =
            `AI model could not load: ${error.name}`;
    }
}


if (window.kriyaDesktop !== undefined) {
    window.kriyaDesktop
        .onDesktopControlStateChanged((state) => {
            applyDesktopControlState(state)
                .catch((error) => {
                    console.error(
                        "Could not apply desktop-control state:",
                        error
                    );
                });
        });

    window.kriyaDesktop
        .getDesktopControlState()
        .then((state) => {
            return applyDesktopControlState(state);
        })
        .catch((error) => {
            console.error(
                "Could not read desktop-control state:",
                error
            );
        });
}

initializeHandLandmarker();

cameraButton.addEventListener("click", async () => {
    const shouldEnableControl =
        cameraStream === null;

    if (window.kriyaDesktop !== undefined) {
        try {
            await window.kriyaDesktop
                .setDesktopControlState(
                    shouldEnableControl
                );
        } catch (error) {
            console.error(
                "Could not change desktop-control state:",
                error
            );

            cameraStatus.textContent =
                "Could not change KRIYA listening state.";
        }

        return;
    }

    if (shouldEnableControl) {
        await startCamera();
    } else {
        stopCamera();
    }
});

async function startCamera() {
    if (
        cameraStream !== null ||
        cameraIsStarting
    ) {
        return;
    }

    cameraIsStarting = true;

    cameraStatus.textContent =
        "Requesting camera permission...";

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
    } finally {
        cameraIsStarting = false;
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

function updateListeningStatus(enabled) {
    listeningStatus.classList.toggle(
        "is-active",
        enabled
    );

    listeningStatus.classList.toggle(
        "is-paused",
        !enabled
    );

    listeningStatusText.textContent =
        enabled
            ? "Listening"
            : "Paused";
}


async function applyDesktopControlState(state) {
    desktopControlEnabled =
        Boolean(state.enabled);

    updateListeningStatus(
        desktopControlEnabled
    );

    if (!desktopControlEnabled) {
        if (cameraStream !== null) {
            stopCamera();
        } else {
            stabilizePrediction(null);
            lastTriggeredGestureId = null;
            updateCaptureButtonState();
            clearLandmarkCanvas();
        }

        updatePredictionDisplay(
            null,
            "Gesture control paused"
        );

        cameraStatus.textContent =
            "KRIYA is paused. Camera is off.";

        return;
    }

    if (
        handLandmarker !== null &&
        cameraStream === null
    ) {
        await startCamera();
    }
}

function predictWebcam() {
    if (cameraStream === null) {
        return;
    }

    if (handLandmarker === null) {
        animationFrameId =
            requestAnimationFrame(predictWebcam);

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

            const predictionIsUnknown =
                rawPrediction !== null &&
                rawPrediction.nearestDistance >
                MAXIMUM_GESTURE_DISTANCE;

            if (predictionIsUnknown) {
                stabilizePrediction(null);
                lastTriggeredGestureId = null;

                updatePredictionDisplay(
                    null,
                    "Unknown gesture"
                );

                predictionConfidence.textContent =
                    `Distance: ${rawPrediction.nearestDistance.toFixed(3)} ` +
                    `(limit: ${MAXIMUM_GESTURE_DISTANCE})`;

                predictionAction.textContent =
                    "Action: blocked";

            } else {
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
const createGestureButton =
    document.querySelector("#create-gesture-button");
const formStatus = document.querySelector("#form-status");

const gestureList = document.querySelector("#gesture-list");

const deleteGestureButton =
    document.querySelector("#delete-gesture-button");

const clearGesturesButton =
    document.querySelector("#clear-gestures-button");

let gestureClasses = [];

let selectedGestureId = null;

function renderProfileActionOptions() {
    gestureActionSelect.innerHTML = "";

    const profileActions =
        PROFILE_ACTIONS[activeProfile];

    if (profileActions === undefined) {
        const unavailableOption =
            document.createElement("option");

        unavailableOption.value = "";
        unavailableOption.textContent =
            `${activeProfile} actions are coming next`;

        gestureActionSelect.appendChild(
            unavailableOption
        );

        gestureActionSelect.disabled = true;
        createGestureButton.disabled = true;

        return;
    }

    profileActions.forEach((action) => {
        const actionOption =
            document.createElement("option");

        actionOption.value = action.value;
        actionOption.textContent = action.label;

        gestureActionSelect.appendChild(
            actionOption
        );
    });

    gestureActionSelect.disabled = false;
    createGestureButton.disabled = false;
}

renderProfileActionOptions();

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
        profile: activeProfile,
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

    const profileGestures =
        gestureClasses.filter((gesture) => {
            return gesture.profile === activeProfile;
        });

    profileGestures.forEach((gesture) => {
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
        localStorage.getItem(
            GESTURE_STORAGE_KEY
        );

    if (serializedGestureClasses === null) {
        return;
    }

    try {
        const savedGestureClasses =
            JSON.parse(
                serializedGestureClasses
            );

        if (!Array.isArray(savedGestureClasses)) {
            return;
        }

        let savedDataWasMigrated = false;

        gestureClasses =
            savedGestureClasses.map((gesture) => {
                if (
                    AVAILABLE_PROFILES.has(
                        gesture.profile
                    )
                ) {
                    return gesture;
                }

                savedDataWasMigrated = true;

                return {
                    ...gesture,
                    profile: "presentation"
                };
            });

        if (savedDataWasMigrated) {
            saveGestureClasses();
        }

        const profileGestures =
            gestureClasses.filter((gesture) => {
                return gesture.profile === activeProfile;
            });

        selectedGestureId =
            profileGestures.length > 0
                ? profileGestures[0].id
                : null;

        if (profileGestures.length > 0) {
            formStatus.textContent =
                `Restored ${profileGestures.length} saved gesture(s) ` +
                `for the ${activeProfile} profile.`;
        } else {
            formStatus.textContent =
                `No saved gestures in the ${activeProfile} profile.`;
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

    gestureClasses
        .filter((gestureClass) => {
            return gestureClass.profile === activeProfile;
        })
        .forEach((gestureClass) => {
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
        nearestDistance: nearestSamples[0].distance,
        nearestSamples: nearestSamples
    };
}

function stabilizePrediction(prediction) {
    if (prediction === null) {
        candidateGestureId = null;
        candidateStartTime = 0;

        return null;
    }

    const predictedGestureId =
        prediction.gestureClass.id;

    const currentTime = performance.now();

    if (predictedGestureId !== candidateGestureId) {
        candidateGestureId = predictedGestureId;
        candidateStartTime = currentTime;

        return null;
    }

    const stableDuration =
        currentTime - candidateStartTime;

    if (
        stableDuration <
        REQUIRED_STABLE_DURATION_MS
    ) {
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

    const formattedDistance =
        prediction.nearestDistance.toFixed(3);

    predictionLabel.textContent =
        prediction.gestureClass.name;

    predictionConfidence.textContent =
        `Confidence: ${confidencePercentage}% ` +
        `• Distance: ${formattedDistance}`;

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

    if (window.kriyaDesktop !== undefined) {
        window.kriyaDesktop
            .performAction(gestureClass.action)
            .then((result) => {
                if (!result.success) {
                    console.error(
                        "Desktop action was not completed:",
                        result.error
                    );
                }
            })
            .catch((error) => {
                console.error(
                    "Desktop action request failed:",
                    error
                );
            });
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

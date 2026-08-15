const cameraButton = document.querySelector("#camera-button");
const cameraStatus = document.querySelector("#camera-status");
const cameraVideo = document.querySelector("#camera-video");
const cameraPlaceholder = document.querySelector("#camera-placeholder");

let cameraStream = null;

console.log("KRIYA JavaScript is connected.");

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

    cameraVideo.srcObject = null;
    cameraStream = null;

    cameraPlaceholder.hidden = false;
    cameraButton.textContent = "Start camera";

    cameraStatus.textContent = "Camera has been stopped.";
}

const gestureForm = document.querySelector("#gesture-form");
const gestureNameInput = document.querySelector("#gesture-name");
const gestureActionSelect = document.querySelector("#gesture-action");
const formStatus = document.querySelector("#form-status");

gestureForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const gestureName = gestureNameInput.value.trim();
    const selectedAction = gestureActionSelect.value;

    if (gestureName === "") {
        formStatus.textContent = "Please enter a gesture name.";
        return;
    }

    formStatus.textContent =
        `${gestureName} will perform the "${selectedAction}" action.`;

    gestureForm.reset();
});
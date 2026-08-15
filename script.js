const cameraButton = document.querySelector("#camera-button");
const cameraStatus = document.querySelector("#camera-status");

console.log("KRIYA JavaScript is connected.");

cameraButton.addEventListener("click", () => {
    cameraStatus.textContent =
        "Button click detected. Camera logic will be added next.";
});

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
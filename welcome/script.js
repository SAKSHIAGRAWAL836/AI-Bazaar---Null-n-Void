const video = document.getElementById("introVideo");
const content = document.getElementById("welcomeContent");

video.addEventListener("ended", () => {
  content.classList.remove("hidden");
});

function goToHome() {
  window.location.href = "homepage.html"; // Change this if your homepage is different
}


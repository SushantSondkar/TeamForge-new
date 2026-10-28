/**
 * carousel.js - Accessible, dependency-free Event Carousel for TeamForge Dashboard
 * Features:
 * - 5s Auto-advance with hover pause & focus pause
 * - prefers-reduced-motion honor (halts auto-rotation)
 * - Mobile touch swipe gestures (left / right)
 * - Keyboard navigation (ArrowLeft / ArrowRight)
 * - Accessible ARIA attributes and dot indicators
 * - 0 inline handlers, fully CSP compliant
 */

(function () {
  function initEventCarousel() {
    var container = document.querySelector(".event-carousel-container");
    if (!container) return;

    var slides = container.querySelectorAll(".event-carousel-slide");
    if (!slides || slides.length === 0) return;

    var dots = container.querySelectorAll(".carousel-dot");
    var prevBtn = document.querySelector(".carousel-btn-prev");
    var nextBtn = document.querySelector(".carousel-btn-next");

    var currentIndex = 0;
    var totalSlides = slides.length;
    var autoPlayTimer = null;
    var isHovered = false;
    var isFocused = false;

    // Check prefers-reduced-motion
    function isReducedMotion() {
      try {
        return (
          window.matchMedia &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches
        );
      } catch (e) {
        return false;
      }
    }

    function showSlide(index) {
      if (index < 0) {
        currentIndex = totalSlides - 1;
      } else if (index >= totalSlides) {
        currentIndex = 0;
      } else {
        currentIndex = index;
      }

      for (var i = 0; i < totalSlides; i++) {
        var slide = slides[i];
        if (i === currentIndex) {
          slide.classList.add("is-active");
          slide.setAttribute("aria-hidden", "false");
        } else {
          slide.classList.remove("is-active");
          slide.setAttribute("aria-hidden", "true");
        }
      }

      if (dots && dots.length > 0) {
        for (var j = 0; j < dots.length; j++) {
          var dot = dots[j];
          if (j === currentIndex) {
            dot.classList.add("is-active");
            dot.setAttribute("aria-selected", "true");
          } else {
            dot.classList.remove("is-active");
            dot.setAttribute("aria-selected", "false");
          }
        }
      }
    }

    function nextSlide() {
      showSlide(currentIndex + 1);
    }

    function prevSlide() {
      showSlide(currentIndex - 1);
    }

    function startAutoPlay() {
      stopAutoPlay();
      if (isReducedMotion() || totalSlides <= 1) return;

      autoPlayTimer = setInterval(function () {
        if (!isHovered && !isFocused) {
          nextSlide();
        }
      }, 5000);
    }

    function stopAutoPlay() {
      if (autoPlayTimer) {
        clearInterval(autoPlayTimer);
        autoPlayTimer = null;
      }
    }

    // Attach navigation controls
    if (prevBtn) {
      prevBtn.addEventListener("click", function (e) {
        e.preventDefault();
        prevSlide();
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener("click", function (e) {
        e.preventDefault();
        nextSlide();
      });
    }

    if (dots && dots.length > 0) {
      for (var k = 0; k < dots.length; k++) {
        (function (idx) {
          dots[idx].addEventListener("click", function (e) {
            e.preventDefault();
            showSlide(idx);
          });
        })(k);
      }
    }

    // Hover pause
    container.addEventListener("mouseenter", function () {
      isHovered = true;
    });
    container.addEventListener("mouseleave", function () {
      isHovered = false;
    });

    // Keyboard focus pause
    container.addEventListener("focusin", function () {
      isFocused = true;
    });
    container.addEventListener("focusout", function () {
      isFocused = false;
    });

    // Keyboard navigation (Arrow keys)
    container.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        prevSlide();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        nextSlide();
      }
    });

    // Touch swipe gestures
    var touchStartX = 0;
    var touchStartY = 0;

    container.addEventListener(
      "touchstart",
      function (e) {
        if (e.touches && e.touches.length === 1) {
          touchStartX = e.touches[0].clientX;
          touchStartY = e.touches[0].clientY;
        }
      },
      { passive: true }
    );

    container.addEventListener(
      "touchend",
      function (e) {
        if (e.changedTouches && e.changedTouches.length === 1) {
          var touchEndX = e.changedTouches[0].clientX;
          var touchEndY = e.changedTouches[0].clientY;
          var diffX = touchEndX - touchStartX;
          var diffY = touchEndY - touchStartY;

          // If horizontal swipe is more significant than vertical
          if (Math.abs(diffX) > 40 && Math.abs(diffX) > Math.abs(diffY)) {
            if (diffX < 0) {
              nextSlide(); // Swiped left -> show next
            } else {
              prevSlide(); // Swiped right -> show prev
            }
          }
        }
      },
      { passive: true }
    );

    // Initial display and start autoplay
    showSlide(0);
    startAutoPlay();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initEventCarousel);
  } else {
    initEventCarousel();
  }
})();


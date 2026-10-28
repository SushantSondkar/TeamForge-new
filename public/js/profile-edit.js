/**
 * Profile Edit Page Interactivity & Cropper (CSP-safe, external script)
 */
document.addEventListener('DOMContentLoaded', () => {
    const defaultAvatar = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='12' fill='%23e2e8f0'/%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z' fill='%239ca3af'/%3E%3C/svg%3E";
    const avatarDropzone = document.getElementById('avatarDropzone');
    const dropzoneOverlay = document.getElementById('dropzoneOverlay');
    const avatarFileInput = document.getElementById('avatarFileInput');
    const avatarPreview = document.getElementById('avatarPreview');
    const profilePicInput = document.getElementById('profilePicInput');
    const avatarUrlInput = document.getElementById('avatarUrlInput');
    const removePhotoBtn = document.getElementById('removePhotoBtn');
    const avatarSizeError = document.getElementById('avatarSizeError');
    const btnGithubAvatar = document.getElementById('btn-set-github-avatar');

    // Crop Modal Elements
    const cropModal = document.getElementById('cropModal');
    const cropCanvas = document.getElementById('cropCanvas');
    const cropZoomSlider = document.getElementById('cropZoomSlider');
    const ctx = cropCanvas ? cropCanvas.getContext('2d') : null;

    let currentImg = null;
    let baseScale = 1;
    let currentZoom = 1;
    let panX = 0;
    let panY = 0;
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;

    // Load file into Cropper
    function loadFileForCrop(file) {
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            alert('Please select an image file (PNG, JPG, WEBP, GIF).');
            return;
        }
        if (file.size > 8 * 1024 * 1024) {
            if (avatarSizeError) avatarSizeError.style.display = 'block';
            return;
        }
        if (avatarSizeError) avatarSizeError.style.display = 'none';

        const reader = new FileReader();
        reader.onload = function(evt) {
            openCropModalWithSource(evt.target.result);
        };
        reader.readAsDataURL(file);
    }

    // Open Crop Modal with image source
    function openCropModalWithSource(src) {
        const img = new Image();
        if (src && !src.startsWith('data:')) {
            img.crossOrigin = 'anonymous';
        }
        img.onload = function() {
            currentImg = img;
            // 240px is circle crop diameter on 320x320 canvas
            baseScale = Math.max(240 / (img.naturalWidth || img.width), 240 / (img.naturalHeight || img.height));
            currentZoom = 1;
            panX = 0;
            panY = 0;
            if (cropZoomSlider) cropZoomSlider.value = 1;
            if (cropModal) cropModal.style.display = 'flex';
            drawCrop();
        };
        img.onerror = function() {
            // If cross-origin anonymous failed (e.g. strict CORS), try loading without crossOrigin
            if (img.crossOrigin) {
                const fallbackImg = new Image();
                fallbackImg.onload = function() {
                    currentImg = fallbackImg;
                    baseScale = Math.max(240 / (fallbackImg.naturalWidth || fallbackImg.width), 240 / (fallbackImg.naturalHeight || fallbackImg.height));
                    currentZoom = 1;
                    panX = 0;
                    panY = 0;
                    if (cropZoomSlider) cropZoomSlider.value = 1;
                    if (cropModal) cropModal.style.display = 'flex';
                    drawCrop();
                };
                fallbackImg.onerror = function() {
                    alert('Could not load image for cropping. Please check the file or link.');
                };
                fallbackImg.src = src;
            } else {
                alert('Could not load image for cropping. Please check the file or link.');
            }
        };
        img.src = src;
    }

    // Render Canvas Viewport with circular mask
    function drawCrop() {
        if (!ctx || !currentImg) return;
        const width = cropCanvas.width;
        const height = cropCanvas.height;
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = 120; // 240px diameter

        ctx.clearRect(0, 0, width, height);

        // Draw transformed image
        const effectiveScale = baseScale * currentZoom;
        ctx.save();
        ctx.translate(centerX + panX, centerY + panY);
        ctx.scale(effectiveScale, effectiveScale);
        ctx.drawImage(currentImg, -currentImg.width / 2, -currentImg.height / 2);
        ctx.restore();

        // Draw translucent mask outside crop circle
        ctx.save();
        ctx.fillStyle = 'rgba(15, 23, 42, 0.65)';
        ctx.beginPath();
        ctx.rect(0, 0, width, height);
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2, true);
        ctx.fill();

        // Draw circular guide ring
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#ffffff';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
        ctx.shadowBlur = 6;
        ctx.stroke();
        ctx.restore();
    }

    // Native File Input change
    if (avatarFileInput) {
        avatarFileInput.addEventListener('change', function(e) {
            if (e.target.files && e.target.files[0]) {
                loadFileForCrop(e.target.files[0]);
            }
        });
    }

    // Drag and Drop on dropzone
    if (avatarDropzone) {
        ['dragenter', 'dragover'].forEach(eventName => {
            avatarDropzone.addEventListener(eventName, function(e) {
                e.preventDefault();
                e.stopPropagation();
                avatarDropzone.style.borderColor = '#2563eb';
                avatarDropzone.style.background = '#eff6ff';
                if (dropzoneOverlay) dropzoneOverlay.style.display = 'flex';
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            avatarDropzone.addEventListener(eventName, function(e) {
                e.preventDefault();
                e.stopPropagation();
                avatarDropzone.style.borderColor = '#cbd5e1';
                avatarDropzone.style.background = '#f8fafc';
                if (dropzoneOverlay) dropzoneOverlay.style.display = 'none';
            }, false);
        });

        avatarDropzone.addEventListener('drop', function(e) {
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                loadFileForCrop(e.dataTransfer.files[0]);
            }
        }, false);
    }

    // Canvas Mouse & Touch Dragging
    if (cropCanvas) {
        cropCanvas.addEventListener('mousedown', function(e) {
            isDragging = true;
            cropCanvas.style.cursor = 'grabbing';
            dragStartX = e.clientX - panX;
            dragStartY = e.clientY - panY;
        });

        window.addEventListener('mousemove', function(e) {
            if (!isDragging) return;
            panX = e.clientX - dragStartX;
            panY = e.clientY - dragStartY;
            drawCrop();
        });

        window.addEventListener('mouseup', function() {
            if (isDragging) {
                isDragging = false;
                if (cropCanvas) cropCanvas.style.cursor = 'grab';
            }
        });

        // Touch support
        cropCanvas.addEventListener('touchstart', function(e) {
            if (e.touches.length === 1) {
                isDragging = true;
                dragStartX = e.touches[0].clientX - panX;
                dragStartY = e.touches[0].clientY - panY;
            }
        }, { passive: true });

        window.addEventListener('touchmove', function(e) {
            if (!isDragging || e.touches.length !== 1) return;
            panX = e.touches[0].clientX - dragStartX;
            panY = e.touches[0].clientY - dragStartY;
            drawCrop();
        }, { passive: true });

        window.addEventListener('touchend', function() {
            isDragging = false;
        });

        // Wheel zoom
        cropCanvas.addEventListener('wheel', function(e) {
            e.preventDefault();
            const delta = e.deltaY * -0.002;
            currentZoom = Math.min(3, Math.max(1, currentZoom + delta));
            if (cropZoomSlider) cropZoomSlider.value = currentZoom;
            drawCrop();
        }, { passive: false });
    }

    // Slider Zoom
    if (cropZoomSlider) {
        cropZoomSlider.addEventListener('input', function() {
            currentZoom = parseFloat(this.value);
            drawCrop();
        });
    }

    function resetCrop() {
        currentZoom = 1;
        panX = 0;
        panY = 0;
        if (cropZoomSlider) cropZoomSlider.value = 1;
        drawCrop();
    }

    function closeCropModal() {
        if (cropModal) {
            cropModal.style.display = 'none';
        }
        if (avatarFileInput) {
            avatarFileInput.value = '';
        }
    }

    // Backdrop click & Escape key close
    if (cropModal) {
        cropModal.addEventListener('click', function(e) {
            if (e.target === cropModal) {
                closeCropModal();
            }
        });
    }

    window.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && cropModal && cropModal.style.display !== 'none') {
            closeCropModal();
        }
    });

    // Explicit DOM button click listeners
    const btnCancel = document.getElementById('cropCancelBtn');
    const btnCloseX = document.getElementById('cropCloseXBtn');
    const btnApply = document.getElementById('cropApplyBtn');
    const btnReset = document.getElementById('cropResetBtn');

    if (btnCancel) btnCancel.addEventListener('click', closeCropModal);
    if (btnCloseX) btnCloseX.addEventListener('click', closeCropModal);
    if (btnReset) btnReset.addEventListener('click', resetCrop);
    if (btnApply) btnApply.addEventListener('click', function() { applyCrop(); });

    async function applyCrop() {
        if (!currentImg) {
            closeCropModal();
            return;
        }

        let croppedDataUrl = null;
        try {
            // High-resolution 300x300 export
            const outCanvas = document.createElement('canvas');
            outCanvas.width = 300;
            outCanvas.height = 300;
            const outCtx = outCanvas.getContext('2d');

            const ratio = 300 / 240;
            const effectiveScale = baseScale * currentZoom * ratio;

            outCtx.save();
            outCtx.translate(150 + panX * ratio, 150 + panY * ratio);
            outCtx.scale(effectiveScale, effectiveScale);
            outCtx.drawImage(currentImg, -currentImg.width / 2, -currentImg.height / 2);
            outCtx.restore();

            try {
                croppedDataUrl = outCanvas.toDataURL('image/jpeg', 0.90);
            } catch (jpegErr) {
                croppedDataUrl = outCanvas.toDataURL('image/png');
            }
        } catch (canvasErr) {
            console.error('Canvas export error:', canvasErr);
            try {
                if (cropCanvas) {
                    croppedDataUrl = cropCanvas.toDataURL('image/png');
                }
            } catch (e2) {
                croppedDataUrl = currentImg.src;
            }
        }

        if (!croppedDataUrl) {
            croppedDataUrl = currentImg.src;
        }

        // 1. Immediately update UI preview and hidden form field
        if (avatarPreview) avatarPreview.src = croppedDataUrl;
        if (profilePicInput) profilePicInput.value = croppedDataUrl;
        if (avatarUrlInput) avatarUrlInput.value = '';
        if (removePhotoBtn) {
            removePhotoBtn.classList.remove('is-hidden');
            removePhotoBtn.style.display = 'inline-flex';
        }

        // Update navbar avatar if present
        const navAvatar = document.querySelector('.navbar .user-avatar');
        if (navAvatar) navAvatar.src = croppedDataUrl;

        // 2. Immediately close modal so user is never stuck
        closeCropModal();

        // 3. Show live confirmation banner on page
        let alertBox = document.getElementById('photoSaveSuccessAlert');
        if (!alertBox) {
            alertBox = document.createElement('div');
            alertBox.id = 'photoSaveSuccessAlert';
            alertBox.style.cssText = 'background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; padding: 12px 16px; border-radius: 8px; margin-bottom: 20px; font-size: 13.5px; font-weight: 500; display: flex; align-items: center; justify-content: space-between; gap: 10px; transition: all 0.3s ease;';
            const editCard = document.querySelector('.edit-card');
            if (editCard && editCard.parentNode) {
                editCard.parentNode.insertBefore(alertBox, editCard);
            }
        }
        alertBox.innerHTML = `<span>⏳ Saving cropped photo directly to database...</span>`;
        alertBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        function setAlert(bg, border, color, message) {
            alertBox.style.background = bg;
            alertBox.style.borderColor = border;
            alertBox.style.color = color;
            alertBox.innerHTML = '';
            
            const msgSpan = document.createElement('span');
            msgSpan.textContent = message;
            alertBox.appendChild(msgSpan);

            const closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.style.cssText = 'background:none; border:none; cursor:pointer; color:' + color + '; font-size:18px;';
            closeBtn.innerHTML = '&times;';
            closeBtn.addEventListener('click', () => alertBox.remove());
            alertBox.appendChild(closeBtn);
        }

        // 4. Background persist to MongoDB via /profile/photo with CSRF token
        try {
            const csrfInput = document.querySelector('input[name="_csrf"]');
            const csrfToken = csrfInput ? csrfInput.value : '';

            const response = await fetch('/profile/photo', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-CSRF-Token': csrfToken
                },
                body: JSON.stringify({
                    _csrf: csrfToken,
                    profilePic: croppedDataUrl,
                    avatar: croppedDataUrl,
                    photo: croppedDataUrl
                })
            });

            if (response.ok) {
                setAlert('#f0fdf4', '#bbf7d0', '#166534', '✅ Profile photo cropped and saved directly to the database!');
            } else {
                const errData = await response.json().catch(() => ({}));
                setAlert('#fef2f2', '#fecaca', '#991b1b', '⚠️ ' + (errData.error || 'Failed to save photo directly') + '. Click "Save Changes" below to retry.');
            }
        } catch (saveErr) {
            console.warn('Background save notice:', saveErr);
            setAlert('#f0fdf4', '#bbf7d0', '#166534', '✅ Photo cropped and set! Click "Save Changes" below to finalize.');
        }
    }

    // GitHub & URL helpers
    function setGithubAvatar(username) {
        const url = "https://github.com/" + username + ".png?size=400";
        openCropModalWithSource(url);
    }

    function handleUrlInput(url) {
        const clean = (url || '').trim();
        if (clean && (clean.startsWith('http://') || clean.startsWith('https://'))) {
            openCropModalWithSource(clean);
        } else if (!clean) {
            removePhoto();
        }
    }

    function removePhoto() {
        if (avatarPreview) avatarPreview.src = defaultAvatar;
        if (profilePicInput) profilePicInput.value = '';
        if (avatarUrlInput) avatarUrlInput.value = '';
        if (avatarFileInput) avatarFileInput.value = '';
        if (removePhotoBtn) {
            removePhotoBtn.classList.add('is-hidden');
            removePhotoBtn.style.display = 'none';
        }
    }

    // Attach listeners for avatar action buttons
    if (btnGithubAvatar) {
        btnGithubAvatar.addEventListener('click', () => {
            const username = btnGithubAvatar.getAttribute('data-github-user');
            if (username) {
                setGithubAvatar(username);
            }
        });
    }

    if (removePhotoBtn) {
        removePhotoBtn.addEventListener('click', () => {
            removePhoto();
        });
    }

    if (avatarUrlInput) {
        avatarUrlInput.addEventListener('change', (e) => {
            handleUrlInput(e.target.value);
        });
    }

    // Expose helpers on window if needed
    window.setGithubAvatar = setGithubAvatar;
    window.handleUrlInput = handleUrlInput;
    window.removePhoto = removePhoto;
    window.openCropModalWithSource = openCropModalWithSource;
    window.closeCropModal = closeCropModal;
    window.resetCrop = resetCrop;
    window.applyCrop = applyCrop;
});

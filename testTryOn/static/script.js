let personImage = null;
let garmentImages = [];
let currentGarmentIndex = 0;
let currentResultImage = null;
let isProcessing = false;

const personInput = document.getElementById('personInput');
const garmentInput = document.getElementById('garmentInput');
const personPreview = document.getElementById('personPreview');
const garmentPreview = document.getElementById('garmentPreview');
const tryOnBtn = document.getElementById('tryOnBtn');
const errorMsg = document.getElementById('errorMsg');
const loadingMsg = document.getElementById('loadingMsg');
const resultSection = document.getElementById('resultSection');
const originalImg = document.getElementById('originalImg');
const resultImg = document.getElementById('resultImg');
const garmentSelector = document.getElementById('garmentSelector');
const clearPersonBtn = document.getElementById('clearPerson');
const clearGarmentBtn = document.getElementById('clearGarment');

personInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        if (!validateFileType(file)) {
            showError('Please upload a valid image file (PNG or JPEG)');
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            showError('Person image is too large. Maximum size is 10MB.');
            return;
        }
        
        personImage = file;
        const reader = new FileReader();
        reader.onload = (e) => {
            personPreview.innerHTML = `<img src="${e.target.result}" alt="Person image preview">`;
            clearPersonBtn.style.display = 'inline-block';
            checkInputs();
            hideError();
        };
        reader.onerror = () => {
            showError('Failed to read image file. Please try again.');
        };
        reader.readAsDataURL(file);
    }
});

clearPersonBtn.addEventListener('click', () => {
    personImage = null;
    personInput.value = '';
    personPreview.innerHTML = '<div class="placeholder">No image selected</div>';
    clearPersonBtn.style.display = 'none';
    resultSection.style.display = 'none';
    checkInputs();
});

garmentInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    
    if (files.length === 0) return;
    
    // Validate files
    for (let file of files) {
        if (!validateFileType(file)) {
            showError('Please upload valid image files (PNG or JPEG only)');
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            showError('One or more garment images are too large. Maximum size is 10MB each.');
            return;
        }
    }
    
    garmentImages = files;
    garmentPreview.innerHTML = '';
    
    garmentImages.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = document.createElement('img');
            img.src = e.target.result;
            img.className = 'garment-thumb' + (index === 0 ? ' selected' : '');
            img.alt = `Garment ${index + 1}`;
            img.onclick = () => selectGarment(index);
            garmentPreview.appendChild(img);
        };
        reader.readAsDataURL(file);
    });
    
    clearGarmentBtn.style.display = 'inline-block';
    currentGarmentIndex = 0;
    checkInputs();
    hideError();
});

clearGarmentBtn.addEventListener('click', () => {
    garmentImages = [];
    garmentInput.value = '';
    garmentPreview.innerHTML = '<div class="placeholder">No image selected</div>';
    clearGarmentBtn.style.display = 'none';
    resultSection.style.display = 'none';
    checkInputs();
});

function selectGarment(index) {
    if (isProcessing) return;
    
    currentGarmentIndex = index;
    const thumbs = garmentPreview.querySelectorAll('.garment-thumb');
    thumbs.forEach((thumb, i) => {
        thumb.classList.toggle('selected', i === index);
    });
    
    if (personImage && !isProcessing) {
        tryOnGarment();
    }
}

function validateFileType(file) {
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    return validTypes.includes(file.type);
}

function showError(message) {
    errorMsg.textContent = message;
    errorMsg.style.display = 'block';
    setTimeout(() => {
        hideError();
    }, 8000);
}

function hideError() {
    errorMsg.style.display = 'none';
    errorMsg.textContent = '';
}

function checkInputs() {
    tryOnBtn.disabled = !(personImage && garmentImages.length > 0) || isProcessing;
}

tryOnBtn.addEventListener('click', tryOnGarment);

async function tryOnGarment() {
    if (isProcessing) return;
    
    isProcessing = true;
    hideError();
    loadingMsg.style.display = 'block';
    resultSection.style.display = 'none';
    tryOnBtn.disabled = true;
    
    const loadingText = document.getElementById('loadingText');
    const loadingStep = document.getElementById('loadingStep');
    
    // Progress simulation
    const steps = [
        { text: 'Validating images...', duration: 500 },
        { text: 'Processing person image...', duration: 1000 },
        { text: 'Removing garment background...', duration: 8000 },
        { text: 'Calling Google AI API...', duration: 3000 },
        { text: 'Generating virtual try-on (this takes 30-60s)...', duration: 50000 },
        { text: 'Finalizing result...', duration: 5000 }
    ];
    
    let currentStep = 0;
    const updateProgress = () => {
        if (currentStep < steps.length && isProcessing) {
            loadingStep.textContent = steps[currentStep].text;
            currentStep++;
            if (currentStep < steps.length) {
                setTimeout(updateProgress, steps[currentStep - 1].duration);
            }
        }
    };
    updateProgress();
    
    const formData = new FormData();
    formData.append('person', personImage);
    formData.append('garment', garmentImages[currentGarmentIndex]);
    
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000);
        
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData,
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to process images. Please try again.');
        }
        
        if (data.success) {
            loadingStep.textContent = 'Complete! ✨';
            
            originalImg.src = data.person_image;
            resultImg.src = data.result_image;
            currentResultImage = data.result_image;
            
            originalImg.classList.remove('zoomed');
            resultImg.classList.remove('zoomed');
            
            updateGarmentSelector();
            
            resultSection.style.display = 'block';
            setTimeout(() => {
                resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
        } else {
            throw new Error('Unexpected response from server');
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            showError('Request timed out. The server took too long to respond. Please try again.');
        } else {
            showError(error.message || 'An unexpected error occurred. Please try again.');
        }
        console.error('Try-on error:', error);
    } finally {
        loadingMsg.style.display = 'none';
        isProcessing = false;
        checkInputs();
    }
}

function updateGarmentSelector() {
    if (garmentImages.length <= 1) {
        garmentSelector.style.display = 'none';
        return;
    }
    
    garmentSelector.style.display = 'flex';
    garmentSelector.innerHTML = '<h3>🔄 Try Other Garments</h3>';
    
    garmentImages.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = document.createElement('img');
            img.src = e.target.result;
            img.alt = `Garment option ${index + 1}`;
            img.className = index === currentGarmentIndex ? 'active' : '';
            img.onclick = () => {
                if (isProcessing) return;
                currentGarmentIndex = index;
                tryOnGarment();
            };
            garmentSelector.appendChild(img);
        };
        reader.readAsDataURL(file);
    });
}

function toggleZoom(imgId) {
    const img = document.getElementById(imgId);
    const otherImgId = imgId === 'originalImg' ? 'resultImg' : 'originalImg';
    const otherImg = document.getElementById(otherImgId);
    
    // Remove zoom from other image
    otherImg.classList.remove('zoomed');
    
    // Toggle zoom on clicked image
    img.classList.toggle('zoomed');
}

function downloadImage() {
    if (!currentResultImage) {
        showError('No result image to download');
        return;
    }
    
    try {
        const link = document.createElement('a');
        link.href = currentResultImage;
        link.download = `virtual-tryon-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (error) {
        showError('Failed to download image. Please try right-clicking and saving the image.');
    }
}

function resetApp() {
    if (confirm('This will clear all images and results. Continue?')) {
        personImage = null;
        garmentImages = [];
        currentGarmentIndex = 0;
        currentResultImage = null;
        
        personInput.value = '';
        garmentInput.value = '';
        personPreview.innerHTML = '<div class="placeholder">No image selected</div>';
        garmentPreview.innerHTML = '<div class="placeholder">No image selected</div>';
        
        clearPersonBtn.style.display = 'none';
        clearGarmentBtn.style.display = 'none';
        resultSection.style.display = 'none';
        
        hideError();
        checkInputs();
        
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // ESC to close zoom
    if (e.key === 'Escape') {
        originalImg.classList.remove('zoomed');
        resultImg.classList.remove('zoomed');
    }
    
    // Ctrl/Cmd + Enter to try on
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !tryOnBtn.disabled) {
        tryOnGarment();
    }
});

// Prevent accidental page unload during processing
window.addEventListener('beforeunload', (e) => {
    if (isProcessing) {
        e.preventDefault();
        e.returnValue = '';
    }
});

// Initialize
checkInputs();

/**
 * Canvas Translator - Upload Form Handler
 */

// API endpoint from config (loaded in HTML before this script)
const API_URL = window.CONFIG?.API_URL || 'https://canvas-translator-api.plax-labs.workers.dev';

// Elements
const form = document.getElementById('uploadForm');
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('file');
const fileInfo = document.getElementById('fileInfo');
const submitBtn = document.getElementById('submitBtn');
const successMessage = document.getElementById('successMessage');
const errorMessage = document.getElementById('errorMessage');

let selectedFile = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  setupDropZone();
  setupForm();
});

/**
 * Setup drag & drop file upload
 */
function setupDropZone() {
  // Click to browse
  dropZone.addEventListener('click', () => fileInput.click());

  // Drag events
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  });

  // File input change
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileSelect(e.target.files[0]);
    }
  });
}

/**
 * Handle file selection
 */
function handleFileSelect(file) {
  // Validate file type
  if (!file.name.endsWith('.json')) {
    showError('Please select a JSON file');
    return;
  }

  // Validate file size (max 10MB)
  if (file.size > 10 * 1024 * 1024) {
    showError('File too large. Maximum size is 10MB.');
    return;
  }

  selectedFile = file;

  // Show file info
  fileInfo.querySelector('.file-name').textContent = file.name;
  fileInfo.hidden = false;
  dropZone.style.display = 'none';
}

/**
 * Remove selected file
 */
function removeFile() {
  selectedFile = null;
  fileInput.value = '';
  fileInfo.hidden = true;
  dropZone.style.display = 'block';
}

// Expose to global scope for onclick
window.removeFile = removeFile;

/**
 * Setup form submission
 */
function setupForm() {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Validate
    if (!selectedFile) {
      showError('Please select a canvas JSON file');
      return;
    }

    const targetLang = form.querySelector('input[name="targetLang"]:checked');
    if (!targetLang) {
      showError('Please select a target language');
      return;
    }

    const email = form.email.value.trim();
    if (!email) {
      showError('Please enter your email address');
      return;
    }

    // Show loading state
    setLoading(true);

    try {
      // Read file as base64
      const fileContent = await readFileAsBase64(selectedFile);

      // Build request body
      const body = {
        canvasJson: fileContent,
        targetLang: targetLang.value,
        email: email,
      };

      // Add optional UID
      const userUid = form.userUid.value.trim();
      if (userUid) {
        if (!/^[a-f0-9]{24}$/i.test(userUid)) {
          showError('Invalid User UID format. Must be 24-character hex string.');
          setLoading(false);
          return;
        }
        body.userUid = userUid;
      }

      // Submit request
      const response = await fetch(`${API_URL}/api/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const result = await response.json();

      if (result.success) {
        showSuccess(result);
      } else {
        showError(result.error || result.errors?.join(', ') || 'Submission failed');
      }
    } catch (error) {
      console.error('Submit error:', error);
      showError('Failed to submit request. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  });
}

/**
 * Read file as base64
 */
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Set loading state
 */
function setLoading(loading) {
  submitBtn.disabled = loading;
  submitBtn.querySelector('.btn-text').hidden = loading;
  submitBtn.querySelector('.btn-loading').hidden = !loading;
}

/**
 * Show success message
 */
function showSuccess(result) {
  form.hidden = true;
  successMessage.hidden = false;
  errorMessage.hidden = true;

  document.getElementById('resultRequestId').textContent = result.requestId;

  // Update status link
  const statusLink = document.getElementById('statusLink');
  statusLink.href = `status.html?id=${result.requestId}`;
}

/**
 * Show error message
 */
function showError(message) {
  form.hidden = true;
  successMessage.hidden = true;
  errorMessage.hidden = false;

  document.getElementById('errorText').textContent = message;
}

/**
 * Reset form
 */
function resetForm() {
  form.reset();
  removeFile();
  form.hidden = false;
  successMessage.hidden = true;
  errorMessage.hidden = true;
}

// Expose to global scope for onclick
window.resetForm = resetForm;

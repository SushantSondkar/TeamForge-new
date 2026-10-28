/**
 * Profile Page Interactivity (CSP-safe, external script)
 */
document.addEventListener('DOMContentLoaded', () => {
    const unlinkForm = document.getElementById('form-unlink-github');
    if (unlinkForm) {
        unlinkForm.addEventListener('submit', (e) => {
            if (!confirm('Disconnect your GitHub account?')) {
                e.preventDefault();
            }
        });
    }

    const progressFill = document.querySelector('.comp-progress-fill');
    if (progressFill && progressFill.dataset.progress) {
        progressFill.style.width = progressFill.dataset.progress + '%';
    }
});

/**
 * Feedback Page Interactivity (CSP-safe, external script)
 */
document.addEventListener('DOMContentLoaded', () => {
    const radios = document.querySelectorAll('input[name="rating"]');
    const capEl = document.getElementById('ratingCaption');

    const captions = {
        "1": "1 Star · Needs Improvement",
        "2": "2 Stars · Fair",
        "3": "3 Stars · Good",
        "4": "4 Stars · Very Good",
        "5": "5 Stars · Excellent!"
    };

    radios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            const val = e.target.value;
            if (capEl) capEl.textContent = captions[val] || '';
        });
    });
});

// Team Requirement Wizard Interactivity
document.addEventListener('DOMContentLoaded', () => {

    // -------------------------------------------------------------
    // 1. STEP 1 (Context): Option Card Selection
    // -------------------------------------------------------------
    const optionCards = document.querySelectorAll('.option-card');
    optionCards.forEach(card => {
        card.addEventListener('click', () => {
            optionCards.forEach(c => {
                c.classList.remove('selected');
                const radio = c.querySelector('input[type="radio"]');
                const selectText = c.querySelector('.select-text');
                const iconBox = c.querySelector('.icon-box');
                if (selectText) selectText.textContent = 'Click to select';
                if (iconBox) {
                    iconBox.style.color = '#4b5563';
                    iconBox.style.backgroundColor = '#f3f4f6';
                }
            });

            card.classList.add('selected');
            const checkedRadio = card.querySelector('input[type="radio"]');
            if (checkedRadio) checkedRadio.checked = true;

            const activeText = card.querySelector('.select-text');
            const activeIcon = card.querySelector('.icon-box');
            if (activeText) activeText.textContent = 'Selected';
            if (activeIcon) {
                activeIcon.style.color = '#3b82f6';
                activeIcon.style.backgroundColor = '#eff6ff';
            }
        });
    });

    // -------------------------------------------------------------
    // 2. STEP 3 (Open Roles): Add, Remove, and Serialize Roles
    // -------------------------------------------------------------
    const openRolesForm = document.querySelector('.open-roles-form');
    const rolesContainer = document.getElementById('roles-container');
    const addRoleBtn = document.getElementById('btn-add-role');

    // Helper: update numbering on all role cards and toggle remove buttons
    function updateRoleNumbers() {
        const cards = document.querySelectorAll('.role-profile-card');
        cards.forEach((card, idx) => {
            const numBadge = card.querySelector('.role-number');
            if (numBadge) {
                numBadge.textContent = idx + 1;
                if (idx > 0) {
                    numBadge.style.backgroundColor = '#dbeafe';
                    numBadge.style.color = '#2563eb';
                } else {
                    numBadge.style.backgroundColor = '';
                    numBadge.style.color = '';
                }
            }

            const removeBtn = card.querySelector('.btn-remove-role');
            if (removeBtn) {
                removeBtn.style.display = cards.length > 1 ? 'inline-block' : 'none';
            }
        });
    }

    // Helper: gather all roles from DOM into an array of objects
    function gatherRoles() {
        const cards = document.querySelectorAll('.role-profile-card');
        const roles = [];

        cards.forEach(card => {
            const titleInput = card.querySelector('.role-title-input');
            const title = titleInput ? titleInput.value.trim() : '';

            // Required Skills
            const reqContainer = card.querySelector('.required-skills-container');
            const reqSkills = [];
            if (reqContainer) {
                reqContainer.querySelectorAll('.skill-tag').forEach(tag => {
                    const text = tag.textContent.replace('×', '').trim();
                    if (text) reqSkills.push(text);
                });
                // Include pending uncommitted text in input
                const pendingInput = reqContainer.querySelector('.skill-input-transparent');
                if (pendingInput && pendingInput.value.trim()) {
                    reqSkills.push(pendingInput.value.trim());
                }
            }

            // Preferred Skills
            const prefContainer = card.querySelector('.preferred-skills-container');
            const prefSkills = [];
            if (prefContainer) {
                prefContainer.querySelectorAll('.skill-tag').forEach(tag => {
                    const text = tag.textContent.replace('×', '').trim();
                    if (text) prefSkills.push(text);
                });
                const pendingInput = prefContainer.querySelector('.skill-input-transparent');
                if (pendingInput && pendingInput.value.trim()) {
                    prefSkills.push(pendingInput.value.trim());
                }
            }

            const profSelect = card.querySelector('.role-proficiency-select');
            const proficiency = profSelect ? profSelect.value : 'Intermediate';

            const openingsInput = card.querySelector('.role-openings-input');
            const openings = openingsInput ? (parseInt(openingsInput.value, 10) || 1) : 1;

            if (title || reqSkills.length > 0) {
                roles.push({
                    title,
                    requiredSkills: reqSkills,
                    preferredSkills: prefSkills,
                    proficiency,
                    openings
                });
            }
        });

        return roles;
    }

    // Add another role card
    if (addRoleBtn && rolesContainer) {
        addRoleBtn.addEventListener('click', () => {
            const count = document.querySelectorAll('.role-profile-card').length + 1;
            const newCard = document.createElement('div');
            newCard.className = 'role-profile-card';
            newCard.innerHTML = `
                <div class="role-profile-header">
                    <div class="role-profile-title">
                        <span class="role-number" style="background-color: #dbeafe; color: #2563eb;">${count}</span>
                        <strong>Role Profile</strong>
                    </div>
                    <div class="role-profile-meta" style="display: flex; align-items: center; gap: 12px;">
                        <span class="badge badge-success-light">Urgency: Open</span>
                        <button type="button" class="btn-remove-role" style="background: none; border: none; color: #ef4444; font-size: 13px; font-weight: 600; cursor: pointer;">Remove</button>
                    </div>
                </div>

                <div class="form-group-new">
                    <label>Role Title</label>
                    <input type="text" placeholder="e.g. React Developer" class="form-control-new role-title-input" required>
                </div>

                <div class="form-group-new">
                    <label>Required Skills (Press Enter to add)</label>
                    <div class="skills-input-container required-skills-container">
                        <input type="text" placeholder="+ Add skill (press Enter)" class="skill-input-transparent">
                    </div>
                </div>

                <div class="form-group-new">
                    <label>Preferred Skills (Optional, Press Enter to add)</label>
                    <div class="skills-input-container preferred-skills-container">
                        <input type="text" placeholder="+ Add skill (press Enter)" class="skill-input-transparent">
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                    <div class="form-group-new">
                        <label>Minimum Proficiency</label>
                        <select class="form-control-new role-proficiency-select">
                            <option value="Intermediate">Intermediate</option>
                            <option value="Advanced">Advanced</option>
                            <option value="Expert">Expert</option>
                        </select>
                    </div>

                    <div class="form-group-new">
                        <label>Openings</label>
                        <input type="number" min="1" max="10" value="1" class="form-control-new role-openings-input">
                    </div>
                </div>
            `;

            rolesContainer.appendChild(newCard);
            updateRoleNumbers();
        });
    }

    // Remove role card delegation
    if (rolesContainer) {
        rolesContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('btn-remove-role')) {
                const card = e.target.closest('.role-profile-card');
                if (card) {
                    card.remove();
                    updateRoleNumbers();
                }
            }
        });
    }

    // Dynamic Skill Tag Addition: press Enter or comma
    document.body.addEventListener('keydown', (e) => {
        if (e.target.classList.contains('skill-input-transparent') && (e.key === 'Enter' || e.key === ',')) {
            e.preventDefault();
            const val = e.target.value.replace(/,/g, '').trim();
            if (val) {
                const tag = document.createElement('div');
                tag.className = 'skill-tag';
                tag.innerHTML = `${val} <button type="button">×</button>`;
                e.target.parentElement.insertBefore(tag, e.target);
                e.target.value = '';
            }
        }
    });

    // Remove skill tag delegation
    document.body.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON' && e.target.textContent === '×' && e.target.closest('.skill-tag')) {
            e.target.closest('.skill-tag').remove();
        }
    });

    // Form submission serialization
    if (openRolesForm) {
        openRolesForm.addEventListener('submit', (e) => {
            const submitter = e.submitter;
            const isGoingBack = submitter && submitter.getAttribute('formaction') && submitter.getAttribute('formaction').includes('define-team');

            const roles = gatherRoles();
            const rolesJsonInput = document.getElementById('rolesJson');

            if (rolesJsonInput) {
                rolesJsonInput.value = JSON.stringify(roles);
            }

            // Only validate if continuing forward to Review
            if (!isGoingBack) {
                if (roles.length === 0) {
                    e.preventDefault();
                    alert('Please define at least one role with a title and skills.');
                    return;
                }

                for (let i = 0; i < roles.length; i++) {
                    if (!roles[i].title) {
                        e.preventDefault();
                        alert(`Please enter a title for Role ${i + 1}.`);
                        return;
                    }
                    if (!roles[i].requiredSkills || roles[i].requiredSkills.length === 0) {
                        e.preventDefault();
                        alert(`Please add at least one required skill for Role ${i + 1} (press Enter after typing each skill).`);
                        return;
                    }
                }
            }
        });
    }

    // Initial check of role numbers on load
    updateRoleNumbers();
});

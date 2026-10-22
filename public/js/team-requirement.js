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
                    numBadge.classList.add('secondary-role');
                    numBadge.style.backgroundColor = '#dbeafe';
                    numBadge.style.color = '#2563eb';
                } else {
                    numBadge.classList.remove('secondary-role');
                    numBadge.style.backgroundColor = '';
                    numBadge.style.color = '';
                }
            }

            const removeBtn = card.querySelector('.btn-remove-role');
            if (removeBtn) {
                if (cards.length > 1) {
                    removeBtn.classList.remove('is-hidden');
                    removeBtn.style.display = 'inline-block';
                } else {
                    removeBtn.classList.add('is-hidden');
                    removeBtn.style.display = 'none';
                }
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

    // -------------------------------------------------------------
    // 3. STEP 2 (Define Team): Add & Remove Existing Teammates
    // -------------------------------------------------------------
    const existingMembersInput = document.getElementById('existingMembersJson');
    const addMemberBtn = document.getElementById('btn-add-existing-member');
    const newMemberName = document.getElementById('new-member-name');
    const newMemberRole = document.getElementById('new-member-role');
    const additionalMembersList = document.getElementById('additional-members-list');
    const memberCountLabel = document.getElementById('member-count-label');

    if (existingMembersInput && additionalMembersList) {
        let members = [];
        try {
            members = JSON.parse(existingMembersInput.value || '[]');
            if (!Array.isArray(members)) members = [];
        } catch (e) {
            members = [];
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text || '';
            return div.innerHTML;
        }

        function renderMembers() {
            additionalMembersList.innerHTML = '';
            members.forEach((m, idx) => {
                const item = document.createElement('div');
                item.className = 'member-item-new';
                item.style.display = 'flex';
                item.style.alignItems = 'center';
                item.style.justifyContent = 'space-between';
                item.style.padding = '10px 14px';
                item.style.background = '#ffffff';
                item.style.border = '1px solid #cbd5e1';
                item.style.borderRadius = '8px';

                item.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='12' fill='%23e2e8f0'/%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z' fill='%239ca3af'/%3E%3C/svg%3E" alt="Avatar" style="width: 28px; height: 28px; border-radius: 50%;">
                        <div>
                            <strong style="color: #0f172a; font-size: 13.5px;">${escapeHtml(m.name)}</strong>
                            <span style="background: #f1f5f9; color: #475569; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 10px; margin-left: 6px;">${escapeHtml(m.role || 'Team Member')}</span>
                        </div>
                    </div>
                    <button type="button" class="btn-remove-member" data-index="${idx}" style="background: none; border: none; color: #ef4444; font-size: 18px; font-weight: bold; cursor: pointer; padding: 2px 8px; line-height: 1;" title="Remove Member">&times;</button>
                `;

                const removeBtn = item.querySelector('.btn-remove-member');
                removeBtn.addEventListener('click', () => {
                    members.splice(idx, 1);
                    existingMembersInput.value = JSON.stringify(members);
                    renderMembers();
                });

                additionalMembersList.appendChild(item);
            });

            if (memberCountLabel) {
                memberCountLabel.textContent = 1 + members.length;
            }
            existingMembersInput.value = JSON.stringify(members);
        }

        renderMembers();

        if (addMemberBtn && newMemberName) {
            addMemberBtn.addEventListener('click', () => {
                const name = newMemberName.value.trim();
                const role = (newMemberRole ? newMemberRole.value.trim() : '') || 'Team Member';

                if (!name) {
                    newMemberName.focus();
                    return;
                }

                members.push({ name, role });
                newMemberName.value = '';
                if (newMemberRole) newMemberRole.value = '';
                renderMembers();
            });

            newMemberName.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    addMemberBtn.click();
                }
            });

            if (newMemberRole) {
                newMemberRole.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        addMemberBtn.click();
                    }
                });
            }
        }
    }
});

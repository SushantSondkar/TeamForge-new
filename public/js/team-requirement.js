// Intercept form submission to gather skills and roles
document.addEventListener('DOMContentLoaded', () => {
    const openRolesForm = document.querySelector('.open-roles-form');
    
    if (openRolesForm) {
        openRolesForm.addEventListener('submit', (e) => {
            // We want to construct an array of role objects
            const roleCards = openRolesForm.querySelectorAll('.role-profile-card');
            const roles = [];

            roleCards.forEach(card => {
                const titleInput = card.querySelector('input[type="text"][value], input[type="text"]:not([placeholder="+ Add skill"])');
                const title = titleInput ? titleInput.value : '';

                // First container is Required Skills, Second is Preferred Skills
                const skillContainers = card.querySelectorAll('.skills-input-container');
                
                let requiredSkills = [];
                if (skillContainers[0]) {
                    const reqTags = skillContainers[0].querySelectorAll('.skill-tag');
                    reqTags.forEach(tag => requiredSkills.push(tag.textContent.replace('×', '').trim()));
                }

                let preferredSkills = [];
                if (skillContainers[1]) {
                    const prefTags = skillContainers[1].querySelectorAll('.skill-tag');
                    prefTags.forEach(tag => preferredSkills.push(tag.textContent.replace('×', '').trim()));
                }

                const proficiencySelect = card.querySelector('select');
                const proficiency = proficiencySelect ? proficiencySelect.value : 'Intermediate';

                roles.push({
                    title,
                    requiredSkills,
                    preferredSkills,
                    proficiency,
                    openings: 1
                });
            });

            // Create hidden input to hold JSON data
            const hiddenRoles = document.createElement('input');
            hiddenRoles.type = 'hidden';
            hiddenRoles.name = 'rolesJson';
            hiddenRoles.value = JSON.stringify(roles);
            openRolesForm.appendChild(hiddenRoles);
            
            // Remove name attributes from visible inputs to prevent cluttering req.body
            openRolesForm.querySelectorAll('input:not([type="hidden"]), select').forEach(el => el.removeAttribute('name'));
        });
    }

    // Logic to handle skill tag removal
    document.body.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON' && e.target.textContent === '×') {
            e.target.parentElement.remove();
        }
    });

    // Logic to handle adding skill tags on Enter key
    const skillInputs = document.querySelectorAll('.skill-input-transparent');
    skillInputs.forEach(input => {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const val = input.value.trim();
                if (val) {
                    const tag = document.createElement('div');
                    tag.className = 'skill-tag';
                    tag.innerHTML = `${val} <button type="button">×</button>`;
                    input.parentElement.insertBefore(tag, input);
                    input.value = '';
                }
            }
        });
    });
});

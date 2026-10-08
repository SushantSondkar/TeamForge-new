document.addEventListener('DOMContentLoaded', () => {

    // 1. Recommended Candidates - "Invite"
    const inviteButtons = document.querySelectorAll('.btn-invite-candidate');
    inviteButtons.forEach(btn => {
        btn.addEventListener('click', async function(e) {
            e.preventDefault();

            const receiverId = this.getAttribute('data-receiver-id');
            const teamRequirementId = this.getAttribute('data-team-id');
            const role = this.getAttribute('data-role');

            if (!receiverId || !teamRequirementId) {
                alert('Missing team or candidate information.');
                return;
            }

            const originalText = this.textContent;
            this.textContent = 'Sending...';
            this.disabled = true;

            try {
                const response = await fetch('/invites/send', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({
                        receiverId,
                        teamRequirementId,
                        role
                    })
                });

                const data = await response.json();

                if (response.ok && data.success) {
                    this.textContent = 'Invited';
                    this.style.backgroundColor = '#10b981'; // Green
                    this.style.borderColor = '#10b981';
                    this.disabled = true;
                } else {
                    alert(data.error || 'Failed to send invite.');
                    if (data.error && data.error.includes('already exists')) {
                        this.textContent = 'Invited';
                        this.style.backgroundColor = '#10b981';
                        this.style.borderColor = '#10b981';
                        this.disabled = true;
                    } else {
                        this.textContent = originalText;
                        this.disabled = false;
                    }
                }
            } catch (err) {
                console.error('Error sending invite:', err);
                alert('Network error sending invite.');
                this.textContent = originalText;
                this.disabled = false;
            }
        });
    });

    // 2. Recommended Opportunities - "Apply"
    const applyButtons = document.querySelectorAll('.btn-apply-opportunity');
    applyButtons.forEach(btn => {
        btn.addEventListener('click', async function(e) {
            e.preventDefault();

            const teamRequirementId = this.getAttribute('data-team-id');
            const role = this.getAttribute('data-role');

            if (!teamRequirementId || !role) {
                alert('Missing team or role information.');
                return;
            }

            const originalText = this.textContent;
            this.textContent = 'Applying...';
            this.disabled = true;

            try {
                const response = await fetch('/applications/apply', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({
                        teamRequirementId,
                        role
                    })
                });

                const data = await response.json();

                if (response.ok && data.success) {
                    this.textContent = 'Applied';
                    this.style.backgroundColor = '#10b981';
                    this.style.color = 'white';
                    this.style.borderColor = '#10b981';
                    this.disabled = true;

                    // Automatically update Pending Applications card in UI if present
                    const pendingCard = document.querySelector('.dashboard-grid-new > .dashboard-card-new:nth-child(5) .list-container');
                    if (pendingCard) {
                        const emptyItem = pendingCard.querySelector('.text-gray');
                        const teamName = this.closest('.list-item')?.querySelector('strong')?.textContent || 'Project Team';
                        const newItem = document.createElement('div');
                        newItem.className = 'list-item';
                        newItem.innerHTML = `
                            <div class="item-main">
                                <div class="item-details">
                                    <strong>${teamName}</strong>
                                    <div class="item-meta-row">
                                        <span class="text-gray">${role}</span>
                                    </div>
                                </div>
                            </div>
                            <span class="badge badge-warning">UNDER REVIEW</span>
                        `;
                        if (emptyItem) {
                            pendingCard.innerHTML = '';
                        }
                        pendingCard.prepend(newItem);
                    }
                } else {
                    alert(data.error || 'Failed to submit application.');
                    if (data.error && data.error.includes('already applied')) {
                        this.textContent = 'Applied';
                        this.style.backgroundColor = '#10b981';
                        this.style.color = 'white';
                        this.style.borderColor = '#10b981';
                        this.disabled = true;
                    } else {
                        this.textContent = originalText;
                        this.disabled = false;
                    }
                }
            } catch (err) {
                console.error('Error applying for opportunity:', err);
                alert('Network error submitting application.');
                this.textContent = originalText;
                this.disabled = false;
            }
        });
    });

    // 3. New Invites Received - "Accept" and "Decline"
    const invitesReceivedCard = document.querySelector('#invites-received-card') || document.querySelector('.dashboard-grid-new > .dashboard-card-new:nth-child(4)');
    if (invitesReceivedCard) {
        invitesReceivedCard.addEventListener('click', async function(e) {
            const acceptBtn = e.target.closest('.btn-accept-invite');
            const declineBtn = e.target.closest('.btn-decline-invite');
            
            if (acceptBtn) {
                e.preventDefault();
                const form = acceptBtn.closest('form');
                const listItem = acceptBtn.closest('.list-item');
                const actionsContainer = listItem.querySelector('.action-buttons-small');
                
                try {
                    const response = await fetch(form.action, {
                        method: 'POST',
                        headers: { 'Accept': 'application/json' }
                    });
                    if (response.ok) {
                        actionsContainer.innerHTML = '<span class="badge badge-success">ACCEPTED</span>';
                    } else {
                        alert('Error accepting invite.');
                    }
                } catch (err) {
                    console.error('Error accepting invite:', err);
                    form.submit(); // fallback to standard form submit
                }
            }
            
            if (declineBtn) {
                e.preventDefault();
                const form = declineBtn.closest('form');
                const listItem = declineBtn.closest('.list-item');
                const actionsContainer = listItem.querySelector('.action-buttons-small');
                
                try {
                    const response = await fetch(form.action, {
                        method: 'POST',
                        headers: { 'Accept': 'application/json' }
                    });
                    if (response.ok) {
                        actionsContainer.innerHTML = '<span class="badge badge-danger">DECLINED</span>';
                    } else {
                        alert('Error declining invite.');
                    }
                } catch (err) {
                    console.error('Error declining invite:', err);
                    form.submit(); // fallback to standard form submit
                }
            }
        });
    }

});

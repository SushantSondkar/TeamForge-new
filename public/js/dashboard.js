document.addEventListener('DOMContentLoaded', () => {

    // 1. Recommended Candidates - "Invite"
    const inviteButtons = document.querySelectorAll('.dashboard-grid-new > .dashboard-card-new:nth-child(1) .btn-small-primary');
    inviteButtons.forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            this.textContent = 'Invited';
            this.style.backgroundColor = '#10b981'; // Green color
            this.style.borderColor = '#10b981';
            this.disabled = true;
        });
    });

    // 2. Recommended Opportunities - "Apply"
    const applyButtons = document.querySelectorAll('.dashboard-grid-new > .dashboard-card-new:nth-child(2) .btn-small-outline');
    applyButtons.forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            this.textContent = 'Applied';
            this.style.backgroundColor = '#10b981';
            this.style.color = 'white';
            this.style.borderColor = '#10b981';
            this.disabled = true;
        });
    });

    // 3. New Invites Received - "Accept" and "Decline"
    const invitesReceivedCard = document.querySelector('.dashboard-grid-new > .dashboard-card-new:nth-child(5)');
    if (invitesReceivedCard) {
        invitesReceivedCard.addEventListener('click', function(e) {
            const acceptBtn = e.target.closest('.btn-small-primary');
            const declineBtn = e.target.closest('.btn-small-outline');
            
            if (acceptBtn) {
                e.preventDefault();
                const listItem = acceptBtn.closest('.list-item');
                const actionsContainer = listItem.querySelector('.action-buttons-small');
                actionsContainer.innerHTML = '<span class="badge badge-success">ACCEPTED</span>';
            }
            
            if (declineBtn) {
                e.preventDefault();
                const listItem = declineBtn.closest('.list-item');
                const actionsContainer = listItem.querySelector('.action-buttons-small');
                actionsContainer.innerHTML = '<span class="badge badge-danger">DECLINED</span>';
            }
        });
    }

});

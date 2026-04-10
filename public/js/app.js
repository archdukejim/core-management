document.addEventListener('DOMContentLoaded', () => {
  // Tab navigation
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`panel-${tab.dataset.panel}`).classList.add('active');
    });
  });

  // Load user info (if OIDC is active)
  api.get('/api/me').then(user => {
    if (user && user.name) {
      document.getElementById('user-display').textContent = user.name;
      document.getElementById('logout-btn').hidden = false;
    }
  }).catch(() => {});

  // Initialize panels
  dns.init();
  tsigPanel.init();
  certsPanel.init();
});

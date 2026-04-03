const certsPanel = {
  init() {
    document.getElementById('cert-is-ca').addEventListener('change', (e) => {
      document.getElementById('pathlen-group').hidden = !e.target.checked;
    });

    document.getElementById('mint-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.mint();
    });

    document.getElementById('btn-show-ca').addEventListener('click', () => this.showCACerts());

    document.querySelectorAll('[data-copy]').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = document.getElementById(btn.dataset.copy);
        navigator.clipboard.writeText(target.value).then(
          () => toast('Copied to clipboard', 'success'),
          () => toast('Failed to copy', 'error')
        );
      });
    });
  },

  async mint() {
    const cn = document.getElementById('cert-cn').value.trim();
    const sansRaw = document.getElementById('cert-sans').value.trim();
    const duration = document.getElementById('cert-duration').value.trim() || '8760h';
    const isCA = document.getElementById('cert-is-ca').checked;
    const pathLength = parseInt(document.getElementById('cert-pathlen').value, 10);

    const sans = sansRaw ? sansRaw.split(',').map(s => s.trim()).filter(Boolean) : undefined;

    const submitBtn = document.querySelector('#mint-form button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Minting...';

    try {
      const result = await api.post('/api/certs/mint', {
        commonName: cn,
        sans,
        duration,
        isCA,
        pathLength: isCA ? pathLength : undefined,
      });

      document.getElementById('result-cn').textContent = result.commonName;
      document.getElementById('result-cert').value = result.certificate;
      document.getElementById('result-key').value = result.privateKey;
      document.getElementById('result-chain').value = result.chain;
      document.getElementById('cert-result').hidden = false;

      toast('Certificate minted successfully', 'success');
    } catch (err) {
      toast('Failed to mint certificate: ' + err.message, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Mint Certificate';
    }
  },

  async showCACerts() {
    const container = document.getElementById('ca-certs');
    if (!container.hidden) {
      container.hidden = true;
      return;
    }
    try {
      const certs = await api.get('/api/certs/ca');
      document.getElementById('ca-root').value = certs.root;
      document.getElementById('ca-intermediate').value = certs.intermediate;
      container.hidden = false;
    } catch (err) {
      toast('Failed to load CA certificates: ' + err.message, 'error');
    }
  },
};

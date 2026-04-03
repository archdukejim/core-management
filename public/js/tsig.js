const tsigPanel = {
  async init() {
    document.getElementById('btn-add-tsig').addEventListener('click', () => this.showAddForm());
    await this.load();
  },

  async load() {
    await Promise.all([this.loadKeys(), this.loadGrants()]);
  },

  async loadKeys() {
    const tbody = document.querySelector('#tsig-table tbody');
    try {
      const keys = await api.get('/api/tsig/keys');
      if (keys.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No TSIG keys configured.</td></tr>';
        return;
      }
      tbody.innerHTML = keys.map(k => `
        <tr>
          <td class="mono">${esc(k.name)}</td>
          <td>${esc(k.algorithm)}</td>
          <td>
            <span class="secret-hidden" data-secret="${esc(k.secret)}">
              ****
              <span class="secret-toggle" onclick="tsigPanel.toggleSecret(this)">[show]</span>
            </span>
          </td>
          <td>
            <button class="btn btn-secondary btn-sm" onclick="tsigPanel.copyCredentials('${esc(k.name)}', '${esc(k.algorithm)}', '${esc(k.secret)}')">Copy RFC2136</button>
            <button class="btn btn-danger btn-sm" onclick="tsigPanel.deleteKey('${esc(k.name)}')">Delete</button>
          </td>
        </tr>
      `).join('');
    } catch (err) {
      toast('Failed to load TSIG keys: ' + err.message, 'error');
    }
  },

  async loadGrants() {
    const tbody = document.querySelector('#grants-table tbody');
    try {
      const grants = await api.get('/api/tsig/grants');
      if (grants.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No grants configured.</td></tr>';
        return;
      }
      tbody.innerHTML = grants.map(g => `
        <tr>
          <td class="mono">${esc(g.keyName)}</td>
          <td>${esc(g.zone)}</td>
          <td>${esc(g.matchType)}</td>
          <td class="mono">${esc(g.name || '')}</td>
          <td>${esc(g.recordTypes)}</td>
        </tr>
      `).join('');
    } catch (err) {
      toast('Failed to load grants: ' + err.message, 'error');
    }
  },

  toggleSecret(el) {
    const span = el.parentElement;
    const secret = span.dataset.secret;
    if (el.textContent === '[show]') {
      span.innerHTML = `<code class="mono">${esc(secret)}</code> <span class="secret-toggle" onclick="tsigPanel.toggleSecret(this)">[hide]</span>`;
    } else {
      span.innerHTML = `**** <span class="secret-toggle" onclick="tsigPanel.toggleSecret(this)">[show]</span>`;
    }
    span.dataset.secret = secret;
  },

  copyCredentials(name, algorithm, secret) {
    const algMap = { 'hmac-sha256': 'HMAC-SHA256', 'hmac-sha512': 'HMAC-SHA512' };
    const text = `dns_rfc2136_server = BIND9_HOST\ndns_rfc2136_port = 53\ndns_rfc2136_name = ${name}\ndns_rfc2136_secret = ${secret}\ndns_rfc2136_algorithm = ${algMap[algorithm] || algorithm}`;
    navigator.clipboard.writeText(text).then(
      () => toast('RFC2136 credentials copied', 'success'),
      () => toast('Failed to copy to clipboard', 'error')
    );
  },

  showAddForm() {
    showModal('Add TSIG Key', `
      <form id="add-tsig-form">
        <div class="form-group">
          <label>Key Name</label>
          <input type="text" id="new-tsig-name" placeholder="e.g. certbot-key" required>
        </div>
        <div class="form-group">
          <label>Zone Grants <span class="hint">(comma-separated, optional)</span></label>
          <input type="text" id="new-tsig-zones" placeholder="e.g. home, example.com">
        </div>
        <div class="form-group">
          <label>Match Type</label>
          <select id="new-tsig-match">
            <option value="zonesub">zonesub (entire zone)</option>
            <option value="name">name (specific name)</option>
            <option value="subdomain">subdomain</option>
          </select>
        </div>
        <div class="form-group">
          <label>Record Types</label>
          <input type="text" id="new-tsig-rectypes" value="ANY" placeholder="e.g. ANY, TXT, A">
        </div>
        <div class="form-group" id="grant-name-group" hidden>
          <label>Grant Name <span class="hint">(for name/subdomain match type)</span></label>
          <input type="text" id="new-tsig-grantname" placeholder="e.g. _acme-challenge.home.">
        </div>
        <button type="submit" class="btn btn-primary">Create Key</button>
      </form>
    `);

    document.getElementById('new-tsig-match').addEventListener('change', (e) => {
      document.getElementById('grant-name-group').hidden = e.target.value === 'zonesub';
    });

    document.getElementById('add-tsig-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('new-tsig-name').value.trim();
      const zonesRaw = document.getElementById('new-tsig-zones').value.trim();
      const zones = zonesRaw ? zonesRaw.split(',').map(z => z.trim()).filter(Boolean) : [];
      const matchType = document.getElementById('new-tsig-match').value;
      const recordTypes = document.getElementById('new-tsig-rectypes').value.trim() || 'ANY';
      const grantName = document.getElementById('new-tsig-grantname')?.value.trim();

      try {
        const key = await api.post('/api/tsig/keys', { name, zones, matchType, recordTypes, grantName });
        toast(`Key "${key.name}" created`, 'success');
        closeModal();
        await this.load();
      } catch (err) {
        toast('Failed to create key: ' + err.message, 'error');
      }
    });
  },

  async deleteKey(name) {
    if (!confirm(`Delete TSIG key "${name}" and all its grants?`)) return;
    try {
      await api.del(`/api/tsig/keys/${name}`);
      toast(`Key "${name}" deleted`, 'success');
      await this.load();
    } catch (err) {
      toast('Failed to delete key: ' + err.message, 'error');
    }
  },
};

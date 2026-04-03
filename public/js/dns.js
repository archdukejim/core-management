const dns = {
  zones: [],

  async init() {
    await this.loadZones();
    document.getElementById('zone-selector').addEventListener('change', () => this.loadRecords());
    document.getElementById('btn-refresh-records').addEventListener('click', () => this.loadRecords());
    document.getElementById('btn-add-record').addEventListener('click', () => this.showAddForm());
  },

  async loadZones() {
    try {
      this.zones = await api.get('/api/dns/zones');
      const sel = document.getElementById('zone-selector');
      sel.innerHTML = this.zones.map(z =>
        `<option value="${z.name}">${z.name}</option>`
      ).join('');
      if (this.zones.length > 0) await this.loadRecords();
    } catch (err) {
      toast('Failed to load zones: ' + err.message, 'error');
    }
  },

  async loadRecords() {
    const zone = document.getElementById('zone-selector').value;
    if (!zone) return;

    const tbody = document.querySelector('#records-table tbody');
    const empty = document.getElementById('records-empty');
    tbody.innerHTML = '<tr><td colspan="5" class="loading">Loading...</td></tr>';

    try {
      const records = await api.get(`/api/dns/zones/${zone}/records`);
      empty.hidden = records.length > 0;

      if (records.length === 0) {
        tbody.innerHTML = '';
        return;
      }

      tbody.innerHTML = records.map(r => `
        <tr>
          <td class="mono">${esc(r.name)}</td>
          <td>${r.ttl}</td>
          <td><span class="type-badge">${esc(r.type)}</span></td>
          <td class="mono">${esc(r.data)}</td>
          <td>
            <button class="btn btn-danger btn-sm" onclick="dns.deleteRecord('${esc(r.name)}', '${esc(r.type)}', '${esc(r.data)}')">Delete</button>
          </td>
        </tr>
      `).join('');
    } catch (err) {
      tbody.innerHTML = '';
      toast('Failed to load records: ' + err.message, 'error');
    }
  },

  showAddForm() {
    const zone = document.getElementById('zone-selector').value;
    const zones = this.zones.map(z =>
      `<option value="${z.name}" ${z.name === zone ? 'selected' : ''}>${z.name}</option>`
    ).join('');

    showModal('Add DNS Record', `
      <form id="add-record-form">
        <div class="form-group">
          <label>Zone</label>
          <select id="new-rec-zone">${zones}</select>
        </div>
        <div class="form-group">
          <label>Name</label>
          <input type="text" id="new-rec-name" placeholder="e.g. www" required>
        </div>
        <div class="form-group">
          <label>Type</label>
          <select id="new-rec-type">
            <option>A</option>
            <option>AAAA</option>
            <option>CNAME</option>
            <option>MX</option>
            <option>TXT</option>
            <option>SRV</option>
            <option>PTR</option>
            <option>CAA</option>
          </select>
        </div>
        <div class="form-group">
          <label>TTL</label>
          <input type="number" id="new-rec-ttl" value="86400" min="60">
        </div>
        <div class="form-group">
          <label>Data</label>
          <input type="text" id="new-rec-data" placeholder="e.g. 10.0.0.1" required>
        </div>
        <button type="submit" class="btn btn-primary">Add Record</button>
      </form>
    `);

    document.getElementById('add-record-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const zone = document.getElementById('new-rec-zone').value;
      const name = document.getElementById('new-rec-name').value.trim();
      const type = document.getElementById('new-rec-type').value;
      const ttl = parseInt(document.getElementById('new-rec-ttl').value, 10);
      const data = document.getElementById('new-rec-data').value.trim();

      try {
        await api.post(`/api/dns/zones/${zone}/records`, { name, type, ttl, data });
        toast('Record added successfully', 'success');
        closeModal();
        document.getElementById('zone-selector').value = zone;
        await this.loadRecords();
      } catch (err) {
        toast('Failed to add record: ' + err.message, 'error');
      }
    });
  },

  async deleteRecord(name, type, data) {
    if (!confirm(`Delete ${type} record "${name}" -> ${data}?`)) return;
    const zone = document.getElementById('zone-selector').value;
    try {
      await api.del(`/api/dns/zones/${zone}/records`, { name, type, data });
      toast('Record deleted', 'success');
      await this.loadRecords();
    } catch (err) {
      toast('Failed to delete record: ' + err.message, 'error');
    }
  },
};

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
